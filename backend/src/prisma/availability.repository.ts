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
 * Two rules are asserted in the implementation rather than in the service, because both are
 * query filters and a post-filter would be wrong: which bookings hold inventory (a `CONFIRMED`
 * stay, and a `PENDING` hold only while `bookings.hold_expires_at` is in the future), and which
 * blackouts can reach a room. Both live in
 * `buildOverlappingBookingsWhere` / `buildOverlappingBlackoutsWhere`, so each has one
 * definition.
 */

/** A calendar day as `YYYY-MM-DD` — the wire form, and the form the math is done in. */
export type NightDate = string;

export const AVAILABILITY_REPOSITORY = Symbol('AVAILABILITY_REPOSITORY');

export interface AvailabilityRoom {
  id: string;
  /** Needed to reach hotel-wide blackouts, which are stored against the hotel. */
  hotelId: string;
  /**
   * The parent hotel's visibility, carried on the room so a room id alone can never be used
   * to price or read a draft listing. `hotelAvailability()` already filters on the hotel;
   * this is what lets the quote path apply the same rule without a second query.
   */
  hotelStatus: HotelVisibility;
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
  /**
   * `null` when no room has that id. The room carries its hotel's status, so the caller can
   * refuse a room of an unpublished hotel without a second query.
   */
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
