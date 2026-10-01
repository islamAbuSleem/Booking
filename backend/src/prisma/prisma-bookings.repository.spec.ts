import { Prisma } from '../generated/prisma/client.js';
import { ApiError } from '../common/errors/api-error.js';
import type { NightDate } from './availability.repository.js';
import type {
  BookingCreateInput,
  BookingStatus,
} from './bookings.repository.js';
import {
  BOOKING_REFERENCE_MAX_REGENERATIONS,
  BOOKING_REFERENCE_PREFIX,
  BOOKING_TX_MAX_ATTEMPTS,
  generateBookingReference,
  PrismaBookingRepository,
} from './prisma-bookings.repository.js';
import type { PrismaService } from './prisma.service.js';

/**
 * T20 — the write, with no database.
 *
 * The repository takes a `PrismaService`, and the fake below implements only what
 * `createPending` touches: `$transaction(fn)` and a transaction client whose
 * `room`/`booking`/`blackoutDate` delegates read and write ONE in-memory state. Two
 * creates interleaved through the fake therefore behave like two serializable
 * transactions on one room: the second re-check sees the first insert, and the split is
 * deterministic rather than a matter of timing.
 */

interface RoomSpec {
  id: string;
  hotelId: string;
  name: string;
  maxGuests: number;
  totalInventory: number;
}

interface StoredBooking {
  id: string;
  reference: string;
  status: BookingStatus;
  guestId: string;
  roomId: string;
  checkIn: Date;
  checkOut: Date;
  guestsCount: number;
  nights: number;
  subtotalCents: number;
  feesCents: number;
  totalCents: number;
  currency: string;
  createdAt: Date;
}

interface StoredBlackout {
  hotelId: string;
  /** `null` closes the whole hotel, matching the `blackout_dates` column. */
  roomId: string | null;
  startsOn: Date;
  endsOn: Date;
}

function day(night: NightDate): Date {
  return new Date(`${night}T00:00:00.000Z`);
}

/**
 * `Prisma.PrismaClientKnownRequestError` with the code a real Postgres round trip would
 * carry. Built the way the production detector expects it (prisma-error.spec.ts).
 */
function knownError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('simulated', {
    code,
    clientVersion: '7.10.0',
  });
}

interface HotelSpec {
  id: string;
  slug: string;
  name: string;
  city: string;
  country: string;
  addressLine: string;
  coverImage: string | null;
}

class FakePrisma {
  readonly rooms = new Map<string, RoomSpec>();
  readonly hotels = new Map<string, HotelSpec>();
  readonly priceCurrencies = new Map<string, string[]>();
  readonly bookings: StoredBooking[] = [];
  readonly blackouts: StoredBlackout[] = [];
  // Public: the delegates factory outside the class reads and writes them.
  nextId = 0;
  referenceFailures = 0;
  /** Monotonic so a `createdAt desc` order is deterministic without a real clock. */
  baseTime = new Date('2026-05-20T10:00:00.000Z').getTime();
  private delegatesCache: Record<string, unknown> | undefined;
  private conflictFailures = 0;
  private queue: Promise<unknown> = Promise.resolve();
  private transactionCount = 0;
  /**
   * Postgres aborts the whole transaction on any statement error, so the statement after
   * a failed insert fails with `25P02 current transaction is aborted` rather than with the
   * error the caller just saw. The fake models that, because an in-transaction recovery
   * would otherwise look correct here and fail on a real round trip.
   */
  private aborted = false;

  readonly attemptedReferences: string[] = [];

  /** The 25P02 every further statement on an aborted transaction would get. */
  assertLive(): void {
    if (this.aborted) {
      throw new Error('25P02: current transaction is aborted');
    }
  }

  withRoom(room: RoomSpec): this {
    this.rooms.set(room.id, room);
    return this;
  }

  withHotel(hotel: HotelSpec): this {
    this.hotels.set(hotel.id, hotel);
    return this;
  }

