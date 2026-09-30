import { ApiError } from '../../common/errors/api-error.js';
import {
  type AvailabilityRepository,
  type AvailabilityRoom,
  type BlackoutWindow,
  type BookingOverlap,
  type HotelRooms,
  type NightDate,
  type RoomPrice,
} from '../../prisma/availability.repository.js';
import {
  AvailabilityService,
  QUOTE_FEES_CENTS,
  QUOTE_HOLD_DURATION_MS,
  evaluateRoomAvailability,
  stayNights,
} from './availability.service.js';
import {
  availabilityQuerySchema,
  quoteRequestSchema,
  type AvailabilityQuery,
  type QuoteRequest,
} from './dto/availability.dto.js';

const HOTEL_ID = '11111111-1111-4111-8111-111111111111';
const ROOM_ID = '22222222-2222-4222-8222-222222222222';

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

/** A booking that holds the room for the half-open range `[checkIn, checkOut)`. */
function stay(
  checkIn: NightDate,
  checkOut: NightDate,
  roomId = ROOM_ID,
): BookingOverlap {
  return { roomId, checkIn, checkOut };
}

/** A blackout is inclusive on BOTH ends, which is not a stay's convention. */
function blackout(
  startsOn: NightDate,
  endsOn: NightDate,
  roomId: string | null = ROOM_ID,
): BlackoutWindow {
  return { roomId, startsOn, endsOn };
}

/**
 * Stands in for Prisma. The service talks to `AvailabilityRepository`, not
 * `PrismaService`, so every rule in this file runs with no database and no Nest container.
 */
class FakeAvailabilityRepository implements AvailabilityRepository {
  readonly bookingWindows: Array<[readonly string[], NightDate, NightDate]> =
    [];
  readonly blackoutWindows: Array<[string, readonly string[]]> = [];
  readonly priceReads: Array<[string, string]> = [];
  private hotelRooms: HotelRooms | null;
  private rooms = new Map<string, AvailabilityRoom>();
  private bookings: BookingOverlap[] = [];
  private blackouts: BlackoutWindow[] = [];
  private prices = new Map<string, RoomPrice>();

  constructor(
    hotel: HotelRooms | null = { id: HOTEL_ID, status: 'PUBLISHED', rooms: [] },
  ) {
    this.hotelRooms = hotel;
  }

  withRooms(...rooms: AvailabilityRoom[]): this {
    for (const one of rooms) this.rooms.set(one.id, one);
    return this;
  }

  withBookings(...bookings: BookingOverlap[]): this {
    this.bookings = bookings;
    return this;
  }

  withBlackouts(...blackouts: BlackoutWindow[]): this {
    this.blackouts = blackouts;
    return this;
  }

  withPrice(price: RoomPrice, roomId = ROOM_ID): this {
    this.prices.set(`${roomId}:${price.currency}`, price);
    return this;
  }

  async findHotelRooms(): Promise<HotelRooms | null> {
    return this.hotelRooms;
  }

  async findRoom(id: string): Promise<AvailabilityRoom | null> {
    return this.rooms.get(id) ?? null;
  }

  async findOverlappingBookings(
    roomIds: readonly string[],
    checkIn: NightDate,
    checkOut: NightDate,
  ): Promise<BookingOverlap[]> {
    this.bookingWindows.push([roomIds, checkIn, checkOut]);
    return this.bookings.filter((booking) => roomIds.includes(booking.roomId));
  }

  async findOverlappingBlackouts(
    hotelId: string,
    roomIds: readonly string[],
  ): Promise<BlackoutWindow[]> {
    this.blackoutWindows.push([hotelId, roomIds]);
    return this.blackouts.filter(
      (window) => window.roomId === null || roomIds.includes(window.roomId),
    );
  }

  async findRoomPrice(id: string, currency: string): Promise<RoomPrice | null> {
    this.priceReads.push([id, currency]);
    return this.prices.get(`${id}:${currency}`) ?? null;
  }
}

