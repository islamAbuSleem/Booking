/**
 * Mock → API-shape adapter for the no-backend fallback on the booking pages.
 *
 * The same seam as `hotelAdapters.ts`: the live path and the fixture path feed the same
 * generated type (`ApiBooking`), so a page has one source of truth to render. Nothing
 * here is authoritative — delete it when the backend is assumed present.
 */
import type { ApiBooking } from '~/utils/api'
import { HOTEL_BY_ID } from '~/utils/mock'
import type { MockBooking } from '~/utils/mock/types'

export function mockBookingToApi(booking: MockBooking): ApiBooking {
  const hotel = HOTEL_BY_ID.get(booking.hotelId)
  const room = hotel?.rooms.find(r => r.id === booking.roomId)
  // The fixture helper in `~/utils/mock` throws for an unknown hotel or room, so a
  // well-formed record always resolves both; this guard is the type system's copy of
  // that invariant.
  if (!hotel || !room) throw new Error(`bad mock booking ${booking.id}`)
  return {
    id: booking.id,
    reference: booking.reference,
    status: booking.status,
    checkIn: booking.checkIn,
    checkOut: booking.checkOut,
    nights: booking.nights,
    guestsCount: booking.guestsCount,
    currency: booking.currency,
    subtotalCents: booking.subtotalCents,
    feesCents: booking.feesCents,
    totalCents: booking.totalCents,
    hotel: {
      id: hotel.id,
      slug: hotel.slug,
      name: hotel.name,
      city: hotel.city,
      country: hotel.country,
      addressLine: hotel.addressLine,
      coverImage: hotel.images[0]?.url ?? null,
    },
    room: { name: room.name },
    createdAt: booking.createdAt,
  }
}

/** The booking's cover image as a renderable URL, or `null` when there is none. */
export function bookingCoverImage(booking: ApiBooking): string | null {
  return booking.hotel.coverImage
}
