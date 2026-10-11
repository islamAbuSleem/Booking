import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/bootstrap.js';
import { PasswordService } from '../src/modules/auth/password.service.js';
import { HOST_REPOSITORY } from '../src/modules/host/host.repository.js';
import { StubHostRepository } from '../src/modules/host/host.stub.js';
import {
  STRIPE_CLIENT,
  type StripeClient,
} from '../src/modules/payments/stripe.client.js';
import {
  USERS_REPOSITORY,
  type UserRecord,
  type UserRole,
  type UsersRepository,
} from '../src/modules/users/users.repository.js';
import {
  BOOKINGS_REPOSITORY,
  type BookingRecord,
  type BookingRepository,
} from '../src/prisma/bookings.repository.js';
import {
  CANCELLATION_REPOSITORY,
  type CancellationRepository,
  type PolicyRecord,
} from '../src/prisma/cancellation.repository.js';
import {
  HOTELS_REPOSITORY,
  type HotelDetail,
  type HotelsRepository,
} from '../src/prisma/hotels.repository.js';
import {
  PAYMENTS_REPOSITORY,
  type PaymentRecord,
  type PaymentsRepository,
} from '../src/prisma/payments.repository.js';
import {
  REFUNDS_REPOSITORY,
  type CreateRefundInput,
  type RefundRecord,
  type RefundsRepository,
  type SettleRefundInput,
} from '../src/prisma/refunds.repository.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * T38 over real HTTP, with only the database and Stripe replaced.
 *
 * The guard, the pipes, the envelope and the status codes are all real; the repositories
 * and the Stripe boundary are in-memory. That is the point of this file: the ticket's
 * promises are all about the wire — a duplicate cancel that reads instead of 409ing, a
 * failed Stripe call that still cancels the stay and leaves a retryable row, and a retry
 * after success that 409s — and none of them are visible from a service-level test.
 */

const GUEST_ID = '11111111-1111-4111-8111-111111111111';
const HOST_ID = '22222222-2222-4222-8222-222222222222';
const STRANGER_ID = '33333333-3333-4333-8333-333333333333';
const HOTEL_ID = '44444444-4444-4444-8444-444444444444';
const BOOKING_ID = '55555555-5555-4555-8555-555555555555';
const PENDING_BOOKING_ID = '66666666-6666-4666-8666-666666666666';
const PAYMENT_ID = '77777777-7777-4777-8777-777777777777';
const MISSING_BOOKING_ID = '99999999-9999-4999-8999-999999999999';
const PASSWORD = 'correct-password-1';

const HOTEL: HotelDetail = {
  id: HOTEL_ID,
  slug: 'the-larkspur-hotel',
  name: 'The Larkspur Hotel',
  description: 'A palazzo.',
  addressLine: 'Rua das Flores 41',
  city: 'Lisbon',
  country: 'Portugal',
  lat: 38.7101,
  lng: -9.1425,
  starRating: 4,
  status: 'PUBLISHED',
  checkInTime: '15:00',
  checkOutTime: '11:00',
  currency: 'USD',
  coverImage: null,
  images: [],
  amenityIds: ['wifi'],
  rating: { average: 4.7, totalReviews: 2 },
  rooms: [],
  host: { id: HOST_ID, name: 'Beatriz Salgueiro' },
};

function bookingRecord(overrides: Partial<BookingRecord> = {}): BookingRecord {
  return {
    id: BOOKING_ID,
    reference: 'GB-4821',
    status: 'CONFIRMED',
    guestId: GUEST_ID,
    roomId: 'room-1',
    hotelId: HOTEL_ID,
    roomName: 'Courtyard King',
    checkIn: '2027-06-01',
    checkOut: '2027-06-04',
    guestsCount: 2,
    nights: 3,
    subtotalCents: 30000,
    feesCents: 500,
    totalCents: 30500,
    currency: 'USD',
    holdExpiresAt: null,
    createdAt: new Date('2026-05-20T10:00:00.000Z'),
    ...overrides,
  };
}

function paymentRecord(): PaymentRecord {
  return {
    id: PAYMENT_ID,
    bookingId: BOOKING_ID,
    stripePaymentIntentId: 'pi_4821',
    amountCents: 30500,
    currency: 'USD',
    status: 'succeeded',
    receiptUrl: null,
    createdAt: new Date('2026-05-20T10:00:00.000Z'),
  };
}

class StubHotels implements HotelsRepository {
  async findPublished(): Promise<never> {
    throw new Error('unused');
  }

  async findById(id: string): Promise<HotelDetail | null> {
    return id === HOTEL_ID || id === HOTEL.slug ? HOTEL : null;
  }

  async listPublishedSlugs(): Promise<{ slug: string; updatedAt: string }[]> {
    return [];
  }
}

