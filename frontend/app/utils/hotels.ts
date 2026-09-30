/**
 * Hotel search domain: the query-string codec and the pure filter/sort pipeline.
 *
 * The query string is the ONLY source of truth for the list page's filter state. A
 * shared or reloaded URL has to reproduce the exact result set, so parsing and
 * serialising live here, together, and round-trip losslessly.
 *
 * Pure and Vue-free, so it is testable without a component. T17b replaces
 * `searchHotels` with a `$fetch` call and leaves the codec alone.
 */
import { AMENITIES, BOOKINGS, HOTELS, nightsBetween } from '~/utils/mock'
import type { BookingStatus, MockHotel } from '~/utils/mock/types'
import type { LocationQuery, LocationQueryRaw } from 'vue-router'

export type HotelSort = 'recommended' | 'price-asc' | 'price-desc' | 'rating' | 'name'

export const HOTEL_SORTS: HotelSort[] = [
  'recommended',
  'price-asc',
  'price-desc',
  'rating',
  'name',
]

/** Star options are the values that actually exist in the fixtures. */
export const HOTEL_STAR_OPTIONS = [3, 4, 5]

export const MIN_GUESTS = 1
export const MAX_GUESTS = 20
export const DEFAULT_GUESTS = 2

export const HOTEL_PAGE_SIZE = 6

export interface HotelFilterState {
  city: string
  checkIn: string
  checkOut: string
  guests: number
  minPrice: number | null
  maxPrice: number | null
  amenities: string[]
  stars: number[]
}

export interface HotelQueryState {
  filters: HotelFilterState
  sort: HotelSort
  page: number
}

export const DEFAULT_HOTEL_FILTERS: HotelFilterState = {
  city: '',
  checkIn: '',
  checkOut: '',
  guests: DEFAULT_GUESTS,
  minPrice: null,
  maxPrice: null,
  amenities: [],
  stars: [],
}

/**
 * Slider bounds come from the fixtures, rounded outward to a clean step, so the
 * control can never offer a price that excludes every property in the set.
 */
const nightlyRates = HOTELS.flatMap(hotel => hotel.rooms.map(room => room.pricePerNightCents / 100))
export const PRICE_STEP = 10
export const PRICE_MIN = Math.floor(Math.min(...nightlyRates) / PRICE_STEP) * PRICE_STEP
export const PRICE_MAX = Math.ceil(Math.max(...nightlyRates) / PRICE_STEP) * PRICE_STEP

const collator = new Intl.Collator('en')
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function firstValue(value: LocationQuery[string] | undefined): string {
  const first = Array.isArray(value) ? value[0] : value
  return typeof first === 'string' ? first : ''
}

function integerBetween(value: string, min: number, max: number, fallback: number): number {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

function stayDate(value: string): string {
  return DATE_PATTERN.test(value) ? value : ''
}

function csvIn(value: string, allowed: Set<string>): string[] {
  return value
    .split(',')
    .map(entry => entry.trim())
    .filter(entry => allowed.has(entry))
}

function priceOrNull(value: string): number | null {
  if (value === '') return null
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) return null
  return Math.min(PRICE_MAX, Math.max(PRICE_MIN, parsed))
}

export function parseHotelQuery(query: LocationQuery): HotelQueryState {
  const minPrice = priceOrNull(firstValue(query.min))
  const maxPrice = priceOrNull(firstValue(query.max))
  const inverted = minPrice !== null && maxPrice !== null && minPrice > maxPrice
  const sort = firstValue(query.sort)

  return {
    filters: {
      city: firstValue(query.city).trim().slice(0, 80),
      checkIn: stayDate(firstValue(query.checkIn)),
      checkOut: stayDate(firstValue(query.checkOut)),
      guests: integerBetween(firstValue(query.guests), MIN_GUESTS, MAX_GUESTS, DEFAULT_GUESTS),
      // A shared link with min > max is a hand-edited URL, not a user intent worth
      // failing on. Swap it so the control and the result set agree.
      minPrice: inverted ? maxPrice : minPrice,
      maxPrice: inverted ? minPrice : maxPrice,
      amenities: csvIn(firstValue(query.amenities), new Set(AMENITIES.map(a => a.id))),
      stars: csvIn(firstValue(query.stars), new Set(HOTEL_STAR_OPTIONS.map(String))).map(Number),
    },
    sort: HOTEL_SORTS.includes(sort as HotelSort) ? (sort as HotelSort) : 'recommended',
    page: integerBetween(firstValue(query.page), 1, 9999, 1),
  }
}