function query(overrides: Record<string, unknown> = {}): AvailabilityQuery {
  return availabilityQuerySchema.parse({
    checkIn: '2026-06-01',
    checkOut: '2026-06-04',
    ...overrides,
  });
}

function quoteRequest(overrides: Record<string, unknown> = {}): QuoteRequest {
  return quoteRequestSchema.parse({
    roomId: ROOM_ID,
    checkIn: '2026-06-01',
    checkOut: '2026-06-04',
    guests: 2,
    ...overrides,
  });
}

/** A repository with one sellable room at 200.00/night, which is what most cases need. */
function seededRepository(
  overrides: Partial<AvailabilityRoom> = {},
): FakeAvailabilityRepository {
  return new FakeAvailabilityRepository({
    id: HOTEL_ID,
    status: 'PUBLISHED',
    rooms: [room(overrides)],
  })
    .withRooms(room(overrides))
    .withPrice({ amountCents: 20_000, currency: 'USD' });
}

describe('stayNights', () => {
  it('lists the nights of a half-open range, excluding the checkout day', () => {
    expect(stayNights('2026-06-01', '2026-06-04')).toEqual([
      '2026-06-01',
      '2026-06-02',
      '2026-06-03',
    ]);
  });

  it('is one night for a one-night stay', () => {
    expect(stayNights('2026-06-01', '2026-06-02')).toEqual(['2026-06-01']);
  });

  it('crosses a month and a year boundary', () => {
    expect(stayNights('2026-12-31', '2027-01-02')).toEqual([
      '2026-12-31',
      '2027-01-01',
    ]);
  });

  it('steps by whole days across a DST change, which UTC does not have', () => {
    // Late March is when most of Europe changes its clocks. Every step is a UTC instant,
    // so the night count is unaffected by any host's local timezone.
    expect(stayNights('2026-03-28', '2026-03-31')).toEqual([
      '2026-03-28',
      '2026-03-29',
      '2026-03-30',
    ]);
  });

  it('is empty for a range that ends where it starts', () => {
    expect(stayNights('2026-06-01', '2026-06-01')).toEqual([]);
  });
});

/**
 * D52, stated as tests. Every case here is a scenario a hotel actually hits, so the rule is
 * pinned from both sides: a room that must be sellable and a room that must not be.
 */
