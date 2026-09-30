import { CURRENT_USER, USERS } from './users'
import { AMENITIES } from './amenities'
import { HOTELS, HOTEL_BY_ID, HOTEL_BY_SLUG, REVIEWS } from './hotels'
import type { BookingStatus, MockBooking, MockHotel, MockHotelDetail, MockRoom } from './types'

export * from './types'
export { AMENITIES, AMENITY_BY_ID, image } from './amenities'
export { HOTELS, HOTEL_BY_ID, HOTEL_BY_SLUG, CITIES, REVIEWS } from './hotels'
export { USERS, CURRENT_USER } from './users'

export function getHotelDetail(slug: string): MockHotelDetail | undefined {
  const hotel = HOTEL_BY_SLUG.get(slug)
  if (!hotel) return undefined
  return { ...hotel, reviews: REVIEWS.filter(r => r.hotelId === hotel.id) }
}

export function getRooms(hotel: MockHotel): MockRoom[] {
  return hotel.rooms
}

const DAY_MS = 86_400_000

/** Half-open range, matching the availability rule in context/architecture.md. */
export function nightsBetween(checkIn: string, checkOut: string): number {
  const from = Date.parse(checkIn)
  const to = Date.parse(checkOut)
  if (Number.isNaN(from) || Number.isNaN(to) || to <= from) return 0
  return Math.round((to - from) / DAY_MS)
}

export interface PriceBreakdown {
  nights: number
  nightlyCents: number
  subtotalCents: number
  feesCents: number
  totalCents: number
  currency: 'USD'
}

/** Flat 10% service fee. Real tax/VAT is explicitly out of scope (see project-overview). */
const FEE_RATE = 0.1

export function quote(room: MockRoom, checkIn: string, checkOut: string): PriceBreakdown | null {
  const nights = nightsBetween(checkIn, checkOut)
  if (nights < 1) return null
  const subtotalCents = nights * room.pricePerNightCents
  const feesCents = Math.round(subtotalCents * FEE_RATE)
  return {
    nights,
    nightlyCents: room.pricePerNightCents,
    subtotalCents,
    feesCents,
    totalCents: subtotalCents + feesCents,
    currency: 'USD',
  }
}

function booking(
  partial: Pick<MockBooking, 'id' | 'reference' | 'hotelId' | 'roomId' | 'checkIn' | 'checkOut' | 'guestsCount' | 'status' | 'createdAt'>,
): MockBooking {
  const hotel = HOTEL_BY_ID.get(partial.hotelId)
  const room = hotel?.rooms.find(r => r.id === partial.roomId)
  if (!hotel || !room) throw new Error(`bad mock booking ${partial.id}`)
  const price = quote(room, partial.checkIn, partial.checkOut)
  if (!price) throw new Error(`bad mock booking dates ${partial.id}`)
  return {
    ...partial,
    guestName: CURRENT_USER.name,
    nights: price.nights,
    subtotalCents: price.subtotalCents,
    feesCents: price.feesCents,
    totalCents: price.totalCents,
    currency: 'USD',
  }
}

export const BOOKINGS: MockBooking[] = [
  booking({
    id: 'bkg_1',
    reference: 'HB-4821',
    hotelId: 'htl_larkspur',
    roomId: 'rm_larkspur_courtyard',
    checkIn: '2026-10-14',
    checkOut: '2026-10-18',
    guestsCount: 2,
    status: 'CONFIRMED',
    createdAt: '2026-08-02',
  }),
  booking({
    id: 'bkg_2',
    reference: 'HB-4834',
    hotelId: 'htl_nord',
    roomId: 'rm_nord_harbour',
    checkIn: '2026-11-20',
    checkOut: '2026-11-24',
    guestsCount: 2,
    status: 'PENDING',
    createdAt: '2026-09-14',
  }),
  booking({
    id: 'bkg_3',
    reference: 'HB-4790',
    hotelId: 'htl_casa_verde',
    roomId: 'rm_casaverde_patio',
    checkIn: '2026-04-03',
    checkOut: '2026-04-07',
    guestsCount: 2,
    status: 'COMPLETED',
    createdAt: '2026-02-11',
  }),
  booking({
    id: 'bkg_4',
    reference: 'HB-4702',
    hotelId: 'htl_bellavista',
    roomId: 'rm_bellavista_std',
    checkIn: '2026-12-30',
    checkOut: '2027-01-02',
    guestsCount: 1,
    status: 'CANCELLED',
    createdAt: '2025-12-19',
  }),
]

export function getBookingsForGuest(userId = CURRENT_USER.id): MockBooking[] {
  return userId === CURRENT_USER.id ? BOOKINGS : []
}

/**
 * Only the bookings on hotels this user actually owns. A host dashboard is scoped by
 * `hostId`, so a lookup that returned everything would show one host another host's
 * guests, names and stays.
 */
export function getBookingsForHost(hostId: string): MockBooking[] {
  return BOOKINGS.filter(b => HOTEL_BY_ID.get(b.hotelId)?.hostId === hostId)
}

export const STATUS_LABEL_KEY: Record<BookingStatus, string> = {
  PENDING: 'status.awaitingPayment',
  CONFIRMED: 'status.confirmed',
  COMPLETED: 'status.completed',
  CANCELLED: 'status.cancelled',
}

export const HOTEL_COUNT = HOTELS.length
export const AMENITY_COUNT = AMENITIES.length
export const USER_COUNT = USERS.length