  withPriceCurrencies(roomId: string, ...currencies: string[]): this {
    this.priceCurrencies.set(roomId, currencies);
    return this;
  }

  /** A booking already in the table: an overlap the re-check must see. */
  withBooking(booking: Omit<StoredBooking, 'id' | 'createdAt'>): this {
    this.bookings.push({
      ...booking,
      id: `b-${++this.nextId}`,
      createdAt: day('2026-05-20'),
    });
    return this;
  }

  withBlackout(blackout: StoredBlackout): this {
    this.blackouts.push(blackout);
    return this;
  }

  /** The next N transaction attempts fail with a P2034 write conflict, before the work. */
  failNextWriteConflicts(n: number): this {
    this.conflictFailures = n;
    return this;
  }

  /** The next N `booking.create` calls fail with a P2002 reference collision. */
  failNextReferences(n: number): this {
    this.referenceFailures = n;
    return this;
  }

  get transactionAttempts(): number {
    return this.transactionCount;
  }

  /**
   * A serializable transaction, in miniature: one at a time, in arrival order. That is
   * what makes the two-creates race deterministic — the loser's re-check always runs
   * after the winner's insert committed to the shared state.
   */
  $transaction<R>(fn: (tx: unknown) => Promise<R>): Promise<R> {
    const attempt = this.queue.then(async () => {
      this.transactionCount += 1;
      this.aborted = false;
      if (this.conflictFailures > 0) {
        this.conflictFailures -= 1;
        throw knownError('P2034');
      }
      try {
        return await fn(this.delegates());
      } catch (error) {
        // A failed statement leaves the transaction aborted; a fresh `$transaction`
        // clears it above.
        this.aborted = true;
        throw error;
      }
    });
    // The queue swallows both outcomes so the next transaction still runs: a failure is
    // not a stuck queue.
    this.queue = attempt.then(
      () => undefined,
      () => undefined,
    );
    return attempt;
  }

  /**
   * The row shape the real repository's `BOOKING_SELECT` reads back, which is what
   * `toBookingRecord` expects: every selected column plus the narrowed room relation.
   */
  static fullRow(row: StoredBooking, room?: RoomSpec): Record<string, unknown> {
    return {
      ...row,
      room: { name: room?.name ?? 'Room', hotelId: room?.hotelId ?? 'hotel' },
    };
  }

  /** The `HOTEL_SNAPSHOT_SELECT` projection the real read returns. */
  static hotelRow(hotel: HotelSpec): Record<string, unknown> {
    return {
      id: hotel.id,
      slug: hotel.slug,
      name: hotel.name,
      city: hotel.city,
      country: hotel.country,
      addressLine: hotel.addressLine,
      images: hotel.coverImage ? [{ url: hotel.coverImage }] : [],
    };
  }

  /** The model delegates, shared by the plain reads and the tx client: one state. */
  private delegates(): Record<string, unknown> {
    if (!this.delegatesCache) this.delegatesCache = makeDelegates(this);
    return this.delegatesCache;
  }

  get booking(): unknown {
    return this.delegates().booking;
  }

  get room(): unknown {
    return this.delegates().room;
  }

  get blackoutDate(): unknown {
    return this.delegates().blackoutDate;
  }

  get roomPrice(): unknown {
    return this.delegates().roomPrice;
  }

  get hotel(): unknown {
    return this.delegates().hotel;
  }
}

/**
 * Every model delegate the repository issues, reading and writing `prisma`'s one
 * in-memory state. The plain reads (`this.prisma.booking.findUnique`, ...) and the
 * transaction client are the same object, which is what the serialised `$transaction`
 * below is emulating: the tx's writes are visible to later reads.
 */