describe('evaluateRoomAvailability', () => {
  const THREE_NIGHTS = ['2026-06-01', '2026-06-02', '2026-06-03'];

  it('sells a room with inventory left on every night', () => {
    const result = evaluateRoomAvailability(room(), THREE_NIGHTS, [], [], 2);

    expect(result).toEqual({ remaining: [3, 3, 3], available: true });
  });

  it('is NOT available at exact fit: two bookings on a room of two leaves nothing to sell', () => {
    // The D52 correction. The old "<= total_inventory" wording would have called this
    // bookable and oversold the room by one.
    const exact = room({ totalInventory: 2 });
    const result = evaluateRoomAvailability(
      exact,
      ['2026-06-01'],
      [stay('2026-05-01', '2026-06-03'), stay('2026-05-15', '2026-06-04')],
      [],
      2,
    );

    expect(result.remaining).toEqual([0]);
    expect(result.available).toBe(false);
  });

  it('is NOT available one over capacity, and reports 0 rather than a negative', () => {
    const one = room({ totalInventory: 1 });
    const result = evaluateRoomAvailability(
      one,
      ['2026-06-01'],
      [stay('2026-06-01', '2026-06-02'), stay('2026-06-01', '2026-06-02')],
      [],
      2,
    );

    expect(result.remaining).toEqual([0]);
    expect(result.available).toBe(false);
  });

  it('is NOT available when a blackout covers only some of the nights', () => {
    const result = evaluateRoomAvailability(
      room({ totalInventory: 1 }),
      THREE_NIGHTS,
      [],
      [blackout('2026-06-02', '2026-06-02')],
      2,
    );

    expect(result.remaining).toEqual([1, 0, 1]);
    expect(result.available).toBe(false);
  });

  it('is NOT available when a blackout lands on a middle night of a longer stay', () => {
    const fiveNights = [
      '2026-06-01',
      '2026-06-02',
      '2026-06-03',
      '2026-06-04',
      '2026-06-05',
    ];
    const result = evaluateRoomAvailability(
      room({ totalInventory: 4 }),
      fiveNights,
      [],
      [blackout('2026-06-03', '2026-06-03')],
      2,
    );

    expect(result.remaining).toEqual([4, 4, 0, 4, 4]);
    expect(result.available).toBe(false);
  });

  it('does not double-count back-to-back stays, so the handover night is still sellable', () => {
    // Stay A leaves on the 3rd, stay B arrives on the 3rd. Only B holds the night of the
    // 3rd, so one of the room's two units is still free. Counting both would report 0 and
    // wrongly close a night that is genuinely open.
    const result = evaluateRoomAvailability(
      room({ totalInventory: 2 }),
      ['2026-06-03'],
      [stay('2026-06-01', '2026-06-03'), stay('2026-06-03', '2026-06-05')],
      [],
      2,
    );

    expect(result.remaining).toEqual([1]);
    expect(result.available).toBe(true);
  });

  it('does not count a stay that ends the night a new one starts twice', () => {
    // The same boundary from the other side: the night of the 2nd is the last night of the
    // first stay and the first night of the second, so exactly one of them holds it.
    const result = evaluateRoomAvailability(
      room({ totalInventory: 2 }),
      ['2026-06-02'],
      [stay('2026-06-01', '2026-06-02'), stay('2026-06-02', '2026-06-03')],
      [],
      2,
    );

    expect(result.remaining).toEqual([1]);
    expect(result.available).toBe(true);
  });

  it('blocks every room in the hotel on a hotel-wide blackout', () => {
    const result = evaluateRoomAvailability(
      room(),
      ['2026-06-01'],
      [],
      [blackout('2026-06-01', '2026-06-01', null)],
      2,
    );

    expect(result.remaining).toEqual([0]);
    expect(result.available).toBe(false);
  });

  it('ignores a room-scoped blackout belonging to a different room', () => {
    const result = evaluateRoomAvailability(
      room(),
      ['2026-06-01'],
      [],
      [blackout('2026-06-01', '2026-06-01', 'some-other-room')],
      2,
    );

    expect(result.available).toBe(true);
  });

  it('lets a stay end on the day a blackout starts, because checkOut is not a night', () => {
    const result = evaluateRoomAvailability(
      room(),
      ['2026-06-01', '2026-06-02'],
      [],
      [blackout('2026-06-03', '2026-06-05')],
      2,
    );

    expect(result.remaining).toEqual([3, 3]);
    expect(result.available).toBe(true);
  });

  it('blocks a stay whose first night is the last night of a blackout', () => {
    const result = evaluateRoomAvailability(
      room(),
      ['2026-06-03'],
      [],
      [blackout('2026-06-01', '2026-06-03')],
      2,
    );

    expect(result.available).toBe(false);
  });

  it('is NOT available for a party larger than the room sleeps', () => {
    const result = evaluateRoomAvailability(
      room({ maxGuests: 2 }),
      ['2026-06-01'],
      [],
      [],
      3,
    );

    expect(result.remaining).toEqual([3]);
    expect(result.available).toBe(false);
  });

  it('fails closed on an empty range rather than passing vacuously', () => {
    const result = evaluateRoomAvailability(room(), [], [], [], 2);

    expect(result.remaining).toEqual([]);
    expect(result.available).toBe(false);
  });
});