export function buildHotelQuery(state: HotelQueryState): LocationQueryRaw {
  const { filters, sort, page } = state
  return {
    ...(filters.city ? { city: filters.city } : {}),
    ...(filters.checkIn ? { checkIn: filters.checkIn } : {}),
    ...(filters.checkOut ? { checkOut: filters.checkOut } : {}),
    ...(filters.guests !== DEFAULT_GUESTS ? { guests: String(filters.guests) } : {}),
    ...(filters.minPrice !== null ? { min: String(filters.minPrice) } : {}),
    ...(filters.maxPrice !== null ? { max: String(filters.maxPrice) } : {}),
    ...(filters.amenities.length ? { amenities: [...filters.amenities].sort().join(',') } : {}),
    ...(filters.stars.length ? { stars: [...filters.stars].sort((a, b) => a - b).join(',') } : {}),
    ...(sort !== 'recommended' ? { sort } : {}),
    ...(page > 1 ? { page: String(page) } : {}),
  }
}

export function cheapestNightlyCents(hotel: MockHotel): number | null {
  if (!hotel.rooms.length) return null
  return Math.min(...hotel.rooms.map(room => room.pricePerNightCents))
}

/** Statuses that occupy a room. A cancelled booking returns its inventory. */
const OCCUPYING: BookingStatus[] = ['PENDING', 'CONFIRMED']

/** Half-open overlap, per D2: back-to-back stays on one room never collide. */
function overlappingBookings(roomId: string, checkIn: string, checkOut: string): number {
  return BOOKINGS.filter(
    booking =>
      OCCUPYING.includes(booking.status)
      && booking.roomId === roomId
      && booking.checkIn < checkOut
      && checkIn < booking.checkOut,
  ).length
}

function fitsStay(hotel: MockHotel, filters: HotelFilterState): boolean {
  if (!filters.checkIn || !filters.checkOut) return true
  if (nightsBetween(filters.checkIn, filters.checkOut) < 1) return false
  return hotel.rooms.some(
    room =>
      room.maxGuests >= filters.guests
      && overlappingBookings(room.id, filters.checkIn, filters.checkOut) < room.totalInventory,
  )
}

function sortHotels(hotels: MockHotel[], sort: HotelSort): MockHotel[] {
  const price = (hotel: MockHotel): number => cheapestNightlyCents(hotel) ?? Number.MAX_SAFE_INTEGER
  const rating = (hotel: MockHotel): number => hotel.rating.average
  const byName = (a: MockHotel, b: MockHotel): number => collator.compare(a.name, b.name)

  return [...hotels].sort((a, b) => {
    switch (sort) {
      case 'price-asc':
        return price(a) - price(b) || byName(a, b)
      case 'price-desc':
        return price(b) - price(a) || byName(a, b)
      case 'name':
        return byName(a, b)
      default:
        // 'rating' and 'recommended' share an ordering; the recommendation score is
        // the rating with review count breaking ties, so a 9.9 out of 4 reviews does
        // not outrank a 9.1 out of 580.
        return rating(b) - rating(a) || b.rating.totalReviews - a.rating.totalReviews || byName(a, b)
    }
  })
}

export function searchHotels(
  filters: HotelFilterState,
  sort: HotelSort,
): { hotels: MockHotel[], total: number } {
  const needle = filters.city.trim().toLowerCase()

  const matched = HOTELS.filter(hotel => hotel.status === 'PUBLISHED').filter((hotel) => {
    if (needle) {
      const haystack = `${hotel.name} ${hotel.city} ${hotel.country}`.toLowerCase()
      if (!haystack.includes(needle)) return false
    }
    if (filters.stars.length && !filters.stars.includes(hotel.starRating)) return false
    if (!filters.amenities.every(id => hotel.amenityIds.includes(id))) return false

    const nightly = cheapestNightlyCents(hotel)
    if (filters.minPrice !== null && (nightly === null || nightly < filters.minPrice * 100)) return false
    if (filters.maxPrice !== null && (nightly === null || nightly > filters.maxPrice * 100)) return false

    if (!hotel.rooms.some(room => room.maxGuests >= filters.guests)) return false
    return fitsStay(hotel, filters)
  })

  return { hotels: sortHotels(matched, sort), total: matched.length }
}

/** How many filters are narrowing the result set, for the drawer button and empty state. */
export function activeFilterCount(filters: HotelFilterState): number {
  let count = 0
  if (filters.city) count += 1
  if (filters.checkIn || filters.checkOut) count += 1
  if (filters.guests !== DEFAULT_GUESTS) count += 1
  if (filters.minPrice !== null || filters.maxPrice !== null) count += 1
  count += filters.amenities.length
  count += filters.stars.length
  return count
}
