import type {
  BookingRecord,
  BookingRepository,
} from '../../prisma/bookings.repository.js';
import type {
  CancellationRepository,
  PolicyRecord,
} from '../../prisma/cancellation.repository.js';
import { CancellationService } from './cancellations.service.js';

const GUEST_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';
const HOTEL_ID = '33333333-3333-4333-8333-333333333333';
const BOOKING_ID = '44444444-4444-4444-8444-444444444444';
const NOW_MS = Date.parse('2026-06-01T12:00:00Z');

function booking(overrides: Partial<BookingRecord> = {}): BookingRecord {
  return {
    id: BOOKING_ID,
    reference: 'GB-4821',
    status: 'CONFIRMED',
    guestId: GUEST_ID,
    roomId: 'room-1',
    hotelId: HOTEL_ID,
    roomName: 'Courtyard King',
    checkIn: '2026-08-01',
    checkOut: '2026-08-04',
    guestsCount: 2,
    nights: 3,
    subtotalCents: 30000,
    feesCents: 500,
    totalCents: 30500,
    currency: 'USD',
    createdAt: new Date('2026-05-20T10:00:00.000Z'),
    ...overrides,
  };
}

function policy(overrides: Partial<PolicyRecord> = {}): PolicyRecord {
  return {
    hotelId: HOTEL_ID,
    tiers: [
      { daysBefore: 30, refundPercent: 100 },
      { daysBefore: 7, refundPercent: 50 },
    ],
    noRefundWithinHours: 24,
    version: 3,
    ...overrides,
  };
}

class FakeBookings implements BookingRepository {
  constructor(private readonly rows: Map<string, BookingRecord>) {}

  async createPending(): Promise<BookingRecord> {
    throw new Error('unused');
  }

  async findById(bookingId: string): Promise<BookingRecord | null> {
    return this.rows.get(bookingId) ?? null;
  }

  async findForOwner(): Promise<BookingRecord[]> {
    throw new Error('unused');
  }

  async findHotelSnapshot(): Promise<null> {
    return null;
  }

  async findHotelSnapshots(): Promise<[]> {
    return [];
  }

  async findRoomPriceCurrency(): Promise<null> {
    return null;
  }

  async updateStatus(): Promise<null> {
    return null;
  }

  async transitionStatus(): Promise<null> {
    return null;
  }
}

class FakePolicies implements CancellationRepository {
  readonly upserts: string[] = [];

  constructor(
    private readonly rows = new Map<string, PolicyRecord>(),
    private readonly hotels: string[] = [HOTEL_ID],
  ) {}

  async findPolicyByHotel(hotelId: string): Promise<PolicyRecord | null> {
    return this.rows.get(hotelId) ?? null;
  }

  async hotelExists(hotelId: string): Promise<boolean> {
    return this.hotels.includes(hotelId);
  }

  async upsertPolicy(
    hotelId: string,
    tiers: PolicyRecord['tiers'],
    noRefundWithinHours: number,
  ): Promise<PolicyRecord> {
    this.upserts.push(hotelId);
    const version = (this.rows.get(hotelId)?.version ?? 0) + 1;
    const record = { hotelId, tiers, noRefundWithinHours, version };
    this.rows.set(hotelId, record);
    return record;
  }
}

function service(options: {
  bookings?: Map<string, BookingRecord>;
  policies?: Map<string, PolicyRecord>;
  hotels?: string[];
} = {}): {
  cancellations: CancellationService;
  policies: FakePolicies;
} {
  const policies = new FakePolicies(options.policies, options.hotels);
  const bookings = new FakeBookings(
    options.bookings ?? new Map([[BOOKING_ID, booking()]]),
  );
  return {
    cancellations: new CancellationService(policies, bookings),
    policies,
  };
}

