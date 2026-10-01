/**
 * Mock → API-shape adapters for the no-backend fallback.
 *
 * The generated types in `~/types/api` win every disagreement (see the report):
 * these functions reshape the Phase 1 fixtures into that shape so the fallback
 * path feeds the same API-typed components as the live path. Nothing here is
 * authoritative — delete it when the backend is assumed present.
 */
import type { ApiHotelCard, ApiHotelDetail, ApiHotelImage, ApiHotelRoom, ApiQuoteData } from '~/utils/api'
import { quote } from '~/utils/mock'
import { stayNights } from '~/utils/date'
import type { MockHotel, MockImage, MockRoom } from '~/utils/mock/types'

const IMAGE_DIMS: Record<MockImage['aspect'], { width: number, height: number }> = {
  '3:2': { width: 800, height: 533 },
  '4:3': { width: 800, height: 600 },
  '16:9': { width: 1200, height: 675 },
  '1:1': { width: 400, height: 400 },
}

export function mockImageToApi(image: MockImage): ApiHotelImage {
  const dims = IMAGE_DIMS[image.aspect]
  return {
    url: image.url,
    altText: image.alt,
    aspect: image.aspect,
    width: dims.width,
    height: dims.height,
  }
}

function cheapestCents(hotel: MockHotel): number | null {
  if (hotel.rooms.length === 0) return null
  return Math.min(...hotel.rooms.map(room => room.pricePerNightCents))
}

export function mockHotelToCard(hotel: MockHotel): ApiHotelCard {
  const cheapest = cheapestCents(hotel)
  return {
    id: hotel.id,
    slug: hotel.slug,
    name: hotel.name,
    city: hotel.city,
    country: hotel.country,
    starRating: hotel.starRating,
    coverImage: hotel.images[0] ? mockImageToApi(hotel.images[0]) : null,
    amenityIds: [...hotel.amenityIds],
    rating: { average: hotel.rating.average, totalReviews: hotel.rating.totalReviews },
    priceFrom: cheapest === null ? null : { amountCents: cheapest, currency: 'USD' },
    currency: 'USD',
  }
}

export function mockRoomToApi(room: MockRoom): ApiHotelRoom {
  return {
    id: room.id,
    name: room.name,
    description: room.description,
    bedType: room.bedType,
    maxGuests: room.maxGuests,
    totalInventory: room.totalInventory,
    price: { amountCents: room.pricePerNightCents, currency: room.currency },
    images: room.images.map(mockImageToApi),
  }
}

export function mockHotelToDetail(hotel: MockHotel): ApiHotelDetail {
  return {
    id: hotel.id,
    slug: hotel.slug,
    name: hotel.name,
    description: hotel.description,
    addressLine: hotel.addressLine,
    city: hotel.city,
    country: hotel.country,
    lat: hotel.lat,
    lng: hotel.lng,
    starRating: hotel.starRating,
    status: hotel.status,
    checkInTime: hotel.checkInTime,
    checkOutTime: hotel.checkOutTime,
    currency: 'USD',
    coverImage: hotel.images[0] ? mockImageToApi(hotel.images[0]) : null,
    images: hotel.images.map(mockImageToApi),
    amenityIds: [...hotel.amenityIds],
    rating: { average: hotel.rating.average, totalReviews: hotel.rating.totalReviews },
    rooms: hotel.rooms.map(mockRoomToApi),
    host: null,
  }
}

/** The API's advisory hold window, so the fixture's shape matches the live one. */
const MOCK_HOLD_MS = 15 * 60 * 1000

/**
 * Mock quote → `ApiQuoteData`, for the no-backend fallback on the booking page.
 *
 * The arithmetic is the fixtures' own `quote()` and stays in this layer — no component and
 * no page computes a total, which is the whole point of the T18 endpoint. The flat 10%
 * fee is the Phase 1 fixture's, kept so the mock booking pages and this panel agree with
 * each other; the live API returns zero until T20/T26 set a fee schedule.
 */
export function mockQuoteToApi(
  room: MockRoom,
  checkIn: string,
  checkOut: string,
): ApiQuoteData | null {
  const price = quote(room, checkIn, checkOut)
  if (!price) return null
  return {
    nights: price.nights,
    subtotalCents: price.subtotalCents,
    feesCents: price.feesCents,
    totalCents: price.totalCents,
    currency: price.currency,
    breakdown: stayNights(checkIn, price.nights).map(date => ({
      date,
      priceCents: price.nightlyCents,
    })),
    holdExpiresAt: new Date(Date.now() + MOCK_HOLD_MS).toISOString(),
  }
}
