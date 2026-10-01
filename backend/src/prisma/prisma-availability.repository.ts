import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import {
  type AvailabilityRepository,
  type AvailabilityRoom,
  type BlackoutWindow,
  type BookingOverlap,
  type HotelRooms,
  type NightDate,
  type RoomPrice,
} from './availability.repository.js';
import { PrismaService } from './prisma.service.js';
import type { HotelVisibility } from './hotels.repository.js';

/** Only the columns the availability math and the response need. */
const ROOM_SELECT = {
  id: true,
  hotelId: true,
  name: true,
  bedType: true,
  maxGuests: true,
  totalInventory: true,
} satisfies Prisma.RoomSelect;

/**
 * `findRoom` additionally reads the parent hotel's status, so the quote path can 404 a room of
 * a draft listing without a second round trip. `findHotelRooms` already has it, and passes it
 * in, so the two reads share one mapper.
 */
const ROOM_WITH_HOTEL_SELECT = {
  ...ROOM_SELECT,
  hotel: { select: { status: true } },
} satisfies Prisma.RoomSelect;

/**
 * T18 — Prisma implementation of `AvailabilityRepository`.
 *
 * The overlap predicates are exported as pure functions (the `buildPublishedWhere` pattern)
 * so the two rules that decide whether a night is free are unit-tested with no database.
 */

/**
 * A booking holds its room on the nights `check_in <= d < check_out`, so it overlaps the
 * requested window when it starts before the window ends AND ends after the window starts.
 * The bounds are strict because the ranges are half-open on the same rule: a stay ending
 * exactly on `checkIn` is not in the way, and back-to-back stays never double-count.
 *
 * Which rows count as holding is the whole rule, so it is spelled out rather than reduced to
 * a status list:
 *   * `CONFIRMED` is a real stay and holds its room for its whole range.
 *   * `PENDING` is a hold, and a hold lapses. It only holds while `hold_expires_at` is still in
 *     the future, so an abandoned checkout cannot close a room forever. `COMPLETED` and
 *     `CANCELLED` hold nothing and appear nowhere.
 *
 * `now` is a parameter rather than a `new Date()` inside the builder so the rule is testable
 * with no clock and no database.
 */
export function buildOverlappingBookingsWhere(
  roomIds: readonly string[],
  checkIn: NightDate,
  checkOut: NightDate,
  now: Date = new Date(),
): Prisma.BookingWhereInput {
  return {
    roomId: { in: [...roomIds] },
    OR: [
      { status: 'CONFIRMED' },
      { status: 'PENDING', holdExpiresAt: { gt: now } },
    ],
    checkIn: { lt: toUtcDay(checkOut) },
    checkOut: { gt: toUtcDay(checkIn) },
  };
}

/**
 * A blackout blocks `starts_on <= d <= ends_on` — inclusive on both ends, the opposite
 * convention to a stay. So it reaches the window when it starts on or before the last night
 * and ends on or after the first. `starts_on` is compared strictly below `checkOut` because
 * `checkOut` is not a night of this stay: a hotel that reopens on the checkout day is not
 * closed for any of the nights being booked.
 */
export function buildOverlappingBlackoutsWhere(
  hotelId: string,
  checkIn: NightDate,
  checkOut: NightDate,
): Prisma.BlackoutDateWhereInput {
  return {
    hotelId,
    startsOn: { lt: toUtcDay(checkOut) },
    endsOn: { gte: toUtcDay(checkIn) },
  };
}

/**
 * `YYYY-MM-DD` to a `Date` at UTC midnight. Prisma returns a `@db.Date` column as a Date
 * pinned to UTC midnight, and every comparison below is made in UTC, so a host in a
 * negative-offset timezone cannot shift a guest's first or last night.
 */
function toUtcDay(night: NightDate): Date {
  return new Date(`${night}T00:00:00.000Z`);
}

function toNightDate(value: Date): NightDate {
  return value.toISOString().slice(0, 10);
}

@Injectable()
export class PrismaAvailabilityRepository implements AvailabilityRepository {
  // Explicit `@Inject`: tsx/esbuild never emits `design:paramtypes`, so an
  // inferred token would be undefined in the OpenAPI preview (see PrismaService).
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findHotelRooms(hotelIdOrSlug: string): Promise<HotelRooms | null> {
    // The frontend links to `/hotels/{slug}`, so a bare uuid is not the only thing that
    // resolves — same shape as the hotel detail lookup.
    const row = await this.prisma.hotel.findFirst({
      where: { OR: [{ id: hotelIdOrSlug }, { slug: hotelIdOrSlug }] },
      select: {
        id: true,
        status: true,
        rooms: { orderBy: { sortOrder: 'asc' }, select: ROOM_SELECT },
      },
    });
    if (!row) return null;
    return {
      id: row.id,
      status: row.status,
      rooms: row.rooms.map((room) => toAvailabilityRoom(room, row.status)),
    };
  }

  async findRoom(roomId: string): Promise<AvailabilityRoom | null> {
    const row = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: ROOM_WITH_HOTEL_SELECT,
    });
    return row ? toAvailabilityRoom(row, row.hotel.status) : null;
  }

  async findOverlappingBookings(
    roomIds: readonly string[],
    checkIn: NightDate,
    checkOut: NightDate,
  ): Promise<BookingOverlap[]> {
    // An empty `in: []` is valid Prisma and matches nothing, but the round trip is
    // wasted and the intent reads better as an early return.
    if (roomIds.length === 0) return [];
    const rows = await this.prisma.booking.findMany({
      where: buildOverlappingBookingsWhere(roomIds, checkIn, checkOut),
      select: { roomId: true, checkIn: true, checkOut: true },
    });
    return rows.map((row) => ({
      roomId: row.roomId,
      checkIn: toNightDate(row.checkIn),
      checkOut: toNightDate(row.checkOut),
    }));
  }

  async findOverlappingBlackouts(
    hotelId: string,
    roomIds: readonly string[],
    checkIn: NightDate,
    checkOut: NightDate,
  ): Promise<BlackoutWindow[]> {
    const rows = await this.prisma.blackoutDate.findMany({
      // `roomId` null is a hotel-wide closure, so the filter is "this room OR the hotel".
      where: {
        AND: [
          buildOverlappingBlackoutsWhere(hotelId, checkIn, checkOut),
          { OR: [{ roomId: { in: [...roomIds] } }, { roomId: null }] },
        ],
      },
      select: { roomId: true, startsOn: true, endsOn: true },
    });
    return rows.map((row) => ({
      roomId: row.roomId,
      startsOn: toNightDate(row.startsOn),
      endsOn: toNightDate(row.endsOn),
    }));
  }

  async findRoomPrice(
    roomId: string,
    currency: string,
  ): Promise<RoomPrice | null> {
    const row = await this.prisma.roomPrice.findUnique({
      where: { roomId_currency: { roomId, currency } },
      select: { priceCents: true, currency: true },
    });
    return row ? { amountCents: row.priceCents, currency: row.currency } : null;
  }
}

function toAvailabilityRoom(
  row: Prisma.RoomGetPayload<{ select: typeof ROOM_SELECT }>,
  hotelStatus: HotelVisibility,
): AvailabilityRoom {
  return {
    id: row.id,
    hotelId: row.hotelId,
    hotelStatus,
    name: row.name,
    bedType: row.bedType,
    maxGuests: row.maxGuests,
    totalInventory: row.totalInventory,
  };
}
