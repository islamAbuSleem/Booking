/**
 * Mock bookings store. One `useState` list shared by the trips index and the
 * booking detail page, so cancelling on the detail is visible in the list.
 *
 * Local state only — the bookings API (T20) replaces this with server state.
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

  /** Only a held or confirmed stay can be cancelled. Returns false otherwise. */
  function cancelBooking(id: string): boolean {
    const booking = bookingById(id)
    if (!booking || !isUpcomingStatus(booking.status)) return false
    booking.status = 'CANCELLED'
    return true
  }

  return { bookings, upcoming, past, bookingById, cancelBooking }
}