function makeDelegates(prisma: FakePrisma): Record<string, unknown> {
  const toFullRow = (
    row: StoredBooking,
    room?: RoomSpec,
  ): Record<string, unknown> =>
    FakePrisma.fullRow(row, room ?? prisma.rooms.get(row.roomId));
  return {
    room: {
      findUnique: async (args: { where: { id: string }; select?: unknown }) => {
        prisma.assertLive();
        const room = prisma.rooms.get(args.where.id);
        if (!room) return null;
        return {
          id: room.id,
          hotelId: room.hotelId,
          maxGuests: room.maxGuests,
          totalInventory: room.totalInventory,
        };
      },
    },
    booking: {
      findMany: async (args: {
        where: Prisma.BookingWhereInput;
        orderBy?: Prisma.BookingOrderByWithRelationInput;
      }) => {
        prisma.assertLive();
        const where = args.where;
        // Two shapes share this delegate. The owner read is the plain `{ guestId }`
        // filter; the overlap read is the pure T18 predicate, and is interpreted here
        // rather than re-derived, so a broken builder is caught in this test.
        if (where.guestId !== undefined) {
          const rows = prisma.bookings.filter(
            (row) => row.guestId === where.guestId,
          );
          if (args.orderBy?.createdAt === 'desc') {
            rows.sort((a, b) =>
              a.createdAt > b.createdAt
                ? 1
                : a.createdAt < b.createdAt
                  ? -1
                  : 0,
            );
            rows.reverse();
          }
          return rows.map((row) => toFullRow(row));
        }
        const roomIn = (where.roomId as { in: readonly string[] }).in;
        const statusIn = (where.status as { in: readonly string[] }).in;
        const checkInLt = (where.checkIn as { lt: Date }).lt;
        const checkOutGt = (where.checkOut as { gt: Date }).gt;
        return prisma.bookings
          .filter(
            (row) =>
              roomIn.includes(row.roomId) &&
              statusIn.includes(row.status) &&
              row.checkIn < checkInLt &&
              row.checkOut > checkOutGt,
          )
          .map((row) => ({
            roomId: row.roomId,
            checkIn: row.checkIn,
            checkOut: row.checkOut,
          }));
      },
      findUnique: async (args: { where: { id: string }; select?: unknown }) => {
        const row = prisma.bookings.find(
          (candidate) => candidate.id === args.where.id,
        );
        return row ? toFullRow(row) : null;
      },
      updateMany: async (args: {
        where: { id: string; guestId: string; status: BookingStatus };
        data: { status: BookingStatus };
      }) => {
        const row = prisma.bookings.find(
          (candidate) => candidate.id === args.where.id,
        );
        // The owner and the expected status are part of the write, not a prior read.
        if (
          !row ||
          row.guestId !== args.where.guestId ||
          row.status !== args.where.status
        ) {
          return { count: 0 };
        }
        row.status = args.data.status;
        return { count: 1 };
      },
      create: async (args: {
        data: Record<string, unknown>;
        select?: unknown;
      }) => {
        prisma.assertLive();
        // The production call site is the generated create input; the fake just reads
        // back the fields it stores, typed as it stores them.
        const data = args.data as {
          reference: string;
          guestId: string;
          roomId: string;
          checkIn: Date;
          checkOut: Date;
          guestsCount: number;
          nights: number;
          subtotalCents: number;
          feesCents: number;
          totalCents: number;
          currency: string;
          status: BookingStatus;
        };
        prisma.attemptedReferences.push(data.reference);
        if (prisma.referenceFailures > 0) {
          prisma.referenceFailures -= 1;
          throw knownError('P2002');
        }
        const room = prisma.rooms.get(data.roomId);
        const row: StoredBooking = {
          id: `b-${++prisma.nextId}`,
          reference: data.reference,
          status: data.status,
          guestId: data.guestId,
          roomId: data.roomId,
          checkIn: data.checkIn,
          checkOut: data.checkOut,
          guestsCount: data.guestsCount,
          nights: data.nights,
          subtotalCents: data.subtotalCents,
          feesCents: data.feesCents,
          totalCents: data.totalCents,
          currency: data.currency,
          createdAt: new Date(prisma.baseTime + prisma.nextId),
        };
        prisma.bookings.push(row);
        return toFullRow(row, room);
      },
    },
    blackoutDate: {
      findMany: async (args: { where: Prisma.BlackoutDateWhereInput }) => {
        prisma.assertLive();
        const where = args.where;
        const and = (where as { AND?: unknown[] }).AND;
        expect(and).toHaveLength(2);
        const windowWhere = and?.[0] as {
          hotelId: string;
          startsOn: { lt: Date };
          endsOn: { gte: Date };
        };
        const ownerWhere = and?.[1] as {
          OR: Array<{ roomId: { in: readonly string[] } | null }>;
        };
        return prisma.blackouts
          .filter(
            (row) =>
              row.hotelId === windowWhere.hotelId &&
              row.startsOn < windowWhere.startsOn.lt &&
              row.endsOn >= windowWhere.endsOn.gte,
          )
          .filter((row) =>
            ownerWhere.OR.some((or) =>
              or.roomId === null
                ? row.roomId === null
                : row.roomId !== null &&
                  (or.roomId as { in: readonly string[] }).in.includes(
                    row.roomId,
                  ),
            ),
          )
          .map((row) => ({
            roomId: row.roomId,
            startsOn: row.startsOn,
            endsOn: row.endsOn,
          }));
      },
    },
    roomPrice: {
      findMany: async (args: {
        where: { roomId: string };
        select?: unknown;
      }) => {
        const currencies = prisma.priceCurrencies.get(args.where.roomId);
        return currencies ? currencies.map((currency) => ({ currency })) : [];
      },
    },
    hotel: {
      findUnique: async (args: { where: { id: string }; select?: unknown }) => {
        prisma.assertLive();
        const hotel = prisma.hotels.get(args.where.id);
        if (!hotel) return null;
        return FakePrisma.hotelRow(hotel);
      },
      findMany: async (args: {
        where: { id: { in: readonly string[] } };
        select?: unknown;
      }) => {
        prisma.assertLive();
        return args.where.id.in
          .map((id) => prisma.hotels.get(id))
          .filter((hotel): hotel is HotelSpec => hotel !== undefined)
          .map((hotel) => FakePrisma.hotelRow(hotel));
      },
    },
  };
}

