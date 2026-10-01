/**
 * Mock bookings store — the fallback source behind the booking pages since T20 wired
 * them to the real API: the index degrades to `getBookingsForGuest()`, the detail page
 * to `bookingById()`, and this store owns the fallback cancel.
 *
 * Local state only — the API is the primary source of truth, and this module is deleted
 * when the backend is assumed present.
 * Types are inferred from the fixtures (`typeof BOOKINGS`) so this shared
 * module never imports `~/utils/mock/types.ts`, which is a placeholder for
 * the generated API types.
 */
import { BOOKINGS } from '~/utils/mock'

export type MockBookingRecord = (typeof BOOKINGS)[number]

/** Tabs are driven by status. Anything occupying a room is upcoming. */
export function isUpcomingStatus(status: MockBookingRecord['status']): boolean {
  return status === 'PENDING' || status === 'CONFIRMED'
}

export function useBookings() {
  const bookings = useState<MockBookingRecord[]>('mock-bookings', () =>
    BOOKINGS.map(booking => ({ ...booking })),
  )

  const upcoming = computed(() => bookings.value.filter(booking => isUpcomingStatus(booking.status)))
  const past = computed(() => bookings.value.filter(booking => !isUpcomingStatus(booking.status)))

  function bookingById(id: string): MockBookingRecord | undefined {
    return bookings.value.find(booking => booking.id === id)
  }

  /**
   * Only a CONFIRMED stay can be cancelled — the API guards the same way (409
   * `INVALID_CANCEL_STATE` for any other status), so the fallback must match or the
   * mock and live detail pages would disagree about which trips are cancellable.
   */
  function cancelBooking(id: string): boolean {
    const booking = bookingById(id)
    if (!booking || booking.status !== 'CONFIRMED') return false
    booking.status = 'CANCELLED'
    return true
  }

  return { bookings, upcoming, past, bookingById, cancelBooking }
}
