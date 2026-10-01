import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ApiError, notFound } from '../common/errors/api-error.js';
import {
  isPrismaKnownError,
  isRetryableWriteConflict,
} from '../common/errors/prisma-error.js';
import { Prisma } from '../generated/prisma/client.js';
import {
  evaluateRoomAvailability,
  stayNights,
} from '../modules/bookings/availability.service.js';
import type { NightDate } from './availability.repository.js';
import {
  type BookingCreateInput,
  type BookingHotelSnapshot,
  type BookingRecord,
  type BookingRepository,
  type BookingStatus,
} from './bookings.repository.js';
import {
  buildOverlappingBlackoutsWhere,
  buildOverlappingBookingsWhere,
} from './prisma-availability.repository.js';
import { PrismaService } from './prisma.service.js';

/**
 * T20 — the T18 seam, one write: the `PENDING` booking.
 *
 * `createPending` is a serializable transaction. The in-transaction re-check runs T18's
 * availability math on the transaction's own client — the read that decides whether the
 * insert is allowed happens at the isolation level, so a booking that lands between the
 * caller's pre-check and this write is seen here, and the insert rolls back instead of
 * overselling. A `P2034`/`40001`/`40P01` write conflict re-runs the whole transaction;
 * the re-check has by then seen the other booking, so the terminal answer of a
 * lost race is `ROOM_UNAVAILABLE`, never a 500.
 *
 * The pure T18 pieces are reused, not re-derived: `stayNights` and
 * `evaluateRoomAvailability` from `availability.service.js`, and the two `where` builders
 * from `prisma-availability.repository.js`, which exist as pure functions exactly so a
 * transaction client can run them.
 */

/** The two-letter prefix of a booking reference, e.g. `GB` in the schema's `GB-4821`. */
export const BOOKING_REFERENCE_PREFIX = 'GB';

/**
 * Total attempts of the transaction after a retryable write conflict. Three is enough to
 * ride out a single hot write to the last unit, and few enough that a genuinely contended
 * room answers `ROOM_UNAVAILABLE` instead of spinning.
 */
export const BOOKING_TX_MAX_ATTEMPTS = 3;

/**
 * How many times a `P2002` collision on `reference` is regenerated before the insert gives
 * up. Four random digits over ten thousand values makes a collision a fluke, and three
 * regenerations turns the fluke into a near-impossibility without retrying forever.
 */
export const BOOKING_REFERENCE_MAX_REGENERATIONS = 3;

export function generateBookingReference(): string {
  const digits = String(Math.floor(Math.random() * 10_000)).padStart(4, '0');
  return `${BOOKING_REFERENCE_PREFIX}-${digits}`;
}

/** Only the columns the DTO and the guards need, with the room narrowed to its snapshot. */
const BOOKING_SELECT = {
  id: true,
  reference: true,
  status: true,
  guestId: true,
  roomId: true,
  checkIn: true,
  checkOut: true,
  guestsCount: true,
  nights: true,
  subtotalCents: true,
  feesCents: true,
  totalCents: true,
  currency: true,
  createdAt: true,
  room: { select: { name: true, hotelId: true } },
} satisfies Prisma.BookingSelect;

const HOTEL_SNAPSHOT_SELECT = {
  id: true,
  slug: true,
  name: true,
  city: true,
  country: true,
  addressLine: true,
  images: {
    where: { roomId: null },
    orderBy: [{ isCover: 'desc' }, { sortOrder: 'asc' }],
    take: 1,
    select: { url: true },
  },
} satisfies Prisma.HotelSelect;

type BookingRow = Prisma.BookingGetPayload<{ select: typeof BOOKING_SELECT }>;

@Injectable()
export class PrismaBookingRepository implements BookingRepository {
  private readonly logger = new Logger(PrismaBookingRepository.name);

