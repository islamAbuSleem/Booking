import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ApiError, badRequest, notFound } from '../../common/errors/api-error.js';
import {
  AVAILABILITY_REPOSITORY,
  type AvailabilityRepository,
  type AvailabilityRoom,
  type BlackoutWindow,
  type BookingOverlap,
  type NightDate,
} from '../../prisma/availability.repository.js';
import type {
  AvailabilityQuery,
  HotelAvailabilityData,
  QuoteData,
  QuoteRequest,
  RoomAvailability,
} from './dto/availability.dto.js';

/**
 * T18 — availability and quote. The one place the rule "is this room bookable" lives.
 *
 * Depends on the `AVAILABILITY_REPOSITORY` token, never on `PrismaService`, so the per-night
 * inventory math below is testable with a fake and no database (context/code-standards.md,
 * "Dependency inversion"). The two functions that actually do the reasoning,
 * `stayNights()` and `evaluateRoomAvailability()`, are pure and exported: no Nest container,
 * no Prisma, no network.
 *
 * Both endpoints are public and neither writes. A quote is arithmetic, not a reservation —
 * the inventory is actually held when T20 writes the `PENDING` booking, inside the window
 * `holdExpiresAt` reports.
 */

/**
 * T18 has no fee schedule (context/build-plan.md says so explicitly), so this is the single
 * place a fee is defined and it is zero. T20/T26 set the real rule here; nothing above this
 * constant changes, and `totalCents` stays `subtotalCents + feesCents` whatever it becomes.
 */
export const QUOTE_FEES_CENTS = 0;

/**
 * How long a quoted price is good for, i.e. the window T20 has to write the `PENDING`
 * booking before the guest must be re-quoted. Fixed rather than configured: nothing reads
 * it from the environment yet, and a knob with one caller is a knob nobody turns.
 */
export const QUOTE_HOLD_DURATION_MS = 15 * 60 * 1000;

const MILLIS_PER_DAY = 86_400_000;

/** A room reduced to the three fields the availability rule reads. */
export type AvailabilityRuleRoom = Pick<
  AvailabilityRoom,
  'id' | 'maxGuests' | 'totalInventory'
>;

export interface RoomAvailabilityResult {
  /** Units left per night, in stay order. Never negative. */
  remaining: number[];
  available: boolean;
}

@Injectable()
export class AvailabilityService {
  private readonly logger = new Logger(AvailabilityService.name);

  constructor(
    @Inject(AVAILABILITY_REPOSITORY)
    private readonly availability: AvailabilityRepository,
  ) {}

  /**
   * `GET /api/hotels/:id/availability`. Reports every room with a verdict rather than
   * filtering the sold-out ones out: the client renders one card per room and has to show
   * the unavailable ones as such.
   *
   * A hotel that is not visible is a 404 for the same reason the detail read is one — the
   * endpoint must not become a way to discover a draft listing's occupancy.
   */
  async hotelAvailability(
    hotelIdOrSlug: string,
    query: AvailabilityQuery,
  ): Promise<HotelAvailabilityData> {
    const hotel = await this.availability.findHotelRooms(hotelIdOrSlug);
    if (!hotel || hotel.status !== 'PUBLISHED') {
      throw notFound('HOTEL_NOT_FOUND', 'Hotel not found');
    }

    const nights = stayNights(query.checkIn, query.checkOut);
    const roomIds = hotel.rooms.map((room) => room.id);
    // Independent reads, so they run concurrently rather than as a waterfall.
    const [bookings, blackouts] = await Promise.all([
      this.availability.findOverlappingBookings(
        roomIds,
        query.checkIn,
        query.checkOut,
      ),
      this.availability.findOverlappingBlackouts(
        hotel.id,
        roomIds,
        query.checkIn,
        query.checkOut,
      ),
    ]);

    this.logger.log(
      `[bookings] availability for ${hotel.rooms.length} room(s), ` +
        `${nights.length} night(s), guests=${query.guests}`,
    );

    return {
      rooms: hotel.rooms.map((room) => {
        const { remaining, available } = evaluateRoomAvailability(
          room,
          nights,
          bookings,
          blackouts,
          query.guests,
        );
        return {
          room: toAvailabilityRoom(room),
          available,
          remainingPerNight: remaining,
        };
      }),
    };
  }

