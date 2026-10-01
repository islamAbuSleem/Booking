import { ApiError } from '../../common/errors/api-error.js';
import {
  type AvailabilityRepository,
  type AvailabilityRoom,
  type BlackoutWindow,
  type BookingOverlap,
  type HotelRooms,
  type RoomPrice,
} from '../../prisma/availability.repository.js';
import {
  type BookingCreateInput,
  type BookingHotelSnapshot,
  type BookingRecord,
  type BookingRepository,
  type BookingStatus,
} from '../../prisma/bookings.repository.js';
import { QUOTE_FEES_CENTS, stayNights } from './availability.service.js';
import { BookingsService } from './bookings.service.js';
import { createBookingSchema, type CreateBooking } from './dto/booking.dto.js';

/**
 * T20 — the bookings rules over two in-memory fakes: one for the T18 availability seam,
 * one for the bookings repository. No database, no Nest container. The transaction
 * behaviour itself (the oversell proof and the retry loop) lives in
 * `prisma-bookings.repository.spec.ts`, against a fake `PrismaService`.
 */

const HOTEL_ID = '11111111-1111-4111-8111-111111111111';
const ROOM_ID = '22222222-2222-4222-8222-222222222222';
const CALLER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SOMEONE_ELSE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const HOTEL_SNAPSHOT: BookingHotelSnapshot = {
  id: HOTEL_ID,
  slug: 'the-larkspur-hotel',
  name: 'Larkspur House',
  city: 'Lisbon',
  country: 'Portugal',
  addressLine: '12 Rua do Vale',
  coverImage: 'https://images.test/larkspur-cover.jpg',
};

function room(overrides: Partial<AvailabilityRoom> = {}): AvailabilityRoom {
  return {
    id: ROOM_ID,
    hotelId: HOTEL_ID,
    name: 'Deluxe King',
    bedType: 'king',
    maxGuests: 2,
    totalInventory: 3,
    ...overrides,
  };
}

/** The one state both fakes read and write, so a test seeds it and asserts on it. */
interface World {
  seq: number;
  room: AvailabilityRoom;
  hotelStatus: 'PENDING' | 'PUBLISHED';
  price: RoomPrice | null;
  /** The room's price currency for the currency default; `null` is "no price row at all". */
  priceCurrency: string | null;
  overlaps: BookingOverlap[];
  blackouts: BlackoutWindow[];
  bookings: Map<string, BookingRecord>;
}

function world(overrides: Partial<World> = {}): World {
  return {
    seq: 0,
    room: room(),
    hotelStatus: 'PUBLISHED',
    price: { amountCents: 20_000, currency: 'USD' },
    priceCurrency: 'USD',
    overlaps: [],
    blackouts: [],
    bookings: new Map(),
    ...overrides,
  };
}

class FakeAvailabilityRepository implements AvailabilityRepository {
  constructor(private readonly w: World) {}

  async findHotelRooms(): Promise<HotelRooms | null> {
    return { id: HOTEL_ID, status: this.w.hotelStatus, rooms: [] };
  }

  async findRoom(id: string): Promise<AvailabilityRoom | null> {
    return id === this.w.room.id ? this.w.room : null;
  }

  async findOverlappingBookings(
    roomIds: readonly string[],
  ): Promise<BookingOverlap[]> {
    return this.w.overlaps.filter((overlap) =>
      roomIds.includes(overlap.roomId),
    );
  }

  async findOverlappingBlackouts(): Promise<BlackoutWindow[]> {
    return this.w.blackouts;
  }

  async findRoomPrice(id: string, currency: string): Promise<RoomPrice | null> {
    if (id !== this.w.room.id) return null;
    if (!this.w.price) return null;
    return this.w.price.currency === currency ? this.w.price : null;
  }
}

class FakeBookingsRepository implements BookingRepository {
  readonly created: BookingCreateInput[] = [];
  /** How many times a hotel snapshot was read, so the list's N+1 is countable. */
  snapshotReads = 0;

  constructor(private readonly w: World) {}

  async createPending(input: BookingCreateInput): Promise<BookingRecord> {
    this.created.push(input);
    const record: BookingRecord = {
      id: `b-${++this.w.seq}`,
      reference: `GB-${String(this.w.seq).padStart(4, '0')}`,
      status: 'PENDING',
      guestId: input.guestId,
      roomId: input.roomId,
      hotelId: this.w.room.hotelId,
      roomName: this.w.room.name,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      guestsCount: input.guests,
      nights: stayNights(input.checkIn, input.checkOut).length,
      subtotalCents: input.subtotalCents,
      feesCents: input.feesCents,
      totalCents: input.totalCents,
      currency: input.currency,
      createdAt: new Date('2026-05-20T10:00:00.000Z'),
    };
    this.w.bookings.set(record.id, record);
    return record;
  }

