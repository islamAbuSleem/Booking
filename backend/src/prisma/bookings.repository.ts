import type { NightDate } from './availability.repository.js';

/**
 * T20 — the bookings write/read contract, expressed in domain terms.
 *
 * Same shape as the other repositories: the service depends on this interface, never on
 * `PrismaService` (context/code-standards.md, "Dependency inversion"), and
 * `PrismaBookingRepository` is the one implementation, the one place a Prisma type
 * appears.
 *
 * `createPending` is the interesting one: the serializable transaction, the in-transaction
 * availability re-check, and the retry loop all live inside the implementation, because
 * they are one indivisible write and a unit test fakes the `PrismaService` (with a
 * transaction client that shares in-memory state) to prove the oversell behaviour.
 */

export const BOOKINGS_REPOSITORY = Symbol('BOOKINGS_REPOSITORY');

/**
 * Mirrors the `bookings.status` enum without importing a Prisma type into the contract.
 * `PENDING` is the status T20 writes: the row holds inventory before T26/T27 confirm
 * payment, and the availability rule counts it exactly like a `CONFIRMED` row (D52).
 */
export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';

/**
 * A booking reduced to what the DTO and the guards need. Dates are `NightDate` — the wire
 * form and the form the availability math is done in, never a `Date` leaking through the
 * contract.
 */
export interface BookingRecord {
  id: string;
  reference: string;
  status: BookingStatus;
  guestId: string;
  roomId: string;
  /** Carried so the DTO's hotel snapshot read does not have to re-derive it. */
  hotelId: string;
  roomName: string;
  checkIn: NightDate;
  checkOut: NightDate;
  guestsCount: number;
  /** `checkOut - checkIn` in whole days; the stay is half-open, so `checkOut` is not a night. */
  nights: number;
  /** Immutable server-computed snapshot. A client-sent total is never trusted (D3). */
  subtotalCents: number;
  feesCents: number;
  totalCents: number;
  /**
   * A historical label, deliberately not a foreign key: a booking pins the currency it was
   * quoted in, and a later currency deactivation must never invalidate history (D10).
   */
  currency: string;
  createdAt: Date;
  /** When the PENDING hold expires. Null for non-PENDING bookings. */
  holdExpiresAt: Date | null;
}

/**
 * The property snapshot the Booking DTO embeds so the T8 detail page needs no second fetch
 * (D55). `coverImage` is the URL string, not an image summary: the booking page renders
 * one picture, and the dimensions the summary carries are the card's concern, not the
 * list's.
 */
export interface BookingHotelSnapshot {
  id: string;
  slug: string;
  name: string;
  city: string;
  country: string;
  addressLine: string;
  coverImage: string | null;
}

/**
 * Everything the write needs, pre-computed by the caller: the money snapshot is the caller's
 * arithmetic on the caller's price read, and the transaction below never re-derives it.
 * There is no `nights` here on purpose — the transaction derives the count from the dates
 * it re-checks, so the row can never disagree with its own `checkIn`/`checkOut`.
 */
export interface BookingCreateInput {
  guestId: string;
  roomId: string;
  checkIn: NightDate;
  checkOut: NightDate;
  guests: number;
  currency: string;
  subtotalCents: number;
  feesCents: number;
  totalCents: number;
}

export interface BookingRepository {
  /**
   * The T20 write. Creates the `PENDING` booking inside a serializable transaction that
   * re-checks availability on the transaction's own client before the insert — the guard
   * against a booking that lands between the caller's pre-check and this write — and
   * re-runs the whole transaction on a retryable write conflict, up to the cap. When the
   * cap is exhausted the terminal answer is `ROOM_UNAVAILABLE`, not a crash: the re-check
   * has by then seen the concurrent booking.
   */
  createPending(input: BookingCreateInput): Promise<BookingRecord>;
  /** `null` when no booking has that id. */
  findById(bookingId: string): Promise<BookingRecord | null>;
  /** The caller's bookings, newest first. */
  findForOwner(ownerId: string): Promise<BookingRecord[]>;
  /** `null` when no hotel has that id. */
  findHotelSnapshot(hotelId: string): Promise<BookingHotelSnapshot | null>;
  /**
   * The same snapshots for many hotels in ONE read, so listing a guest's bookings does
   * not issue a query per row. Hotels with no such id are simply absent from the result.
   */
  findHotelSnapshots(
    hotelIds: readonly string[],
  ): Promise<BookingHotelSnapshot[]>;
  /**
   * The room's price currency for the currency default, or `null` when the room has no
   * `room_prices` row at all — the caller then falls back to USD, and the 422 the price
   * read produces is the caller's to raise, not this one's.
   */
  findRoomPriceCurrency(roomId: string): Promise<string | null>;
  /**
   * The flip is owner- and state-scoped in the `where`, never checked first and written
   * second: `null` means no row matched — it is gone, it is not the caller's, or it has
   * already left `from`. A check-then-act would let a concurrent `CONFIRMED -> COMPLETED`
   * (or a second cancel) be silently overwritten, and would let a caller that forgot to
   * load its own row write another guest's booking.
   */
  updateStatus(
    bookingId: string,
    ownerId: string,
    from: BookingStatus,
    to: BookingStatus,
  ): Promise<BookingRecord | null>;
  /**
   * The webhook's flip: same conditional write as `updateStatus` but with no owner in
   * the `where`, because the caller is Stripe, not a guest. `null` means the row was
   * already past `from` — which is the idempotency the webhook depends on: a retried
   * event finds nothing to flip and answers 200 without writing.
   */
  transitionStatus(
    bookingId: string,
    from: BookingStatus,
    to: BookingStatus,
  ): Promise<BookingRecord | null>;
}