const HOTEL_ID = '11111111-1111-4111-8111-111111111111';
const ROOM_ID = '22222222-2222-4222-8222-222222222222';
const GUEST_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const GUEST_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function oneInventoryRoom(overrides: Partial<RoomSpec> = {}): RoomSpec {
  return {
    id: ROOM_ID,
    hotelId: HOTEL_ID,
    name: 'Deluxe King',
    maxGuests: 2,
    totalInventory: 1,
    ...overrides,
  };
}

function input(
  overrides: Partial<BookingCreateInput> = {},
): BookingCreateInput {
  return {
    guestId: GUEST_A,
    roomId: ROOM_ID,
    checkIn: '2026-06-01',
    checkOut: '2026-06-04',
    guests: 2,
    currency: 'USD',
    subtotalCents: 60_000,
    feesCents: 0,
    totalCents: 60_000,
    ...overrides,
  };
}

function repository(
  prisma = new FakePrisma().withRoom(oneInventoryRoom()),
): PrismaBookingRepository {
  return new PrismaBookingRepository(prisma as unknown as PrismaService);
}

describe('generateBookingReference', () => {
  it('is a two-letter prefix and four zero-padded digits', () => {
    expect(BOOKING_REFERENCE_PREFIX).toBe('GB');
    for (let i = 0; i < 50; i++) {
      expect(generateBookingReference()).toMatch(/^GB-\d{4}$/);
    }
  });

  it('collides rarely enough that a fresh draw differs from an old one', () => {
    const first = generateBookingReference();
    expect(generateBookingReference()).not.toBe(first);
  });
});