class StubBookings implements BookingRepository {
  readonly rows = new Map<string, BookingRecord>();

  async createPending(): Promise<BookingRecord> {
    throw new Error('unused');
  }

  async findById(bookingId: string): Promise<BookingRecord | null> {
    return this.rows.get(bookingId) ?? null;
  }

  async findForOwner(): Promise<BookingRecord[]> {
    throw new Error('unused');
  }

  /** The cancel route embeds the hotel snapshot, so this has to answer a real one. */
  async findHotelSnapshot(hotelId: string): Promise<never> {
    if (hotelId !== HOTEL_ID) return null as never;
    return {
      id: HOTEL.id,
      slug: HOTEL.slug,
      name: HOTEL.name,
      city: HOTEL.city,
      country: HOTEL.country,
      addressLine: HOTEL.addressLine,
      coverImage: HOTEL.coverImage,
    } as never;
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

  async transitionStatus(
    bookingId: string,
    from: BookingRecord['status'],
    to: BookingRecord['status'],
  ): Promise<BookingRecord | null> {
    const row = this.rows.get(bookingId);
    if (!row || row.status !== from) return null;
    row.status = to;
    return row;
  }
}

class StubPayments implements PaymentsRepository {
  row: PaymentRecord | null = paymentRecord();

  async findByBooking(): Promise<PaymentRecord | null> {
    return this.row;
  }

  async findByIntent(): Promise<PaymentRecord | null> {
    throw new Error('unused');
  }

  async upsert(): Promise<PaymentRecord> {
    throw new Error('unused');
  }
}

class StubPolicies implements CancellationRepository {
  readonly rows = new Map<string, PolicyRecord>();

  async findPolicyByHotel(hotelId: string): Promise<PolicyRecord | null> {
    return this.rows.get(hotelId) ?? null;
  }

  async hotelExists(hotelId: string): Promise<boolean> {
    return hotelId === HOTEL_ID;
  }

  async upsertPolicy(
    hotelId: string,
    tiers: PolicyRecord['tiers'],
    noRefundWithinHours: number,
  ): Promise<PolicyRecord> {
    const version = (this.rows.get(hotelId)?.version ?? 0) + 1;
    const record = { hotelId, tiers, noRefundWithinHours, version };
    this.rows.set(hotelId, record);
    return record;
  }
}

class StubRefunds implements RefundsRepository {
  readonly rows: RefundRecord[] = [];
  private seq = 0;

  async createAttempt(input: CreateRefundInput): Promise<RefundRecord> {
    this.seq += 1;
    const record: RefundRecord = {
      id: `88888888-8888-4888-8888-8888888888${String(this.seq).padStart(2, '0')}`,
      bookingId: input.bookingId,
      paymentId: input.paymentId,
      stripeRefundId: null,
      amountCents: input.amountCents,
      currency: input.currency,
      percent: input.percent,
      reason: input.reason ?? null,
      status: 'pending',
      attempts: input.attempts,
      createdAt: new Date(),
    };
    this.rows.push(record);
    return record;
  }

  async settle(refundId: string, input: SettleRefundInput): Promise<RefundRecord | null> {
    const row = this.rows.find((candidate) => candidate.id === refundId);
    if (!row || row.status !== 'pending') return row ?? null;
    row.status = input.status;
    if (input.stripeRefundId) row.stripeRefundId = input.stripeRefundId;
    return row;
  }

  async findLatestByBooking(bookingId: string): Promise<RefundRecord | null> {
    const rows = this.rows.filter((row) => row.bookingId === bookingId);
    return rows.length > 0 ? rows[rows.length - 1] : null;
  }

