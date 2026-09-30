import type { HotelVisibility } from './hotels.repository.js';

/**
 * T18 — the availability read contract, expressed in domain terms.
 *
 * The availability service depends on this interface, not on `PrismaService`
 * (context/code-standards.md, "Dependency inversion"): the per-night inventory math is then
 * testable with a hand-written fake, no database and no Nest container.
 * `PrismaAvailabilityRepository` is the one implementation, and it is the only place a
 * Prisma type appears.
 *
 * Two rules are asserted HERE rather than in the service, because both are query filters
 * and a post-filter would be wrong: which booking statuses hold inventory, and which
 * blackouts can reach a room.
 */

/** A calendar day as `YYYY-MM-DD` — the wire form, and the form the math is done in. */
export type NightDate = string;

export const AVAILABILITY_REPOSITORY = Symbol('AVAILABILITY_REPOSITORY');

/**
 * A `PENDING` row is how T20 holds inventory before Stripe confirms payment, so it occupies
 * a room exactly like a `CONFIRMED` one. Ignoring it would oversell by one; counting
 * `COMPLETED` or `CANCELLED` would under-sell. Kept here so the rule has one definition.
 */
export const HOLDING_BOOKING_STATUSES = ['PENDING', 'CONFIRMED'] as const;

export interface AvailabilityRoom {
  id: string;
  /** Needed to reach hotel-wide blackouts, which are stored against the hotel. */
  hotelId: string;
  name: string;
  bedType: string;
  maxGuests: number;
  /** The cap the per-night overlap count is subtracted from. */
  totalInventory: number;
}

export interface HotelRooms {
  id: string;
  /** Carried so the service can apply the same visibility rule as the hotel detail read. */
  status: HotelVisibility;
  rooms: AvailabilityRoom[];
}

/**
 * A booking that touches the requested window at all. It may still miss individual nights
 * inside the window, so the service re-tests it per night rather than trusting the query.
 */
export interface BookingOverlap {
  roomId: string;
  checkIn: NightDate;
  checkOut: NightDate;
}

/**
 * A blackout range, **inclusive on both ends** (`blackout_dates.starts_on`/`ends_on`), which
 * is why it is not the same half-open shape as a stay. `roomId` null closes the whole hotel.
 */
export interface BlackoutWindow {
  roomId: string | null;
  startsOn: NightDate;
  endsOn: NightDate;
}

export interface RoomPrice {
  /** Integer cents. */
  amountCents: number;
  currency: string;
}

export interface AvailabilityRepository {
  /** `null` when no hotel has that id or slug. Room inventory is a projection, not a graph. */
  findHotelRooms(hotelIdOrSlug: string): Promise<HotelRooms | null>;
  findRoom(roomId: string): Promise<AvailabilityRoom | null>;
  /**
   * Bookings that overlap `[checkIn, checkOut)` for any of `roomIds`, in either holding
   * status. An empty `roomIds` returns nothing rather than every booking in the table.
   */
  findOverlappingBookings(
    roomIds: readonly string[],
    checkIn: NightDate,
    checkOut: NightDate,
  ): Promise<BookingOverlap[]>;
  /**
   * Blackouts that reach any of `roomIds`, or the hotel as a whole when `roomId` is null.
   * A range that only touches `checkOut` is not returned: the stay is half-open, so
   * `checkOut` is not one of its nights.
   */
  findOverlappingBlackouts(
    hotelId: string,
    roomIds: readonly string[],
    checkIn: NightDate,
    checkOut: NightDate,
  ): Promise<BlackoutWindow[]>;
  /**
   * Null when the room has no `room_prices` row in that currency. A missing price is an
   * error at the quote boundary, never a zero (context/architecture.md, "Pricing").
   */
  findRoomPrice(roomId: string, currency: string): Promise<RoomPrice | null>;
}