describe('CancellationService.getPolicy', () => {
  it('returns the stored row with its version', async () => {
    const { cancellations } = service({
      policies: new Map([[HOTEL_ID, policy()]]),
    });

    const found = await cancellations.getPolicy(HOTEL_ID);

    expect(found).toEqual({
      hotelId: HOTEL_ID,
      tiers: [
        { daysBefore: 30, refundPercent: 100 },
        { daysBefore: 7, refundPercent: 50 },
      ],
      noRefundWithinHours: 24,
      version: 3,
    });
  });

  it('falls back to the API default at version 0 when the hotel has no row', async () => {
    const { cancellations } = service();

    const found = await cancellations.getPolicy(HOTEL_ID);

    expect(found.version).toBe(0);
    expect(found.tiers).toEqual([
      { daysBefore: 30, refundPercent: 100 },
      { daysBefore: 7, refundPercent: 50 },
    ]);
  });

  it('404s HOTEL_NOT_FOUND for a hotel that does not exist', async () => {
    const { cancellations } = service({ hotels: [] });

    await expect(cancellations.getPolicy(HOTEL_ID)).rejects.toMatchObject({
      status: 404,
      response: { code: 'HOTEL_NOT_FOUND' },
    });
  });
});

describe('CancellationService.setPolicy', () => {
  it('stores the tiers sorted highest-first and bumps the version', async () => {
    const { cancellations, policies } = service({
      policies: new Map([[HOTEL_ID, policy()]]),
    });

    const stored = await cancellations.setPolicy(HOTEL_ID, {
      tiers: [
        { daysBefore: 7, refundPercent: 50 },
        { daysBefore: 30, refundPercent: 100 },
      ],
      noRefundWithinHours: 48,
    });

    expect(stored.version).toBe(4);
    expect(stored.tiers).toEqual([
      { daysBefore: 30, refundPercent: 100 },
      { daysBefore: 7, refundPercent: 50 },
    ]);
    expect(policies.upserts).toEqual([HOTEL_ID]);
  });
});

describe('CancellationService.quote', () => {
  it('prices a fully refundable early cancellation at 100% of the total', async () => {
    const { cancellations } = service({
      policies: new Map([[HOTEL_ID, policy()]]),
    });

    const quote = await cancellations.quote(GUEST_ID, BOOKING_ID, NOW_MS);

    expect(quote).toEqual({
      refundPercent: 100,
      refundCents: 30500,
      currency: 'USD',
      policyVersion: 3,
    });
  });

  it('prices against the default at version 0 when the hotel has no row', async () => {
    const { cancellations } = service();

    const quote = await cancellations.quote(GUEST_ID, BOOKING_ID, NOW_MS);

    expect(quote.refundPercent).toBe(100);
    expect(quote.policyVersion).toBe(0);
  });

  it('quotes 0 inside the no-refund window', async () => {
    const { cancellations } = service({
      policies: new Map([[HOTEL_ID, policy()]]),
    });
    const checkInMs = Date.parse('2026-08-01T00:00:00Z');

    const quote = await cancellations.quote(
      GUEST_ID,
      BOOKING_ID,
      checkInMs - 12 * 3_600_000,
    );

    expect(quote).toEqual({
      refundPercent: 0,
      refundCents: 0,
      currency: 'USD',
      policyVersion: 3,
    });
  });

  it('400s INVALID_CANCEL_STATE for a booking that is not CONFIRMED, with the reason', async () => {
    const { cancellations } = service({
      bookings: new Map([[BOOKING_ID, booking({ status: 'PENDING' })]]),
    });

    await expect(cancellations.quote(GUEST_ID, BOOKING_ID, NOW_MS)).rejects.toMatchObject(
      {
        status: 400,
        response: { code: 'INVALID_CANCEL_STATE' },
      },
    );
  });

  it('403s NOT_BOOKING_OWNER for a booking that belongs to a different guest', async () => {
    const { cancellations } = service();

    await expect(cancellations.quote(OTHER_ID, BOOKING_ID, NOW_MS)).rejects.toMatchObject(
      {
        status: 403,
        response: { code: 'NOT_BOOKING_OWNER' },
      },
    );
  });

  it('404s BOOKING_NOT_FOUND for a booking that does not exist', async () => {
    const { cancellations } = service({ bookings: new Map() });

    await expect(
      cancellations.quote(GUEST_ID, BOOKING_ID, NOW_MS),
    ).rejects.toMatchObject({
      status: 404,
      response: { code: 'BOOKING_NOT_FOUND' },
    });
  });
});