  async findById(bookingId: string): Promise<BookingRecord | null> {
    return this.w.bookings.get(bookingId) ?? null;
  }

  async findForOwner(ownerId: string): Promise<BookingRecord[]> {
    return [...this.w.bookings.values()].filter(
      (record) => record.guestId === ownerId,
    );
  }

  async findHotelSnapshot(
    hotelId: string,
  ): Promise<BookingHotelSnapshot | null> {
    return hotelId === HOTEL_ID ? HOTEL_SNAPSHOT : null;
  }

  /** One call for the whole list — the count is what the N+1 guard is about. */
  async findHotelSnapshots(
    hotelIds: readonly string[],
  ): Promise<BookingHotelSnapshot[]> {
    this.snapshotReads += 1;
    return [...new Set(hotelIds)]
      .filter((id) => id === HOTEL_ID)
      .map(() => HOTEL_SNAPSHOT);
  }

  async findRoomPriceCurrency(): Promise<string | null> {
    return this.w.priceCurrency;
  }

  async updateStatus(
    bookingId: string,
    ownerId: string,
    from: BookingStatus,
    to: BookingStatus,
  ): Promise<BookingRecord | null> {
    const record = this.w.bookings.get(bookingId);
    if (!record || record.guestId !== ownerId || record.status !== from) {
      return null;
    }
    const updated = { ...record, status: to };
    this.w.bookings.set(bookingId, updated);
    return updated;
  }
}

/**
 * `createBookingSchema.parse` first, so the service is fed what the pipe would feed it:
 * a body that carries bogus money fields is stripped before the service sees it.
 */
function request(overrides: Record<string, unknown> = {}): CreateBooking {
  return createBookingSchema.parse({
    roomId: ROOM_ID,
    checkIn: '2026-06-01',
    checkOut: '2026-06-04',
    guests: 2,
    guestName: 'Ada Lovelace',
    guestEmail: 'ada@example.com',
    guestPhone: '+351 21 000 0000',
    ...overrides,
  });
}

function service(w: World = world()): BookingsService {
  return new BookingsService(
    new FakeAvailabilityRepository(w),
    new FakeBookingsRepository(w),
  );
}

/** The same service, with the booking repository kept so its reads can be counted. */
function serviceWithRepository(w: World): {
  svc: BookingsService;
  bookings: FakeBookingsRepository;
} {
  const bookings = new FakeBookingsRepository(w);
  return {
    svc: new BookingsService(new FakeAvailabilityRepository(w), bookings),
    bookings,
  };
}

