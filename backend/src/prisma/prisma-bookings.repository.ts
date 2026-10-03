import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ApiError, notFound } from '../common/errors/api-error.js';
import {
  isPrismaKnownError,
  isRetryableWriteConflict,
} from '../common/errors/prisma-error.js';
import { Prisma } from '../generated/prisma/client.js';
import {
  evaluateRoomAvailability,
  QUOTE_HOLD_DURATION_MS,
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
import { DEFAULT_CURRENCY } from './hotels.repository.js';
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
      // `null` is a retryable write conflict and the only reason to run the transaction
      // again; every other failure is thrown from inside.
      const row = await this.runCreateTransaction(input, attempt);
      if (row) return toBookingRecord(row);
    }

    // The last attempt still conflicted. The re-check has by then seen the concurrent
    // booking, so the correct terminal state is "unavailable", not a crash.
    throw new ApiError(
      HttpStatus.CONFLICT,
      'ROOM_UNAVAILABLE',
      'The room is not available for those dates',
    );
  }

  /**
   * One attempt of the serializable transaction, re-run with a fresh reference when the
   * insert collides on one.
   *
   * The regeneration deliberately re-runs the WHOLE transaction rather than retrying the
   * insert inside it. Any statement error — a unique violation included — puts a Postgres
   * transaction into the aborted state, so the next statement on that connection fails
   * with `25P02 current transaction is aborted`, not with the collision the recovery
   * needs to see. Prisma's interactive `$transaction` opens no savepoint per query, so
   * there is no `ROLLBACK TO SAVEPOINT` to recover with; a new transaction is the only
   * honest one. `reference` is the only unique column the insert fills in (the id is a
   * generated uuid), so a `P2002` here is always a reference collision.
   */
  private async runCreateTransaction(
    input: BookingCreateInput,
    attempt: number,
  ): Promise<BookingRow | null> {
    for (let regeneration = 0; ; regeneration++) {
      const reference = generateBookingReference();
      try {
        return await this.prisma.$transaction(
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

            return this.insert(tx, input, reference, nights.length);
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        // A domain answer (a 404/409 thrown above) is final: only a write conflict or a
        // reference collision is worth running the transaction again.
        if (error instanceof ApiError) throw error;
        if (isPrismaKnownError(error) && error.code === 'P2002') {
          if (regeneration >= BOOKING_REFERENCE_MAX_REGENERATIONS) {
            throw new ApiError(
              HttpStatus.INTERNAL_SERVER_ERROR,
              'INTERNAL_ERROR',
              'Could not allocate a booking reference',
            );
          }
          this.logger.warn(
            `[bookings] reference ${reference} already taken, regenerating`,
          );
          continue;
        }
        if (!isRetryableWriteConflict(error)) throw error;
        // The last attempt has no retry after it, so it must not claim one: this log
        // is the one an operator reads while diagnosing a contended room.
        if (attempt < BOOKING_TX_MAX_ATTEMPTS) {
          this.logger.warn(
            `[bookings] retryable write conflict on attempt ${attempt} for room ${input.roomId}, re-running the transaction`,
          );
        }
        return null;
      }
    }
  }

  /** The `PENDING` insert. `nights` is the count the availability math just used. */
  private async insert(
    tx: Prisma.TransactionClient,
    input: BookingCreateInput,
    reference: string,
    nights: number,
  ): Promise<BookingRow> {
    return tx.booking.create({
      data: {
        reference,
        guestId: input.guestId,
        roomId: input.roomId,
        checkIn: toUtcDay(input.checkIn),
        checkOut: toUtcDay(input.checkOut),
        guestsCount: input.guests,
        nights,
        subtotalCents: input.subtotalCents,
        feesCents: input.feesCents,
        totalCents: input.totalCents,
        currency: input.currency,
        status: 'PENDING',
        // The hold lapses: the availability filter only counts a `PENDING` row while
        // `hold_expires_at` is still in the future, so an abandoned checkout cannot close
        // a room forever. The window is the quote's own, so a quote and the booking made
        // from it promise the same minutes.
        holdExpiresAt: new Date(Date.now() + QUOTE_HOLD_DURATION_MS),
      },
      select: BOOKING_SELECT,
    });
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
    return row ? toHotelSnapshot(row) : null;
  }

  /** One read for the whole list: an `in` filter, never a query per booking. */
  async findHotelSnapshots(
    hotelIds: readonly string[],
  ): Promise<BookingHotelSnapshot[]> {
    const distinct = [...new Set(hotelIds)];
    if (distinct.length === 0) return [];
    const rows = await this.prisma.hotel.findMany({
      where: { id: { in: distinct } },
      select: HOTEL_SNAPSHOT_SELECT,
    });
    return rows.map(toHotelSnapshot);
  }

  /**
   * The currency `POST /api/bookings` defaults to when the body carries none. `USD` wins
   * when the room has a price in it, because that is the quote endpoint's own default:
   * ordering by currency would pick `EGP` for a room priced in both, and the guest would
   * be charged in a different currency than the one they accepted. Anything else falls
   * to the first currency in sorted order, which is deterministic even if it is not
   * meaningful.
   */
  async findRoomPriceCurrency(roomId: string): Promise<string | null> {
    const rows = await this.prisma.roomPrice.findMany({
      where: { roomId },
      select: { currency: true },
    });
    const currencies = rows.map((row) => row.currency).sort();
    if (currencies.includes(DEFAULT_CURRENCY)) return DEFAULT_CURRENCY;
    return currencies[0] ?? null;
  }

  async updateStatus(
    bookingId: string,
    ownerId: string,
    from: BookingStatus,
    to: BookingStatus,
  ): Promise<BookingRecord | null> {
    // `updateMany` rather than `update`, with the owner and the expected status in the
    // `where`: the flip only happens on a row that is still the caller's and still in
    // `from`, so a cancel that raced another cancel is a count of zero, not a second
    // 200. `updatedAt` moves with the flip.
    const { count } = await this.prisma.booking.updateMany({
      where: { id: bookingId, guestId: ownerId, status: from },
      data: { status: to },
    });
    if (count === 0) return null;
    return this.findById(bookingId);
  }

  async transitionStatus(
    bookingId: string,
    from: BookingStatus,
    to: BookingStatus,
  ): Promise<BookingRecord | null> {
    const { count } = await this.prisma.booking.updateMany({
      where: { id: bookingId, status: from },
      data: { status: to },
    });
    if (count === 0) return null;
    return this.findById(bookingId);
  }
}

type HotelSnapshotRow = Prisma.HotelGetPayload<{
  select: typeof HOTEL_SNAPSHOT_SELECT;
}>;

function toHotelSnapshot(row: HotelSnapshotRow): BookingHotelSnapshot {
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