describe('PrismaBookingRepository.createPending', () => {
  it('inserts a PENDING booking with the money snapshot the caller computed', async () => {
    const prisma = new FakePrisma().withRoom(oneInventoryRoom());
    const repo = repository(prisma);

    const record = await repo.createPending(input());

    expect(record.status).toBe('PENDING');
    expect(record.reference).toMatch(/^GB-\d{4}$/);
    expect(record.checkIn).toBe('2026-06-01');
    expect(record.checkOut).toBe('2026-06-04');
    expect(record.nights).toBe(3);
    expect(record.totalCents).toBe(60_000);
    expect(prisma.bookings).toHaveLength(1);
    // The store form is a UTC-midnight Date, so the row and the math agree on nights.
    expect(prisma.bookings[0]?.checkIn).toEqual(day('2026-06-01'));
    expect(prisma.bookings[0]?.checkOut).toEqual(day('2026-06-04'));
  });

  it('answers ROOM_UNAVAILABLE when the in-transaction re-check finds the room held', async () => {
    // The caller's pre-check ran earlier and saw nothing; the hold landed since. Only the
    // re-check on the tx client can see it, and this is what the insert refuses on.
    const prisma = new FakePrisma().withRoom(oneInventoryRoom()).withBooking({
      reference: 'GB-0001',
      status: 'PENDING',
      guestId: GUEST_B,
      roomId: ROOM_ID,
      checkIn: day('2026-06-01'),
      checkOut: day('2026-06-04'),
      guestsCount: 2,
      nights: 3,
      subtotalCents: 60_000,
      feesCents: 0,
      totalCents: 60_000,
      currency: 'USD',
    });
    const repo = repository(prisma);

    await expect(repo.createPending(input())).rejects.toMatchObject({
      status: 409,
      response: { code: 'ROOM_UNAVAILABLE' },
    });
    expect(prisma.bookings).toHaveLength(1);
  });

  it('answers ROOM_UNAVAILABLE when a blackout covers one of the nights', async () => {
    const prisma = new FakePrisma().withRoom(oneInventoryRoom()).withBlackout({
      hotelId: HOTEL_ID,
      roomId: ROOM_ID,
      startsOn: day('2026-06-02'),
      endsOn: day('2026-06-02'),
    });
    const repo = repository(prisma);

    await expect(repo.createPending(input())).rejects.toMatchObject({
      status: 409,
      response: { code: 'ROOM_UNAVAILABLE' },
    });
  });

  it('404s a room that vanished between the pre-check and the transaction', async () => {
    const prisma = new FakePrisma();
    const repo = repository(prisma);

    await expect(repo.createPending(input())).rejects.toMatchObject({
      status: 404,
      response: { code: 'ROOM_NOT_FOUND' },
    });
    expect(prisma.bookings).toHaveLength(0);
  });

  /**
   * THE ACCEPTANCE TEST: two interleaved creates for the last unit of a
   * `total_inventory: 1` room produce exactly one success and one 409. The serialised
   * fake makes the split deterministic: the first transaction commits its PENDING row to
   * the shared state, the second re-checks, sees the overlap, and refuses.
   */
  it('sells the last unit to exactly one of two interleaved creates, not both', async () => {
    const prisma = new FakePrisma().withRoom(oneInventoryRoom());
    const repo = repository(prisma);

    const results = await Promise.allSettled([
      repo.createPending(input()),
      repo.createPending(input({ guestId: GUEST_B })),
    ]);

    const fulfilled = results.filter(
      (result) => result.status === 'fulfilled',
    ) as PromiseFulfilledResult<unknown>[];
    const rejected = results.filter(
      (result) => result.status === 'rejected',
    ) as PromiseRejectedResult[];

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    // One PENDING row in the "database" — the room is not oversold.
    expect(prisma.bookings).toHaveLength(1);
    expect(prisma.bookings[0]?.status).toBe('PENDING');
    // The loser is answered with the ticket's code, not a 500.
    const loser = rejected[0]?.reason as ApiError;
    expect(loser).toBeInstanceOf(ApiError);
    expect(loser.getStatus()).toBe(409);
    expect(loser.getResponse()).toMatchObject({ code: 'ROOM_UNAVAILABLE' });
  });

  it('retries a P2034 write conflict and succeeds on the re-run', async () => {
    const prisma = new FakePrisma().withRoom(oneInventoryRoom());
    prisma.failNextWriteConflicts(1);
    const repo = repository(prisma);

    const record = await repo.createPending(input());

    // The first attempt conflicted, the second saw clean state and committed.
    expect(prisma.transactionAttempts).toBe(2);
    expect(record.status).toBe('PENDING');
    expect(prisma.bookings).toHaveLength(1);
  });

  it('gives up after the attempt cap and answers ROOM_UNAVAILABLE, not a crash', async () => {
    const prisma = new FakePrisma().withRoom(oneInventoryRoom());
    prisma.failNextWriteConflicts(BOOKING_TX_MAX_ATTEMPTS);
    const repo = repository(prisma);

    await expect(repo.createPending(input())).rejects.toMatchObject({
      status: 409,
      response: { code: 'ROOM_UNAVAILABLE' },
    });
    expect(prisma.transactionAttempts).toBe(BOOKING_TX_MAX_ATTEMPTS);
    // Nothing was committed, so the room is still honestly unbookable.
    expect(prisma.bookings).toHaveLength(0);
  });

  it('regenerates a colliding reference and the insert lands on a free one', async () => {
    const prisma = new FakePrisma().withRoom(oneInventoryRoom());
    prisma.failNextReferences(2);
    const repo = repository(prisma);

    const record = await repo.createPending(input());

    expect(prisma.attemptedReferences).toHaveLength(3);
    // Each regeneration is a whole new transaction: the aborted one cannot be used.
    expect(prisma.transactionAttempts).toBe(3);
    expect(record.reference).toBe(prisma.attemptedReferences[2]);
    expect(prisma.bookings[0]?.reference).toBe(record.reference);
  });

  it('answers INTERNAL_ERROR when every regeneration collides', async () => {
    const prisma = new FakePrisma().withRoom(oneInventoryRoom());
    prisma.failNextReferences(BOOKING_REFERENCE_MAX_REGENERATIONS + 1);
    const repo = repository(prisma);

    await expect(repo.createPending(input())).rejects.toMatchObject({
      status: 500,
      response: { code: 'INTERNAL_ERROR' },
    });
    expect(prisma.bookings).toHaveLength(0);
  });
});