describe('BookingsService.create', () => {
  it('creates a PENDING booking with the server-computed money snapshot', async () => {
    const w = world();
    const svc = service(w);

    const dto = await svc.create(CALLER, request());

    // Case 1: PENDING, half-open nights, total = price x nights + fees.
    expect(dto.status).toBe('PENDING');
    expect(dto.checkIn).toBe('2026-06-01');
    expect(dto.checkOut).toBe('2026-06-04');
    expect(dto.nights).toBe(3);
    expect(dto.subtotalCents).toBe(60_000);
    expect(dto.feesCents).toBe(QUOTE_FEES_CENTS);
    expect(dto.totalCents).toBe(60_000 + QUOTE_FEES_CENTS);
    expect(dto.currency).toBe('USD');
    expect(dto.guestsCount).toBe(2);
    expect(dto.reference).toMatch(/^GB-\d{4}$/);
    expect(dto.createdAt).toBe('2026-05-20T10:00:00.000Z');
    // The embedded snapshot is the whole point: no second fetch on the detail page.
    expect(dto.hotel).toEqual(HOTEL_SNAPSHOT);
    expect(dto.room).toEqual({ name: 'Deluxe King' });
    // Case 1b: two creates get distinct references.
    const second = await svc.create(CALLER, request());
    expect(second.reference).not.toBe(dto.reference);
  });

  it('ignores money the client sends, because the body has no money fields', async () => {
    // Case 2: the schema strips the bogus fields, and the service computes its own.
    const w = world();
    const repo = new FakeBookingsRepository(w);
    const svc = new BookingsService(new FakeAvailabilityRepository(w), repo);
    const body = request({
      subtotalCents: 99_999,
      totalCents: 1,
      feesCents: 7,
    });

    const dto = await svc.create(CALLER, body);

    expect('subtotalCents' in body).toBe(false);
    expect('totalCents' in body).toBe(false);
    expect(dto.subtotalCents).toBe(60_000);
    expect(dto.totalCents).toBe(60_000 + QUOTE_FEES_CENTS);
    // And the write carries the server numbers, not the client's.
    expect(repo.created).toHaveLength(1);
    expect(repo.created[0]?.totalCents).toBe(60_000 + QUOTE_FEES_CENTS);
  });

  it('409s ROOM_UNAVAILABLE when the pre-check finds the room sold out', async () => {
    // Case 3: last unit already held, and PENDING holds exactly like CONFIRMED (D52).
    const w = world({
      room: room({ totalInventory: 1 }),
      overlaps: [
        { roomId: ROOM_ID, checkIn: '2026-06-01', checkOut: '2026-06-04' },
      ],
    });
    const svc = service(w);

    await expect(svc.create(CALLER, request())).rejects.toMatchObject({
      status: 409,
      response: { code: 'ROOM_UNAVAILABLE' },
    });
  });

  it('422s PRICE_UNAVAILABLE when the room has no price row, never a free stay', async () => {
    // Case 4.
    const w = world({ price: null, priceCurrency: null });
    const svc = service(w);

    await expect(svc.create(CALLER, request())).rejects.toMatchObject({
      status: 422,
      response: {
        code: 'PRICE_UNAVAILABLE',
        message: 'This room has no price in USD',
      },
    });
  });

  it('404s ROOM_NOT_FOUND for an unknown room', async () => {
    // Case 5.
    const w = world();
    const svc = service(w);

    await expect(
      svc.create(
        CALLER,
        request({ roomId: '00000000-0000-4000-8000-000000000000' }),
      ),
    ).rejects.toMatchObject({
      status: 404,
      response: { code: 'ROOM_NOT_FOUND' },
    });
  });

  it('404s a room whose hotel is not published, so a draft cannot be booked', async () => {
    // The create half of the draft-hotel hole the public quote leaves open.
    const w = world({ hotelStatus: 'PENDING' });
    const svc = service(w);

    await expect(svc.create(CALLER, request())).rejects.toMatchObject({
      status: 404,
      response: { code: 'HOTEL_NOT_FOUND' },
    });
  });

  it('400s when the party outgrows the room, naming the limit', async () => {
    // Case 6.
    const w = world({ room: room({ maxGuests: 2 }) });
    const svc = service(w);

    await expect(
      svc.create(CALLER, request({ guests: 3 })),
    ).rejects.toMatchObject({
      status: 400,
      response: {
        code: 'BAD_REQUEST',
        message: 'This room sleeps at most 2 guest(s)',
        details: { maxGuests: 2, guests: 3 },
      },
    });
  });

  it("defaults an omitted currency to the room's price currency", async () => {
    const w = world({
      price: { amountCents: 9_000, currency: 'EUR' },
      priceCurrency: 'EUR',
    });
    const svc = service(w);

    const dto = await svc.create(CALLER, request());

    expect(dto.currency).toBe('EUR');
    expect(dto.subtotalCents).toBe(27_000);
  });

  it('books in the requested currency when the room prices it', async () => {
    const w = world({ price: { amountCents: 9_000, currency: 'EUR' } });
    const svc = service(w);

    const dto = await svc.create(CALLER, request({ currency: 'eur' }));

    expect(dto.currency).toBe('EUR');
  });
});

describe('BookingsService.list', () => {
  it("returns only the caller's bookings, and not anyone else's", async () => {
    // Case 9. (Newest-first ordering is the repository's job and is pinned in
    // prisma-bookings.repository.spec.ts, where the fake sorts on `createdAt`.)
    const w = world();
    const svc = service(w);
    const own = await svc.create(CALLER, request());
    await svc.create(SOMEONE_ELSE, request());
    const ownSecond = await svc.create(CALLER, request());

    const mine = await svc.list(CALLER);
    expect(mine.total).toBe(2);
    expect(mine.items.map((item) => item.id).sort()).toEqual(
      [own.id, ownSecond.id].sort(),
    );

    const theirs = await svc.list(SOMEONE_ELSE);
    expect(theirs.total).toBe(1);
    expect(theirs.items[0]?.guestsCount).toBe(2);
  });

  it('reads the hotel snapshots once for the whole list, not once per row', async () => {
    const w = world();
    const { svc, bookings } = serviceWithRepository(w);
    await svc.create(CALLER, request());
    await svc.create(
      CALLER,
      request({ checkIn: '2026-06-10', checkOut: '2026-06-13' }),
    );

    bookings.snapshotReads = 0;
    const mine = await svc.list(CALLER);

    expect(mine.total).toBe(2);
    expect(bookings.snapshotReads).toBe(1);
    expect(mine.items.every((item) => item.hotel.id === HOTEL_ID)).toBe(true);
  });

  it('is an empty list, not an error, for a caller with no bookings', async () => {
    const svc = service();

    const result = await svc.list(CALLER);

    expect(result).toEqual({ items: [], total: 0 });
  });
});