  // Explicit `@Inject`: tsx/esbuild never emits `design:paramtypes`, so an
  // inferred token would be undefined in the OpenAPI preview (see PrismaService).
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async createPending(input: BookingCreateInput): Promise<BookingRecord> {
    for (let attempt = 1; attempt <= BOOKING_TX_MAX_ATTEMPTS; attempt++) {
      try {
        const row = await this.prisma.$transaction(
          async (tx) => {
            // The room is re-read on the tx client: its `totalInventory` and `maxGuests`
            // at this isolation level are the ones the insert is checked against.
            const room = await tx.room.findUnique({
              where: { id: input.roomId },
              select: {
                id: true,
                hotelId: true,
                maxGuests: true,
                totalInventory: true,
              },
            });
            if (!room) throw notFound('ROOM_NOT_FOUND', 'Room not found');

            // The oversell guard: the same D52 math T18 runs as a pre-check, but on the
            // transaction client, so a booking that lands between pre-check and insert
            // is the one this read sees.
            const nights = stayNights(input.checkIn, input.checkOut);
            const [overlaps, blackouts] = await Promise.all([
              tx.booking.findMany({
                where: buildOverlappingBookingsWhere(
                  [input.roomId],
                  input.checkIn,
                  input.checkOut,
                ),
                select: { roomId: true, checkIn: true, checkOut: true },
              }),
              tx.blackoutDate.findMany({
                where: {
                  AND: [
                    buildOverlappingBlackoutsWhere(
                      room.hotelId,
                      input.checkIn,
                      input.checkOut,
                    ),
                    {
                      OR: [
                        { roomId: { in: [input.roomId] } },
                        { roomId: null },
                      ],
                    },
                  ],
                },
                select: { roomId: true, startsOn: true, endsOn: true },
              }),
            ]);
            const { available } = evaluateRoomAvailability(
              room,
              nights,
              toBookingOverlaps(overlaps),
              toBlackoutWindows(blackouts),
              input.guests,
            );
            if (!available) {
              throw new ApiError(
                HttpStatus.CONFLICT,
                'ROOM_UNAVAILABLE',
                'The room is not available for those dates',
              );
            }

            return this.insertWithUniqueReference(tx, input);
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
        return toBookingRecord(row);
      } catch (error) {
        // A domain answer (a 404/409 thrown above) is final: only a write conflict is
        // worth re-running the transaction.
        if (error instanceof ApiError) throw error;
        if (!isRetryableWriteConflict(error)) throw error;
        this.logger.warn(
          `[bookings] retryable write conflict on attempt ${attempt} for room ${input.roomId}, re-running the transaction`,
        );
      }
    }

    // The last attempt still conflicted. The re-check has by then seen the concurrent
    // booking, so the correct terminal state is "unavailable", not a crash.
    throw new ApiError(
      HttpStatus.CONFLICT,
      'ROOM_UNAVAILABLE',
      'The room is not available for those dates',
    );
  }

  async findById(bookingId: string): Promise<BookingRecord | null> {
    const row = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: BOOKING_SELECT,
    });
    return row ? toBookingRecord(row) : null;
  }

  async findForOwner(ownerId: string): Promise<BookingRecord[]> {
    const rows = await this.prisma.booking.findMany({
      where: { guestId: ownerId },
      orderBy: { createdAt: 'desc' },
      select: BOOKING_SELECT,
    });
    return rows.map(toBookingRecord);
  }