describe('AvailabilityService.hotelAvailability', () => {
  it('reports a verdict and the per-night remainder for every room', async () => {
    const repository = seededRepository();
    const service = new AvailabilityService(repository);

    const result = await service.hotelAvailability(
      'the-larkspur-hotel',
      query(),
    );

    expect(result.rooms).toEqual([
      {
        room: {
          id: ROOM_ID,
          name: 'Deluxe King',
          bedType: 'king',
          maxGuests: 2,
          totalInventory: 3,
        },
        available: true,
        remainingPerNight: [3, 3, 3],
      },
    ]);
  });

  it('reports a sold-out room rather than dropping it from the list', async () => {
    const repository = seededRepository({ totalInventory: 1 }).withBookings(
      stay('2026-06-01', '2026-06-05'),
    );
    const service = new AvailabilityService(repository);

    const result = await service.hotelAvailability(
      'the-larkspur-hotel',
      query(),
    );

    expect(result.rooms).toHaveLength(1);
    expect(result.rooms[0]?.available).toBe(false);
    expect(result.rooms[0]?.remainingPerNight).toEqual([0, 0, 0]);
  });

  it('asks for every room of the hotel in one window, not one call per room', async () => {
    const second = room({ id: 'room-2', name: 'Twin' });
    const repository = new FakeAvailabilityRepository({
      id: HOTEL_ID,
      status: 'PUBLISHED',
      rooms: [room(), second],
    }).withRooms(room(), second);
    const service = new AvailabilityService(repository);

    await service.hotelAvailability('the-larkspur-hotel', query());

    expect(repository.bookingWindows).toEqual([
      [[ROOM_ID, 'room-2'], '2026-06-01', '2026-06-04'],
    ]);
    expect(repository.blackoutWindows).toEqual([
      [HOTEL_ID, [ROOM_ID, 'room-2']],
    ]);
  });

  it('404s an unknown hotel, so the endpoint cannot probe a draft listing', async () => {
    const service = new AvailabilityService(
      new FakeAvailabilityRepository(null),
    );

    await expect(
      service.hotelAvailability('nope', query()),
    ).rejects.toMatchObject({
      status: 404,
      response: { code: 'HOTEL_NOT_FOUND' },
    });
  });

  it('404s a hotel that is not PUBLISHED, for the same reason the detail read does', async () => {
    const repository = new FakeAvailabilityRepository({
      id: HOTEL_ID,
      status: 'PENDING',
      rooms: [room()],
    });
    const service = new AvailabilityService(repository);

    await expect(
      service.hotelAvailability('the-barn-at-fen-end', query()),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('does not read prices: availability is orthogonal to pricing', async () => {
    // A room with no `room_prices` row still has availability, and saying so here keeps the
    // two endpoints independently useful.
    const repository = new FakeAvailabilityRepository({
      id: HOTEL_ID,
      status: 'PUBLISHED',
      rooms: [room()],
    }).withRooms(room());
    const service = new AvailabilityService(repository);

    const result = await service.hotelAvailability(
      'the-larkspur-hotel',
      query(),
    );

    expect(result.rooms[0]?.available).toBe(true);
  });
});

describe('AvailabilityService.quote', () => {
  it('prices a three-night stay from the per-night rate', async () => {
    const service = new AvailabilityService(seededRepository());

    const quote = await service.quote(quoteRequest());

    expect(quote).toMatchObject({
      nights: 3,
      subtotalCents: 60_000,
      feesCents: QUOTE_FEES_CENTS,
      totalCents: 60_000 + QUOTE_FEES_CENTS,
      currency: 'USD',
    });
    expect(quote.breakdown).toEqual([
      { date: '2026-06-01', priceCents: 20_000 },
      { date: '2026-06-02', priceCents: 20_000 },
      { date: '2026-06-03', priceCents: 20_000 },
    ]);
  });

  it('has one breakdown entry per night, in stay order', async () => {
    const service = new AvailabilityService(seededRepository());

    const quote = await service.quote(
      quoteRequest({ checkIn: '2026-12-31', checkOut: '2027-01-02' }),
    );

    expect(quote.nights).toBe(2);
    expect(quote.breakdown.map((night) => night.date)).toEqual([
      '2026-12-31',
      '2027-01-01',
    ]);
    expect(quote.subtotalCents).toBe(40_000);
  });

  it('keeps every money field in integer cents', async () => {
    const service = new AvailabilityService(
      seededRepository().withPrice({ amountCents: 12_345, currency: 'USD' }),
    );

    const quote = await service.quote(quoteRequest());

    for (const value of [
      quote.subtotalCents,
      quote.feesCents,
      quote.totalCents,
      ...quote.breakdown.map((night) => night.priceCents),
    ]) {
      expect(Number.isInteger(value)).toBe(true);
    }
    expect(quote.subtotalCents).toBe(37_035);
  });

  it('reports a hold window measured from now', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-20T10:00:00.000Z'));
    try {
      const service = new AvailabilityService(seededRepository());

      const quote = await service.quote(quoteRequest());

      expect(quote.holdExpiresAt).toBe('2026-05-20T10:15:00.000Z');
      expect(
        new Date(quote.holdExpiresAt).getTime() -
          new Date('2026-05-20T10:00:00.000Z').getTime(),
      ).toBe(QUOTE_HOLD_DURATION_MS);
    } finally {
      vi.useRealTimers();
    }
  });

  it('quotes in the requested currency and echoes the price row currency back', async () => {
    // Phase 1 seeds one currency per room, so the only way to see a second one exercised
    // is a room priced in something other than the default.
    const repository = new FakeAvailabilityRepository({
      id: HOTEL_ID,
      status: 'PUBLISHED',
      rooms: [room()],
    })
      .withRooms(room())
      .withPrice({ amountCents: 9_000, currency: 'EUR' });
    const service = new AvailabilityService(repository);

    const quote = await service.quote(quoteRequest({ currency: 'eur' }));

    expect(repository.priceReads).toEqual([[ROOM_ID, 'EUR']]);
    expect(quote.currency).toBe('EUR');
    expect(quote.subtotalCents).toBe(27_000);
  });

  it('404s an unknown room before it looks for a price', async () => {
    const service = new AvailabilityService(new FakeAvailabilityRepository());

    const error = await service
      .quote(quoteRequest())
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).getStatus()).toBe(404);
    expect((error as ApiError).getResponse()).toMatchObject({
      code: 'ROOM_NOT_FOUND',
    });
  });

  it('409s with ROOM_UNAVAILABLE for a sold-out room', async () => {
    const repository = seededRepository({ totalInventory: 1 }).withBookings(
      stay('2026-06-01', '2026-06-04'),
    );
    const service = new AvailabilityService(repository);

    await expect(service.quote(quoteRequest())).rejects.toMatchObject({
      status: 409,
      response: { code: 'ROOM_UNAVAILABLE' },
    });
  });

  it('409s when a blackout covers the middle of the stay', async () => {
    const repository = seededRepository().withBlackouts(
      blackout('2026-06-02', '2026-06-02'),
    );
    const service = new AvailabilityService(repository);

    await expect(service.quote(quoteRequest())).rejects.toMatchObject({
      status: 409,
      response: { code: 'ROOM_UNAVAILABLE' },
    });
  });

  it('400s when the party is larger than the room sleeps, naming the limit', async () => {
    const service = new AvailabilityService(seededRepository({ maxGuests: 2 }));

    await expect(
      service.quote(quoteRequest({ guests: 3 })),
    ).rejects.toMatchObject({
      status: 400,
      response: {
        code: 'BAD_REQUEST',
        message: 'This room sleeps at most 2 guest(s)',
        details: { maxGuests: 2, guests: 3 },
      },
    });
  });

  it('422s when the room has no price in the requested currency, never a free stay', async () => {
    const repository = seededRepository();
    const service = new AvailabilityService(repository);

    await expect(
      service.quote(quoteRequest({ currency: 'GBP' })),
    ).rejects.toMatchObject({
      status: 422,
      response: {
        code: 'PRICE_UNAVAILABLE',
        message: 'This room has no price in GBP',
      },
    });
  });

  it('checks availability before it reads a price, so a sold-out room leaks no price', async () => {
    const repository = seededRepository({ totalInventory: 1 }).withBookings(
      stay('2026-06-01', '2026-06-04'),
    );
    const service = new AvailabilityService(repository);

    await expect(service.quote(quoteRequest())).rejects.toMatchObject({
      status: 409,
    });
    // The price row exists, but it was never fetched: the availability problem is the one
    // the client can act on, so it is the one reported.
    expect(repository.priceReads).toEqual([]);
  });
});
