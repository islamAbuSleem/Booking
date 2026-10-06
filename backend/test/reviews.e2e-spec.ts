import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/bootstrap.js';
import { PasswordService } from '../src/modules/auth/password.service.js';
import { HOST_REPOSITORY } from '../src/modules/host/host.repository.js';
import { StubHostRepository } from '../src/modules/host/host.stub.js';
import {
  BOOKINGS_REPOSITORY,
  type BookingRecord,
  type BookingsRepository,
} from '../src/prisma/bookings.repository.js';
import {
  REVIEWS_REPOSITORY,
  type CreateReviewData,
  type ReviewListPage,
  type ReviewRecord,
  type ReviewsRepository,
} from '../src/prisma/reviews.repository.js';
import {
  USERS_REPOSITORY,
  type UserRecord,
  type UsersRepository,
} from '../src/modules/users/users.repository.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * T24 over real HTTP, with only the database replaced.
 *
 * The guard, the pipes, the envelope and the status codes are all real; the bookings and
 * reviews repositories are in-memory. The rule proofs live at unit level in
 * `reviews.service.spec.ts`; this file pins the wire — the 201/400/403/404/409 codes a
 * client branches on, the public list, and the 401 every write owes an anonymous caller.
 */

const HOTEL_ID = '11111111-1111-4111-8111-111111111111';
const ADA_ID = '33333333-3333-4333-8333-333333333333';
const BO_ID = '44444444-4444-4444-8444-444444444444';
const COMPLETED_ID = '55555555-5555-4555-8555-555555555555';
const CONFIRMED_ID = '66666666-6666-4666-8666-666666666666';
const REVIEWED_ID = '77777777-7777-4777-8777-777777777777';
/** Completed and unreviewed for the whole file — no test writes to it. */
const PRISTINE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PASSWORD = 'correct-password-1';