  async findByBooking(bookingId: string): Promise<RefundRecord[]> {
    return this.rows
      .filter((row) => row.bookingId === bookingId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async findByStripeRefundId(stripeRefundId: string): Promise<RefundRecord | null> {
    return this.rows.find((row) => row.stripeRefundId === stripeRefundId) ?? null;
  }

  async hasSucceeded(bookingId: string): Promise<boolean> {
    return this.rows.some((row) => row.bookingId === bookingId && row.status === 'succeeded');
  }
}

/** One entry per Stripe call, in order; an `Error` entry is thrown as the SDK would. */
class RecordingStripe implements StripeClient {
  readonly calls: Array<{ paymentIntentId: string; amountCents: number; idempotencyKey: string }> = [];
  script: Array<'succeeded' | 'failed' | Error> = ['succeeded'];

  async createIntent(): Promise<never> {
    throw new Error('unused');
  }

  async createRefund(input: {
    paymentIntentId: string;
    amountCents: number;
    idempotencyKey: string;
  }): Promise<{ refundId: string | null; status: 'pending' | 'succeeded' | 'failed' }> {
    this.calls.push({
      paymentIntentId: input.paymentIntentId,
      amountCents: input.amountCents,
      idempotencyKey: input.idempotencyKey,
    });
    const entry = this.script[Math.min(this.calls.length - 1, this.script.length - 1)];
    if (entry instanceof Error) throw entry;
    return { refundId: `re_${this.calls.length}`, status: entry };
  }

  async verifyWebhook(): Promise<never> {
    throw new Error('unused');
  }

  async receiptUrl(): Promise<null> {
    return null;
  }
}

/** Only what the JWT guard reads. */
class StubUsers implements UsersRepository {
  constructor(private readonly byEmail: Map<string, UserRecord>) {}

  async findByEmail(email: string): Promise<UserRecord | null> {
    return this.byEmail.get(email) ?? null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    for (const user of this.byEmail.values()) {
      if (user.id === id) return user;
    }
    return null;
  }

  async findByOAuth(): Promise<UserRecord | null> {
    return null;
  }

  async create(): Promise<UserRecord> {
    throw new Error('unused');
  }

  async update(): Promise<UserRecord> {
    throw new Error('unused');
  }
}

async function seededUser(
  passwords: PasswordService,
  id: string,
  email: string,
  role: UserRole,
): Promise<UserRecord> {
  return {
    id,
    email,
    name: email,
    avatarUrl: null,
    passwordHash: await passwords.hash(PASSWORD),
    role,
    status: 'ACTIVE',
    oauthProvider: null,
    oauthAccountId: null,
    createdAt: new Date(),
  };
}

describe('Refunds API (e2e)', () => {
  let app: INestApplication;
  let bookings: StubBookings;
  let payments: StubPayments;
  let ledger: StubRefunds;
  let stripe: RecordingStripe;
  let guestCookie: string;
  let strangerCookie: string;

  async function login(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return (response.headers['set-cookie'] as unknown as string[])[0] as string;
  }

  beforeAll(async () => {
    bookings = new StubBookings();
    payments = new StubPayments();
    ledger = new StubRefunds();
    stripe = new RecordingStripe();
    const passwords = new PasswordService();
    const guest = await seededUser(passwords, GUEST_ID, 'guest@example.com', 'GUEST');
    const stranger = await seededUser(passwords, STRANGER_ID, 'stranger@example.com', 'GUEST');
    const users = new StubUsers(
      new Map([
        [guest.email, guest],
        [stranger.email, stranger],
      ]),
    );

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        $queryRaw: () => Promise.resolve([{ ok: 1 }]),
        $connect: () => Promise.resolve(),
      })
      .overrideProvider(USERS_REPOSITORY)
      .useValue(users)
      .overrideProvider(HOST_REPOSITORY)
      .useValue(new StubHostRepository())
      .overrideProvider(HOTELS_REPOSITORY)
      .useValue(new StubHotels())
      .overrideProvider(CANCELLATION_REPOSITORY)
      .useValue(new StubPolicies())
      .overrideProvider(BOOKINGS_REPOSITORY)
      .useValue(bookings)
      .overrideProvider(PAYMENTS_REPOSITORY)
      .useValue(payments)
      .overrideProvider(REFUNDS_REPOSITORY)
      .useValue(ledger)
      .overrideProvider(STRIPE_CLIENT)
      .useValue(stripe)
      .compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    guestCookie = await login(guest.email);
    strangerCookie = await login(stranger.email);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    bookings.rows.clear();
    bookings.rows.set(BOOKING_ID, bookingRecord());
    bookings.rows.set(PENDING_BOOKING_ID, bookingRecord({ id: PENDING_BOOKING_ID, status: 'PENDING' }));
    payments.row = paymentRecord();
    ledger.rows.length = 0;
    stripe.calls.length = 0;
    stripe.script = ['succeeded'];
  });

  describe('POST /api/bookings/:id/cancel', () => {
    it('cancels and answers 200 with the booking and the settled refund', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/bookings/${BOOKING_ID}/cancel`)
        .set('Cookie', guestCookie)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.booking.status).toBe('CANCELLED');
      expect(response.body.data.refund).toMatchObject({
        bookingId: BOOKING_ID,
        amountCents: 30500,
        currency: 'USD',
        percent: 100,
        status: 'succeeded',
        attempts: 1,
      });
      expect(stripe.calls).toHaveLength(1);
      expect(stripe.calls[0]).toMatchObject({
        paymentIntentId: 'pi_4821',
        amountCents: 30500,
        idempotencyKey: 'refunds:GB-4821:1',
      });
    });

    it('reads instead of 409ing on a duplicate cancel, and never charges twice', async () => {
      await request(app.getHttpServer())
        .post(`/api/bookings/${BOOKING_ID}/cancel`)
        .set('Cookie', guestCookie)
        .expect(200);

      const again = await request(app.getHttpServer())
        .post(`/api/bookings/${BOOKING_ID}/cancel`)
        .set('Cookie', guestCookie)
        .expect(200);

      expect(again.body.data.refund.status).toBe('succeeded');
      expect(again.body.data.booking.status).toBe('CANCELLED');
      expect(stripe.calls).toHaveLength(1);
      expect(ledger.rows).toHaveLength(1);
    });

    it('cancels with refund: null when the hold was never paid', async () => {
      payments.row = null;

      const response = await request(app.getHttpServer())
        .post(`/api/bookings/${BOOKING_ID}/cancel`)
        .set('Cookie', guestCookie)
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'NO_CAPTURED_PAYMENT',
          message: 'This booking has no captured payment to refund',
        },
      });
      expect(bookings.rows.get(BOOKING_ID)?.status).toBe('CONFIRMED');
      expect(stripe.calls).toHaveLength(0);
    });

    it('409s INVALID_CANCEL_STATE for a PENDING hold, and touches Stripe not at all', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/bookings/${PENDING_BOOKING_ID}/cancel`)
        .set('Cookie', guestCookie)
        .expect(409);

      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'INVALID_CANCEL_STATE',
          message: 'Only a confirmed booking can be cancelled',
        },
      });
      expect(stripe.calls).toHaveLength(0);
      expect(ledger.rows).toHaveLength(0);
    });

    it('403s NOT_BOOKING_OWNER for a booking that belongs to another guest', async () => {
      await request(app.getHttpServer())
        .post(`/api/bookings/${BOOKING_ID}/cancel`)
        .set('Cookie', strangerCookie)
        .expect(403);
    });

    it('404s BOOKING_NOT_FOUND for a booking that does not exist', async () => {
      await request(app.getHttpServer())
        .post(`/api/bookings/${MISSING_BOOKING_ID}/cancel`)
        .set('Cookie', guestCookie)
        .expect(404);
    });

    it('401s an anonymous caller', async () => {
      await request(app.getHttpServer())
        .post(`/api/bookings/${BOOKING_ID}/cancel`)
        .expect(401);
    });
  });

  describe('the refund ledger', () => {
    it('a failed Stripe call leaves the booking cancelled and the refund failed; the retry appends a second row that succeeds', async () => {
      // The ticket's verify line, over the wire.
      stripe.script = [new Error('stripe unreachable'), 'succeeded'];

      const cancelled = await request(app.getHttpServer())
        .post(`/api/bookings/${BOOKING_ID}/cancel`)
        .set('Cookie', guestCookie)
        .expect(200);

      expect(cancelled.body.data.booking.status).toBe('CANCELLED');
      expect(cancelled.body.data.refund.status).toBe('failed');
      expect(ledger.rows).toHaveLength(1);

      const retried = await request(app.getHttpServer())
        .post(`/api/bookings/${BOOKING_ID}/refund/retry`)
        .set('Cookie', guestCookie)
        .expect(201);

      expect(retried.body.data).toMatchObject({
        status: 'succeeded',
        attempts: 2,
        amountCents: 30500,
        percent: 100,
      });
      // Append-only: the failed row is still there, and the new one attempted twice.
      expect(ledger.rows.map((row) => row.attempts)).toEqual([1, 2]);
      expect(stripe.calls.map((call) => call.idempotencyKey)).toEqual([
        'refunds:GB-4821:1',
        'refunds:GB-4821:2',
      ]);
    });

    it('409s ALREADY_REFUNDED on a retry after success — no path double-refunds', async () => {
      await request(app.getHttpServer())
        .post(`/api/bookings/${BOOKING_ID}/cancel`)
        .set('Cookie', guestCookie)
        .expect(200);

      const response = await request(app.getHttpServer())
        .post(`/api/bookings/${BOOKING_ID}/refund/retry`)
        .set('Cookie', guestCookie)
        .expect(409);

      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'ALREADY_REFUNDED',
          message: 'This booking has already been refunded',
        },
      });
      expect(stripe.calls).toHaveLength(1);
      expect(ledger.rows).toHaveLength(1);
    });

    it('lists the ledger newest first for the owner, and 403s another guest', async () => {
      await request(app.getHttpServer())
        .post(`/api/bookings/${BOOKING_ID}/cancel`)
        .set('Cookie', guestCookie)
        .expect(200);

      const page = await request(app.getHttpServer())
        .get(`/api/bookings/${BOOKING_ID}/refunds`)
        .set('Cookie', guestCookie)
        .expect(200);

      expect(page.body.data.total).toBe(1);
      expect(page.body.data.items[0]).toMatchObject({ attempts: 1, status: 'succeeded' });

      await request(app.getHttpServer())
        .get(`/api/bookings/${BOOKING_ID}/refunds`)
        .set('Cookie', strangerCookie)
        .expect(403);
    });
  });
});