describe('BookingsService.get', () => {
  it("returns the caller's own booking", async () => {
    // Case 10a.
    const w = world();
    const svc = service(w);
    const created = await svc.create(CALLER, request());

    const dto = await svc.get(CALLER, created.id);

    expect(dto.id).toBe(created.id);
    expect(dto.hotel).toEqual(HOTEL_SNAPSHOT);
  });

  it('403s NOT_BOOKING_OWNER for a booking that belongs to someone else', async () => {
    // Case 10b: 403, not 404 — the row exists, and its existence is the secret.
    const w = world();
    const svc = service(w);
    const created = await svc.create(SOMEONE_ELSE, request());

    await expect(svc.get(CALLER, created.id)).rejects.toMatchObject({
      status: 403,
      response: { code: 'NOT_BOOKING_OWNER' },
    });
  });

  it('404s BOOKING_NOT_FOUND for a booking that does not exist', async () => {
    // Case 10c.
    const svc = service();

    await expect(
      svc.get(CALLER, '00000000-0000-4000-8000-000000000000'),
    ).rejects.toMatchObject({
      status: 404,
      response: { code: 'BOOKING_NOT_FOUND' },
    });
  });
});

/** The stored record, flipped in place — the map holds `BookingRecord`s, not DTOs. */
function confirm(w: World, id: string): void {
  const record = w.bookings.get(id);
  if (!record) throw new Error('test setup: booking missing');
  w.bookings.set(id, { ...record, status: 'CONFIRMED' });
}

describe('BookingsService.cancel', () => {
  it('flips a CONFIRMED booking to CANCELLED and returns the new state', async () => {
    // Case 11a.
    const w = world();
    const svc = service(w);
    const created = await svc.create(CALLER, request());
    confirm(w, created.id);

    const dto = await svc.cancel(CALLER, created.id);

    expect(dto.status).toBe('CANCELLED');
    expect(w.bookings.get(created.id)?.status).toBe('CANCELLED');
  });

  it('409s INVALID_CANCEL_STATE on a PENDING booking: the hold is not cancelable yet', async () => {
    // Case 11b. T26/T27 confirm the PENDING hold before it can be cancelled.
    const w = world();
    const svc = service(w);
    const created = await svc.create(CALLER, request());

    await expect(svc.cancel(CALLER, created.id)).rejects.toMatchObject({
      status: 409,
      response: { code: 'INVALID_CANCEL_STATE' },
    });
    expect(w.bookings.get(created.id)?.status).toBe('PENDING');
  });

  it('403s when the booking belongs to someone else, before the state check', async () => {
    // Case 11c.
    const w = world();
    const svc = service(w);
    const created = await svc.create(SOMEONE_ELSE, request());
    confirm(w, created.id);

    await expect(svc.cancel(CALLER, created.id)).rejects.toMatchObject({
      status: 403,
      response: { code: 'NOT_BOOKING_OWNER' },
    });
  });

  it('404s cancelling a booking that does not exist', async () => {
    const svc = service();

    await expect(
      svc.cancel(CALLER, '00000000-0000-4000-8000-000000000000'),
    ).rejects.toMatchObject({
      status: 404,
      response: { code: 'BOOKING_NOT_FOUND' },
    });
  });
});

describe('the error contract', () => {
  it('answers only with ApiError and a stable machine code, never an exception', async () => {
    const svc = service();
    const badRoom = { ...request(), roomId: 'not-a-uuid' } as CreateBooking;

    for (const promise of [
      svc.create(CALLER, badRoom),
      svc.get(CALLER, 'nope'),
    ]) {
      const error = await promise.catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).getResponse()).toEqual(
        expect.objectContaining({ code: expect.stringMatching(/^[A-Z_]+$/) }),
      );
    }
  });
});