  async findHotelSnapshot(
    hotelId: string,
  ): Promise<BookingHotelSnapshot | null> {
    const row = await this.prisma.hotel.findUnique({
      where: { id: hotelId },
      select: HOTEL_SNAPSHOT_SELECT,
    });
    if (!row) return null;
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      city: row.city,
      country: row.country,
      addressLine: row.addressLine,
      coverImage: row.images[0]?.url ?? null,
    };
  }

  async findRoomPriceCurrency(roomId: string): Promise<string | null> {
    const row = await this.prisma.roomPrice.findFirst({
      where: { roomId },
      orderBy: { currency: 'asc' },
      select: { currency: true },
    });
    return row ? row.currency : null;
  }

  async updateStatus(
    bookingId: string,
    status: BookingStatus,
  ): Promise<BookingRecord | null> {
    // `updateMany` rather than `update`: the caller read the row just before, so a
    // count of zero is "gone", not an exception worth a filter branch.
    const { count } = await this.prisma.booking.updateMany({
      where: { id: bookingId },
      data: { status },
    });
    if (count === 0) return null;
    return this.findById(bookingId);
  }

  /**
   * The insert with a regenerated reference on a `P2002` collision. `reference` is the
   * only unique column the insert fills in (the id is a generated uuid), so a P2002 from
   * this insert is always a reference collision, and regenerating is the whole recovery.
   * A unique violation does not abort the surrounding transaction in Postgres, so the
   * retry stays inside the one the caller opened.
   */
  private async insertWithUniqueReference(
    tx: Prisma.TransactionClient,
    input: BookingCreateInput,
  ): Promise<BookingRow> {
    for (let regeneration = 0; ; regeneration++) {
      const reference = generateBookingReference();
      try {
        return await tx.booking.create({
          data: {
            reference,
            guestId: input.guestId,
            roomId: input.roomId,
            checkIn: toUtcDay(input.checkIn),
            checkOut: toUtcDay(input.checkOut),
            guestsCount: input.guests,
            nights: input.nights,
            subtotalCents: input.subtotalCents,
            feesCents: input.feesCents,
            totalCents: input.totalCents,
            currency: input.currency,
            status: 'PENDING',
          },
          select: BOOKING_SELECT,
        });
      } catch (error) {
        const collision = isPrismaKnownError(error) && error.code === 'P2002';
        if (collision && regeneration < BOOKING_REFERENCE_MAX_REGENERATIONS) {
          this.logger.warn(
            `[bookings] reference ${reference} already taken, regenerating`,
          );
          continue;
        }
        if (collision) {
          throw new ApiError(
            HttpStatus.INTERNAL_SERVER_ERROR,
            'INTERNAL_ERROR',
            'Could not allocate a booking reference',
          );
        }
        throw error;
      }
    }
  }
}

function toBookingRecord(row: BookingRow): BookingRecord {
  return {
    id: row.id,
    reference: row.reference,
    status: row.status,
    guestId: row.guestId,
    roomId: row.roomId,
    hotelId: row.room.hotelId,
    roomName: row.room.name,
    checkIn: toNightDate(row.checkIn),
    checkOut: toNightDate(row.checkOut),
    guestsCount: row.guestsCount,
    nights: row.nights,
    subtotalCents: row.subtotalCents,
    feesCents: row.feesCents,
    totalCents: row.totalCents,
    currency: row.currency,
    createdAt: row.createdAt,
  };
}

/** `YYYY-MM-DD` to a `Date` at UTC midnight — the store form of a `@db.Date` column. */
function toUtcDay(night: NightDate): Date {
  return new Date(`${night}T00:00:00.000Z`);
}

function toNightDate(value: Date): NightDate {
  return value.toISOString().slice(0, 10);
}

/** Prisma rows back to the T18 domain shapes the availability math takes. */
function toBookingOverlaps(
  rows: Array<{ roomId: string; checkIn: Date; checkOut: Date }>,
): Array<{ roomId: string; checkIn: NightDate; checkOut: NightDate }> {
  return rows.map((row) => ({
    roomId: row.roomId,
    checkIn: toNightDate(row.checkIn),
    checkOut: toNightDate(row.checkOut),
  }));
}

function toBlackoutWindows(
  rows: Array<{ roomId: string | null; startsOn: Date; endsOn: Date }>,
): Array<{ roomId: string | null; startsOn: NightDate; endsOn: NightDate }> {
  return rows.map((row) => ({
    roomId: row.roomId,
    startsOn: toNightDate(row.startsOn),
    endsOn: toNightDate(row.endsOn),
  }));
}