describe('PrismaBookingRepository reads', () => {
  it('finds a booking by id and nothing for a missing one', async () => {
    const prisma = new FakePrisma().withRoom(oneInventoryRoom());
    const repo = repository(prisma);
    const record = await repo.createPending(input());

    expect(await repo.findById(record.id)).toEqual(record);
    expect(await repo.findById('nope')).toBeNull();
  });

  it("lists the caller's bookings, newest first", async () => {
    // Three creates need three units: on the one-inventory room the in-transaction
    // re-check would rightly refuse the second and third.
    const prisma = new FakePrisma().withRoom(
      oneInventoryRoom({ totalInventory: 3 }),
    );
    const repo = repository(prisma);
    const first = await repo.createPending(input({ guestId: GUEST_A }));
    const second = await repo.createPending(input({ guestId: GUEST_B }));
    const third = await repo.createPending(input({ guestId: GUEST_A }));

    expect(await repo.findForOwner(GUEST_A)).toEqual([third, first]);
    expect(await repo.findForOwner(GUEST_B)).toEqual([second]);
  });

  it('reads the hotel snapshot the DTO embeds, with the cover image or null', async () => {
    const prisma = new FakePrisma()
      .withRoom(oneInventoryRoom())
      .withHotel({
        id: HOTEL_ID,
        slug: 'the-larkspur-hotel',
        name: 'Larkspur House',
        city: 'Lisbon',
        country: 'Portugal',
        addressLine: '12 Rua do Vale',
        coverImage: 'https://images.test/cover.jpg',
      })
      .withHotel({
        id: '55555555-5555-4555-8555-555555555555',
        slug: 'no-cover',
        name: 'No Cover',
        city: 'Porto',
        country: 'Portugal',
        addressLine: '1 Rua',
        coverImage: null,
      });
    const repo = repository(prisma);

    expect(await repo.findHotelSnapshot(HOTEL_ID)).toEqual({
      id: HOTEL_ID,
      slug: 'the-larkspur-hotel',
      name: 'Larkspur House',
      city: 'Lisbon',
      country: 'Portugal',
      addressLine: '12 Rua do Vale',
      coverImage: 'https://images.test/cover.jpg',
    });
    expect(
      (await repo.findHotelSnapshot('55555555-5555-4555-8555-555555555555'))
        ?.coverImage,
    ).toBeNull();
    expect(await repo.findHotelSnapshot('nope')).toBeNull();
  });

  it('reads many hotel snapshots in one call and skips the ids with no hotel', async () => {
    const prisma = new FakePrisma()
      .withHotel({
        id: HOTEL_ID,
        slug: 'the-larkspur-hotel',
        name: 'Larkspur House',
        city: 'Lisbon',
        country: 'Portugal',
        addressLine: '12 Rua do Vale',
        coverImage: null,
      })
      .withHotel({
        id: '55555555-5555-4555-8555-555555555555',
        slug: 'no-cover',
        name: 'No Cover',
        city: 'Porto',
        country: 'Portugal',
        addressLine: '1 Rua',
        coverImage: null,
      });
    const repo = repository(prisma);

    const snapshots = await repo.findHotelSnapshots([
      HOTEL_ID,
      HOTEL_ID,
      '55555555-5555-4555-8555-555555555555',
      'nope',
    ]);

    // The duplicate id is collapsed, so a long booking list does not grow the `in`.
    expect(snapshots.map((hotel) => hotel.id)).toEqual([
      HOTEL_ID,
      '55555555-5555-4555-8555-555555555555',
    ]);
    expect(await repo.findHotelSnapshots([])).toEqual([]);
  });

  it("reports the room's price currency, or null when the room is unpriced", async () => {
    const prisma = new FakePrisma()
      .withRoom(oneInventoryRoom())
      .withPriceCurrencies(ROOM_ID, 'EUR');
    const repo = repository(prisma);

    expect(await repo.findRoomPriceCurrency(ROOM_ID)).toBe('EUR');
    expect(await repo.findRoomPriceCurrency('nope')).toBeNull();
  });

  it('defaults to USD for a room priced in several currencies, like the quote does', async () => {
    const prisma = new FakePrisma()
      .withRoom(oneInventoryRoom())
      .withPriceCurrencies(ROOM_ID, 'EGP', 'USD', 'EUR');
    const repo = repository(prisma);

    // Alphabetically first would be EGP, which the quote endpoint never defaults to.
    expect(await repo.findRoomPriceCurrency(ROOM_ID)).toBe('USD');
  });

  it('flips the status only for the owner and only out of the expected state', async () => {
    const prisma = new FakePrisma().withRoom(oneInventoryRoom());
    const repo = repository(prisma);
    const record = await repo.createPending(input());

    const updated = await repo.updateStatus(
      record.id,
      GUEST_A,
      'CONFIRMED',
      'CANCELLED',
    );
    expect(updated).toBeNull();
    expect(prisma.bookings[0]?.status).toBe('PENDING');

    await repo.updateStatus(record.id, GUEST_B, 'PENDING', 'CANCELLED');
    expect(prisma.bookings[0]?.status).toBe('PENDING');

    const confirmed = await repo.updateStatus(
      record.id,
      GUEST_A,
      'PENDING',
      'CANCELLED',
    );
    expect(confirmed?.status).toBe('CANCELLED');
    expect(prisma.bookings[0]?.status).toBe('CANCELLED');
    expect(
      await repo.updateStatus('nope', GUEST_A, 'PENDING', 'CANCELLED'),
    ).toBeNull();
  });
});
