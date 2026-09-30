/**
 * Mock → API-shape adapters for the no-backend fallback.
 *
 * The generated types in `~/types/api` win every disagreement (see the report):
 * these functions reshape the Phase 1 fixtures into that shape so the fallback
 * path feeds the same API-typed components as the live path. Nothing here is
 * authoritative — delete it when the backend is assumed present.
 */
import type { ApiHotelCard, ApiHotelDetail, ApiHotelImage, ApiHotelRoom } from '~/utils/api'
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