  /**
   * `POST /api/bookings/quote`. Availability is checked before the price is read, so a sold
   * out room never leaks a price, and the price is read before any arithmetic, so a room
   * with no `room_prices` row is an error rather than a free stay.
   */
  async quote(request: QuoteRequest): Promise<QuoteData> {
    const room = await this.availability.findRoom(request.roomId);
    if (!room) throw notFound('ROOM_NOT_FOUND', 'Room not found');

    // Checked here rather than in the schema because the bound is per room, and a 400 with
    // the room's own limit is more use to a client than a generic validation failure.
    if (request.guests > room.maxGuests) {
      throw badRequest(
        `This room sleeps at most ${room.maxGuests} guest(s)`,
        { maxGuests: room.maxGuests, guests: request.guests },
      );
    }

    const nights = stayNights(request.checkIn, request.checkOut);
    const [bookings, blackouts] = await Promise.all([
      this.availability.findOverlappingBookings(
        [room.id],
        request.checkIn,
        request.checkOut,
      ),
      this.availability.findOverlappingBlackouts(
        room.hotelId,
        [room.id],
        request.checkIn,
        request.checkOut,
      ),
    ]);

    const { available } = evaluateRoomAvailability(
      room,
      nights,
      bookings,
      blackouts,
      request.guests,
    );
    if (!available) {
      throw new ApiError(
        HttpStatus.CONFLICT,
        'ROOM_UNAVAILABLE',
        'The room is not available for those dates',
      );
    }

    const price = await this.availability.findRoomPrice(
      room.id,
      request.currency,
    );
    if (!price) {
      // context/architecture.md, "Pricing": a missing price row is an error, never a
      // silent zero. 422 because the request was well formed and the room exists — the
      // hotel simply has not priced it in the requested currency.
      throw new ApiError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'PRICE_UNAVAILABLE',
        `This room has no price in ${request.currency}`,
      );
    }

    this.logger.log(
      `[bookings] quoted ${room.id} for ${nights.length} night(s) in ${price.currency}`,
    );

    const subtotalCents = price.amountCents * nights.length;
    return {
      nights: nights.length,
      subtotalCents,
      feesCents: QUOTE_FEES_CENTS,
      // The invariant T20 snapshots into `bookings.total_cents`, so it is written once here
      // rather than recomputed by whoever reads the quote.
      totalCents: subtotalCents + QUOTE_FEES_CENTS,
      currency: price.currency,
      breakdown: nights.map((night) => ({
        date: night,
        priceCents: price.amountCents,
      })),
      holdExpiresAt: new Date(
        Date.now() + QUOTE_HOLD_DURATION_MS,
      ).toISOString(),
    };
  }
}

/**
 * The nights of a half-open stay, in order: `checkIn <= d < checkOut`. `checkOut` is not a
 * night, which is what stops back-to-back stays from double-counting.
 *
 * Every step is a UTC instant and every read is a UTC getter, so a host on a negative-offset
 * timezone cannot move a guest's first or last night by a day. Adding 86_400_000ms to a
 * UTC-midnight Date is exactly one day, always, because there is no DST at UTC.
 */
export function stayNights(
  checkIn: NightDate,
  checkOut: NightDate,
): NightDate[] {
  const first = toUtcDay(checkIn);
  const last = toUtcDay(checkOut);
  const nights: NightDate[] = [];
  for (
    let day = first;
    day.getTime() < last.getTime();
    day = new Date(day.getTime() + MILLIS_PER_DAY)
  ) {
    nights.push(toNightDate(day));
  }
  return nights;
}

/**
 * D52: a room is bookable for the range when **every** night has
 * `total_inventory - overlappingBookings(night) >= 1` and no blackout covers that night.
 * "Every", not "at least one" — a single blocked night makes the whole stay unsellable,
 * because the guest has nowhere to sleep that night.
 *
 * `guests` is part of the rule because the caller asked about a party, not a room: a room
 * that cannot sleep the party is not available to it, however much inventory is left. An
 * empty range is unavailable too, so the rule fails closed rather than passing vacuously.
 *
 * Dates are compared as strings. `YYYY-MM-DD` is zero-padded and fixed-width, so it orders
 * lexicographically exactly as it orders chronologically, and the Zod boundary has already
 * guaranteed the format.
 */
export function evaluateRoomAvailability(
  room: AvailabilityRuleRoom,
  nights: readonly NightDate[],
  bookings: readonly BookingOverlap[],
  blackouts: readonly BlackoutWindow[],
  guests: number,
): RoomAvailabilityResult {
  const remaining = nights.map((night) => {
    if (isBlackedOut(room.id, night, blackouts)) return 0;
    const held = bookings.filter(
      (booking) =>
        booking.roomId === room.id &&
        booking.checkIn <= night &&
        night < booking.checkOut,
    ).length;
    // Clamped: a booking that over-subscribed a room (a race before T20's transaction)
    // must report 0, not a negative number of units to sell.
    return Math.max(0, room.totalInventory - held);
  });

  const available =
    guests <= room.maxGuests &&
    remaining.length > 0 &&
    remaining.every((count) => count >= 1);

  return { remaining, available };
}

/** A blackout is `roomId`-scoped or, when null, closes the whole hotel. */
function isBlackedOut(
  roomId: string,
  night: NightDate,
  blackouts: readonly BlackoutWindow[],
): boolean {
  return blackouts.some(
    (blackout) =>
      (blackout.roomId === null || blackout.roomId === roomId) &&
      blackout.startsOn <= night &&
      night <= blackout.endsOn,
  );
}

/** Only the room fields the availability response exposes. */
function toAvailabilityRoom(room: AvailabilityRoom): RoomAvailability['room'] {
  return {
    id: room.id,
    name: room.name,
    bedType: room.bedType,
    maxGuests: room.maxGuests,
    totalInventory: room.totalInventory,
  };
}

function toUtcDay(night: NightDate): Date {
  return new Date(`${night}T00:00:00.000Z`);
}

function toNightDate(value: Date): NightDate {
  return value.toISOString().slice(0, 10);
}
