import { HttpStatus, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import Stripe from 'stripe';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/bootstrap.js';
import { ApiError } from '../src/common/errors/api-error.js';
import { PasswordService } from '../src/modules/auth/password.service.js';
import { HOST_REPOSITORY } from '../src/modules/host/host.repository.js';
import { StubHostRepository } from '../src/modules/host/host.stub.js';
import {
  STRIPE_CLIENT,
  type CreatedIntent,
  type CreateIntentInput,
  type StripeClient,
} from '../src/modules/payments/stripe.client.js';
import {
  BOOKINGS_REPOSITORY,
  type BookingRecord,
  type BookingsRepository,
} from '../src/prisma/bookings.repository.js';
import {
  PAYMENTS_REPOSITORY,
  type PaymentRecord,
  type PaymentsRepository,
  type UpsertPaymentData,
} from '../src/prisma/payments.repository.js';
import {
  USERS_REPOSITORY,
  type UserRecord,
  type UsersRepository,
} from '../src/modules/users/users.repository.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * T26 over real HTTP, with only the database and Stripe replaced.
 *
 * The guard, the pipes, the envelope and the status codes are all real; the bookings
 * and payments repositories are in-memory and the `STRIPE_CLIENT` token is a recorder
 * that dedupes by idempotency key exactly like Stripe does, so no network call ever
 * happens. The ticket's verify clause lives here: a repeated call with the same key
 * creates one PaymentIntent.
 */

const ADA_ID = '33333333-3333-4333-8333-333333333333';
const BO_ID = '44444444-4444-4444-8444-444444444444';
const PENDING_ID = '55555555-5555-4555-8555-555555555555';
const CONFIRMED_ID = '66666666-6666-4666-8666-666666666666';
/** A second hold, reserved for the webhook tests so intent tests never touch it. */
const WEBHOOK_ID = '77777777-7777-4777-8777-777777777777';
const PASSWORD = 'correct-password-1';

function booking(id: string, overrides: Partial<BookingRecord> = {}): BookingRecord {
  return {
    id,
    reference: `GB-${id.slice(0, 4)}`,
    status: 'PENDING',
    guestId: ADA_ID,
    roomId: '88888888-8888-4888-8888-888888888888',
    hotelId: '11111111-1111-4111-8111-111111111111',
    roomName: 'Deluxe King',
    checkIn: '2026-06-01',
    checkOut: '2026-06-04',
    guestsCount: 2,
    nights: 3,
    subtotalCents: 60_000,
    feesCents: 0,
    totalCents: 60_000,
    currency: 'USD',
    createdAt: new Date('2026-05-01T10:00:00.000Z'),
    ...overrides,
  };
}

/**
 * Stripe's idempotency, minus Stripe: the first call with a key mints the intent, a
 * repeat with the same key returns the same one, and the key log proves the service
 * sent the same key both times rather than minting a fresh one per call.
 *
 * Verification is the real algorithm, not a mock of it: `constructEvent` is local HMAC
 * plus JSON parsing, so this fake holds a test secret and verifies exactly like
 * production — only the intent-minting half is stubbed, because that half needs the
 * network.
 */
const WEBHOOK_SECRET = 'whsec_test_only_never_deploy';

class RecordingStripe implements StripeClient {
  readonly keys: string[] = [];
  private readonly byKey = new Map<string, CreatedIntent>();

  async createIntent(input: CreateIntentInput): Promise<CreatedIntent> {
    this.keys.push(input.idempotencyKey);
    const existing = this.byKey.get(input.idempotencyKey);
    if (existing) return existing;
    const intent: CreatedIntent = {
      paymentIntentId: `pi_${this.byKey.size + 1}`,
      clientSecret: `secret_${this.byKey.size + 1}`,
      status: 'requires_payment',
    };
    this.byKey.set(input.idempotencyKey, intent);
    return intent;
  }

  async verifyWebhook(rawBody: string | Buffer, signature: string): Promise<Stripe.Event> {
    // Same contract as the real client: a forgery is a 400 ApiError, never a raw SDK error.
    try {
      return new Stripe(WEBHOOK_SECRET).webhooks.constructEvent(rawBody, signature, WEBHOOK_SECRET);
    } catch {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'INVALID_SIGNATURE', 'The webhook signature is invalid');
    }
  }
}