function booking(id: string, overrides: Partial<BookingRecord> = {}): BookingRecord {
  return {
    id,
    reference: `GB-${id.slice(0, 4)}`,
    status: 'COMPLETED',
    guestId: ADA_ID,
    roomId: '88888888-8888-4888-8888-888888888888',
    hotelId: HOTEL_ID,
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

class StubBookings implements BookingsRepository {
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

class StubReviews implements ReviewsRepository {
  private seq = 0;
  readonly rows: ReviewRecord[] = [
    {
      id: '99999999-9999-4999-8999-999999999999',
      bookingId: REVIEWED_ID,
      authorId: ADA_ID,
      authorName: 'ada@example.com',
      hotelId: HOTEL_ID,
      rating: 4,
      title: 'Good',
      body: 'Nice stay.',
      status: 'VISIBLE',
      createdAt: new Date('2026-06-05T10:00:00.000Z'),
    },
  ];

  async resolveHotelId(idOrSlug: string): Promise<string | null> {
    return idOrSlug === HOTEL_ID ? HOTEL_ID : null;
  }

  async findByBooking(bookingId: string): Promise<ReviewRecord | null> {
    return this.rows.find(row => row.bookingId === bookingId) ?? null;
  }

  async create(data: CreateReviewData): Promise<ReviewRecord> {
    this.seq += 1;
    const record: ReviewRecord = {
      id: `10000000-0000-4000-8000-00000000${String(this.seq).padStart(4, '0')}`,
      authorName: 'ada@example.com',
      status: 'VISIBLE',
      createdAt: new Date(),
      ...data,
    };
    this.rows.push(record);
    return record;
  }

  async listByHotel(hotelId: string, page: number, pageSize: number): Promise<ReviewListPage> {
    const visible = this.rows.filter(row => row.hotelId === hotelId && row.status === 'VISIBLE');
    const average = visible.length === 0
      ? null
      : Math.round((visible.reduce((sum, row) => sum + row.rating, 0) / visible.length) * 100) / 100;
    return {
      items: visible.slice((page - 1) * pageSize, page * pageSize),
      total: visible.length,
      average,
    };
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

describe('Reviews API (e2e)', () => {
  let app: INestApplication;
  let adaCookie: string;
  let boCookie: string;

  beforeAll(async () => {
    const passwords = new PasswordService();
    const ada = await seededUser(passwords, ADA_ID, 'ada@example.com');
    const bo = await seededUser(passwords, BO_ID, 'bo@example.com');
    const bookings = new Map<string, BookingRecord>([
      [COMPLETED_ID, booking(COMPLETED_ID)],
      [CONFIRMED_ID, booking(CONFIRMED_ID, { status: 'CONFIRMED' })],
      [REVIEWED_ID, booking(REVIEWED_ID)],
      [PRISTINE_ID, booking(PRISTINE_ID)],
    ]);

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
      .useValue(new StubBookings(bookings))
      .overrideProvider(REVIEWS_REPOSITORY)
      .useValue(new StubReviews())
      .compile();

    app = moduleRef.createNestApplication();
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

  describe('POST /api/hotels/:hotelId/reviews', () => {
    it('201s a review for the caller\u2019s completed stay', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/hotels/${HOTEL_ID}/reviews`)
        .set('Cookie', adaCookie)
        .send({ bookingId: COMPLETED_ID, rating: 5, title: 'Loved it', body: 'The courtyard was quiet.' })
        .expect(201);

      expect(response.body).toMatchObject({
        success: true,
        data: { bookingId: COMPLETED_ID, rating: 5, status: 'VISIBLE' },
      });
      expect(response.body.data.author).toEqual({ id: ADA_ID, name: 'ada@example.com' });
    });

    it('409s a second review for the same stay with ALREADY_REVIEWED', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/hotels/${HOTEL_ID}/reviews`)
        .set('Cookie', adaCookie)
        .send({ bookingId: REVIEWED_ID, rating: 5, title: 'Again', body: 'Still good.' })
        .expect(409);

      expect(response.body).toEqual({
        success: false,
        error: { code: 'ALREADY_REVIEWED', message: 'This stay already has a review' },
      });
    });

    it('403s another guest\u2019s booking with NOT_BOOKING_OWNER', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/hotels/${HOTEL_ID}/reviews`)
        .set('Cookie', boCookie)
        .send({ bookingId: COMPLETED_ID, rating: 1, title: 'x', body: 'y' })
        .expect(403);

      expect(response.body.error.code).toBe('NOT_BOOKING_OWNER');
    });

    it('400s a confirmed-but-not-completed stay with INVALID_REVIEW_STATE', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/hotels/${HOTEL_ID}/reviews`)
        .set('Cookie', adaCookie)
        .send({ bookingId: CONFIRMED_ID, rating: 5, title: 'Early', body: 'Hasty.' })
        .expect(400);

      expect(response.body.error.code).toBe('INVALID_REVIEW_STATE');
    });

    it('401s an anonymous caller', async () => {
      await request(app.getHttpServer())
        .post(`/api/hotels/${HOTEL_ID}/reviews`)
        .send({ bookingId: COMPLETED_ID, rating: 5, title: 'x', body: 'y' })
        .expect(401);
    });
  });

  describe('GET /api/hotels/:hotelId/reviews', () => {
    it('is public and returns items, total and the average', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/hotels/${HOTEL_ID}/reviews`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.total).toBeGreaterThanOrEqual(1);
      expect(typeof response.body.data.average).toBe('number');
      expect(response.body.data.items[0]).toMatchObject({ hotelId: HOTEL_ID });
    });

    it('rejects a page deep enough to turn the OFFSET into a table walk', async () => {
      // `page` is unbounded in the query schema, and it feeds a `skip`. An unauthenticated
      // caller asking for page 1e9 makes Postgres scan the whole index for nothing.
      await request(app.getHttpServer())
        .get(`/api/hotels/${HOTEL_ID}/reviews?page=1000000000`)
        .expect(400);
    });
  });

  describe('GET /api/bookings/:id/reviewable', () => {
    it('answers true for a reviewable stay', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/bookings/${PRISTINE_ID}/reviewable`)
        .set('Cookie', adaCookie)
        .expect(200);

      expect(response.body).toEqual({ success: true, data: { canReview: true } });
    });

    it('answers NOT_COMPLETED for a confirmed stay', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/bookings/${CONFIRMED_ID}/reviewable`)
        .set('Cookie', adaCookie)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: { canReview: false, reason: 'NOT_COMPLETED' },
      });
    });

    it('403s another guest\u2019s booking', async () => {
      await request(app.getHttpServer())
        .get(`/api/bookings/${COMPLETED_ID}/reviewable`)
        .set('Cookie', boCookie)
        .expect(403);
    });
  });
});