class StubBookings implements BookingsRepository {
  /** Every conditional flip, so a retried webhook must not append a second one. */
  readonly flips: Array<{ bookingId: string; from: string; to: string }> = [];

  constructor(private readonly rows: Map<string, BookingRecord>) {}

  async findById(id: string): Promise<BookingRecord | null> {
    return this.rows.get(id) ?? null;
  }

  async createPending(): Promise<BookingRecord> {
    throw new Error('unused');
  }

  async findForOwner(): Promise<BookingRecord[]> {
    return [];
  }

  async findHotelSnapshot(): Promise<{
    id: string;
    slug: string;
    name: string;
    city: string;
    country: string;
    addressLine: string;
    coverImage: string | null;
  }> {
    return {
      id: '11111111-1111-4111-8111-111111111111',
      slug: 'the-larkspur-hotel',
      name: 'Larkspur House',
      city: 'Lisbon',
      country: 'Portugal',
      addressLine: '12 Rua do Vale',
      coverImage: null,
    };
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
    from: 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED',
    to: 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED',
  ): Promise<BookingRecord | null> {
    const row = this.rows.get(bookingId);
    if (!row || row.status !== from) return null;
    const updated = { ...row, status: to };
    this.rows.set(bookingId, updated);
    this.flips.push({ bookingId, from, to });
    return updated;
  }
}

class StubPayments implements PaymentsRepository {
  private seq = 0;
  readonly rows = new Map<string, PaymentRecord>();

  async findByBooking(bookingId: string): Promise<PaymentRecord | null> {
    return this.rows.get(bookingId) ?? null;
  }

  async findByIntent(stripePaymentIntentId: string): Promise<PaymentRecord | null> {
    for (const row of this.rows.values()) {
      if (row.stripePaymentIntentId === stripePaymentIntentId) return row;
    }
    return null;
  }

  async upsert(data: UpsertPaymentData): Promise<PaymentRecord> {
    this.seq += 1;
    const record: PaymentRecord = {
      id: `10000000-0000-4000-8000-00000000${String(this.seq).padStart(4, '0')}`,
      receiptUrl: null,
      createdAt: new Date(),
      ...data,
    };
    this.rows.set(data.bookingId, record);
    return record;
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
): Promise<UserRecord> {
  return {
    id,
    email,
    name: email,
    avatarUrl: null,
    passwordHash: await passwords.hash(PASSWORD),
    role: 'GUEST',
    status: 'ACTIVE',
    oauthProvider: null,
    oauthAccountId: null,
    createdAt: new Date(),
  };
}

describe('Payments API (e2e)', () => {
  let app: INestApplication;
  let adaCookie: string;
  let boCookie: string;
  let stripe: RecordingStripe;
  let payments: StubPayments;
  let bookings: StubBookings;

  beforeAll(async () => {
    const passwords = new PasswordService();
    const ada = await seededUser(passwords, ADA_ID, 'ada@example.com');
    const bo = await seededUser(passwords, BO_ID, 'bo@example.com');
    stripe = new RecordingStripe();
    payments = new StubPayments();
    bookings = new StubBookings(
      new Map([
        [PENDING_ID, booking(PENDING_ID)],
        [CONFIRMED_ID, booking(CONFIRMED_ID, { status: 'CONFIRMED' })],
        [WEBHOOK_ID, booking(WEBHOOK_ID)],
      ]),
    );

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        $queryRaw: () => Promise.resolve([{ ok: 1 }]),
        $connect: () => Promise.resolve(),
      })
      .overrideProvider(USERS_REPOSITORY)
      .useValue(new StubUsers(new Map([[ada.email, ada], [bo.email, bo]])))
      .overrideProvider(HOST_REPOSITORY)
      .useValue(new StubHostRepository())
      .overrideProvider(BOOKINGS_REPOSITORY)
      .useValue(bookings)
      .overrideProvider(PAYMENTS_REPOSITORY)
      .useValue(payments)
      .overrideProvider(STRIPE_CLIENT)
      .useValue(stripe)
      .compile();

    app = moduleRef.createNestApplication({ rawBody: true });
    configureApp(app);
    await app.init();

    for (const [email, slot] of [[ada.email, 'ada'], [bo.email, 'bo']] as const) {
      const login = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password: PASSWORD })
        .expect(200);
      const cookie = (login.headers['set-cookie'] as unknown as string[])[0] as string;
      if (slot === 'ada') adaCookie = cookie;
      else boCookie = cookie;
    }
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/payments/intent', () => {
    it('201s the intent with the booking\u2019s server-computed amount', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/payments/intent')
        .set('Cookie', adaCookie)
        .send({ bookingId: PENDING_ID })
        .expect(201);

      expect(response.body).toEqual({
        success: true,
        data: { clientSecret: 'secret_1', paymentIntentId: 'pi_1', amountCents: 60_000, currency: 'USD' },
      });
    });

    it('repeats with the same key and creates one PaymentIntent', async () => {
      const before = stripe.keys.length;
      const first = await request(app.getHttpServer())
        .post('/api/payments/intent')
        .set('Cookie', adaCookie)
        .send({ bookingId: PENDING_ID })
        .expect(201);
      const second = await request(app.getHttpServer())
        .post('/api/payments/intent')
        .set('Cookie', adaCookie)
        .send({ bookingId: PENDING_ID })
        .expect(201);

      expect(second.body.data.paymentIntentId).toBe(first.body.data.paymentIntentId);
      expect(second.body.data.clientSecret).toBe(first.body.data.clientSecret);
      // Same key on every call — the service never mints a fresh key per call, so
      // Stripe dedupes instead of charging twice.
      expect(stripe.keys.slice(before)).toEqual(['payments-intent:GB-5555', 'payments-intent:GB-5555']);
      // And the local row was upserted, not appended.
      expect(payments.rows.size).toBe(1);
    });

    it('400s a booking that is not pending with INVALID_PAYMENT_STATE', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/payments/intent')
        .set('Cookie', adaCookie)
        .send({ bookingId: CONFIRMED_ID })
        .expect(400);

      expect(response.body.error.code).toBe('INVALID_PAYMENT_STATE');
    });

    it('403s another guest\u2019s booking with NOT_BOOKING_OWNER', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/payments/intent')
        .set('Cookie', boCookie)
        .send({ bookingId: PENDING_ID })
        .expect(403);

      expect(response.body.error.code).toBe('NOT_BOOKING_OWNER');
    });

    it('401s an anonymous caller', async () => {
      await request(app.getHttpServer())
        .post('/api/payments/intent')
        .send({ bookingId: PENDING_ID })
        .expect(401);
    });
  });

  describe('GET /api/payments/:bookingId', () => {
    it('reads the payment created above', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/payments/${PENDING_ID}`)
        .set('Cookie', adaCookie)
        .expect(200);

      expect(response.body.data).toMatchObject({
        bookingId: PENDING_ID,
        stripePaymentIntentId: 'pi_1',
        amountCents: 60_000,
      });
    });

    it('404s a booking with no intent yet with PAYMENT_NOT_FOUND', async () => {
      // CONFIRMED_ID exists and is owned by Ada, but no intent was ever created for it —
      // the read path needs exactly that combination.
      const response = await request(app.getHttpServer())
        .get(`/api/payments/${CONFIRMED_ID}`)
        .set('Cookie', adaCookie)
        .expect(404);

      expect(response.body.error.code).toBe('PAYMENT_NOT_FOUND');
    });

    it('403s another guest\u2019s payment', async () => {
      await request(app.getHttpServer())
        .get(`/api/payments/${PENDING_ID}`)
        .set('Cookie', boCookie)
        .expect(403);
    });
  });

  describe('POST /api/payments/webhook', () => {
    const sign = (payload: string): string =>
      new Stripe(WEBHOOK_SECRET).webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });

    const postWebhook = (payload: string, signature?: string) => {
      const call = request(app.getHttpServer())
        .post('/api/payments/webhook')
        .set('Content-Type', 'application/json');
      if (signature !== undefined) call.set('stripe-signature', signature);
      return call.send(payload);
    };

    const succeededPayload = (intentId: string): string =>
      JSON.stringify({
        id: 'evt_succeeded',
        object: 'event',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: intentId,
            object: 'payment_intent',
            charges: { data: [{ receipt_url: 'https://receipt.test/1' }] },
          },
        },
      });

    it('confirms the booking on a valid signature and stores the receipt', async () => {
      // The intent first, through the real route: the webhook test then exercises the
      // full T26 → T27 chain rather than a hand-seeded row.
      const intent = await request(app.getHttpServer())
        .post('/api/payments/intent')
        .set('Cookie', adaCookie)
        .send({ bookingId: WEBHOOK_ID })
        .expect(201);
      const intentId = intent.body.data.paymentIntentId as string;

      const payload = succeededPayload(intentId);
      const response = await postWebhook(payload, sign(payload)).expect(200);

      expect(response.body).toEqual({ success: true, data: { received: true } });

      const read = await request(app.getHttpServer())
        .get(`/api/payments/${WEBHOOK_ID}`)
        .set('Cookie', adaCookie)
        .expect(200);
      expect(read.body.data).toMatchObject({ status: 'succeeded', receiptUrl: 'https://receipt.test/1' });

      const trip = await request(app.getHttpServer())
        .get(`/api/bookings/${WEBHOOK_ID}`)
        .set('Cookie', adaCookie)
        .expect(200);
      expect(trip.body.data.status).toBe('CONFIRMED');
    });

    it('200s a duplicate event without a second transition', async () => {
      // No new intent: the booking is already CONFIRMED, so an intent POST would 400.
      // Rebuild the event from the stored row instead — redelivery carries the same
      // bytes, and the service must find nothing in `from` and write nothing.
      const stored = await request(app.getHttpServer())
        .get(`/api/payments/${WEBHOOK_ID}`)
        .set('Cookie', adaCookie)
        .expect(200);
      const payload = succeededPayload(stored.body.data.stripePaymentIntentId as string);
      const flips = bookings.flips.length;

      const response = await postWebhook(payload, sign(payload)).expect(200);

      expect(response.body).toEqual({ success: true, data: { received: true } });
      expect(bookings.flips).toHaveLength(flips);
    });

    it('cancels the hold on payment failure and records it', async () => {
      const intent = await request(app.getHttpServer())
        .post('/api/payments/intent')
        .set('Cookie', adaCookie)
        .send({ bookingId: PENDING_ID })
        .expect(201);
      const payload = JSON.stringify({
        id: 'evt_failed',
        object: 'event',
        type: 'payment_intent.payment_failed',
        data: { object: { id: intent.body.data.paymentIntentId as string, object: 'payment_intent' } },
      });

      await postWebhook(payload, sign(payload)).expect(200);

      const trip = await request(app.getHttpServer())
        .get(`/api/bookings/${PENDING_ID}`)
        .set('Cookie', adaCookie)
        .expect(200);
      expect(trip.body.data.status).toBe('CANCELLED');

      const read = await request(app.getHttpServer())
        .get(`/api/payments/${PENDING_ID}`)
        .set('Cookie', adaCookie)
        .expect(200);
      expect(read.body.data.status).toBe('failed');
    });

    it('400s a forged payload with INVALID_SIGNATURE', async () => {
      const payload = succeededPayload('pi_forged');
      const response = await postWebhook(payload, sign(`${payload}tampered`)).expect(400);

      expect(response.body).toEqual({
        success: false,
        error: { code: 'INVALID_SIGNATURE', message: 'The webhook signature is invalid' },
      });
    });

    it('400s a missing signature', async () => {
      await postWebhook(succeededPayload('pi_nosig')).expect(400);
    });

    it('200s an unknown event and ignores it', async () => {
      const payload = JSON.stringify({
        id: 'evt_unknown',
        object: 'event',
        type: 'customer.created',
        data: { object: { id: 'cus_1', object: 'customer' } },
      });

      const response = await postWebhook(payload, sign(payload)).expect(200);

      expect(response.body).toEqual({ success: true, data: { received: true } });
    });
  });
});
