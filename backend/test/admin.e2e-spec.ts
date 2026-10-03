import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/bootstrap.js';
import { PasswordService } from '../src/modules/auth/password.service.js';
import { HOST_REPOSITORY } from '../src/modules/host/host.repository.js';
import { StubHostRepository } from '../src/modules/host/host.stub.js';
import {
  ADMIN_REPOSITORY,
  type AdminHotelItem,
  type AdminHotelStatus,
  type AdminRepository,
  type AdminReviewItem,
  type AdminReviewStatus,
  type AdminStats,
  type AdminUserItem,
  type AdminUserStatus,
} from '../src/prisma/admin.repository.js';
import {
  USERS_REPOSITORY,
  type UserRecord,
  type UsersRepository,
} from '../src/modules/users/users.repository.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * T24 over… no — T25 over real HTTP, with only the database replaced.
 *
 * The guard, the role check, the pipes, the envelope and the status codes are all real;
 * the admin repository is in-memory with one hotel, one user, and one review. The
 * ticket's verify clause is the HOST loop below: every admin route answers a host with
 * 403 `ADMIN_REQUIRED`, proving the guard — not the frontend middleware — is the
 * boundary. Admin happy paths pin the 200 shapes the console renders.
 */

const HOTEL_ID = '11111111-1111-4111-8111-111111111111';
const HOST_ID = '22222222-2222-4222-8222-222222222222';
const GUEST_ID = '33333333-3333-4333-8333-333333333333';
const ADMIN_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const REVIEW_ID = '44444444-4444-4444-8444-444444444444';
const PASSWORD = 'correct-password-1';

class StubAdmin implements AdminRepository {
  hotels: (AdminHotelItem & { status: AdminHotelStatus })[] = [
    {
      id: HOTEL_ID,
      slug: 'casa-azul',
      name: 'Casa Azul',
      city: 'Lisbon',
      country: 'Portugal',
      status: 'PENDING',
      host: { id: HOST_ID, name: 'host@example.com', email: 'host@example.com' },
      roomsCount: 2,
      createdAt: new Date().toISOString(),
    },
  ];

  users: AdminUserItem[] = [
    { id: HOST_ID, email: 'host@example.com', name: 'Host', role: 'HOST', status: 'ACTIVE', createdAt: new Date().toISOString() },
    { id: GUEST_ID, email: 'guest@example.com', name: 'Guest', role: 'GUEST', status: 'ACTIVE', createdAt: new Date().toISOString() },
    { id: ADMIN_ID, email: 'admin@example.com', name: 'Admin', role: 'ADMIN', status: 'ACTIVE', createdAt: new Date().toISOString() },
  ];

  reviews: AdminReviewItem[] = [
    {
      id: REVIEW_ID,
      hotel: { id: HOTEL_ID, name: 'Casa Azul' },
      author: { id: GUEST_ID, name: 'Guest' },
      rating: 5,
      title: 'Loved it',
      body: 'Quiet courtyard.',
      status: 'VISIBLE',
      createdAt: new Date().toISOString(),
    },
  ];

  async stats(): Promise<AdminStats> {
    return {
      usersTotal: 3,
      usersByRole: { GUEST: 1, HOST: 1, ADMIN: 1 },
      hotelsTotal: 1,
      hotelsByStatus: { PENDING: 1, PUBLISHED: 0, REJECTED: 0, SUSPENDED: 0 },
      bookingsTotal: 0,
      bookingsByStatus: { PENDING: 0, CONFIRMED: 0, COMPLETED: 0, CANCELLED: 0 },
      reviewsTotal: 1,
      reviewsHidden: 0,
    };
  }

  async listHotels(status?: AdminHotelStatus): Promise<AdminHotelItem[]> {
    return this.hotels.filter(hotel => !status || hotel.status === status);
  }

  async updateHotelStatus(id: string, status: AdminHotelStatus): Promise<AdminHotelItem> {
    const hotel = this.hotels.find(entry => entry.id === id);
    if (!hotel) throw Object.assign(new Error('missing'), { code: 'P2025' });
    hotel.status = status;
    return hotel;
  }

  async listUsers(query?: string, role?: 'GUEST' | 'HOST' | 'ADMIN'): Promise<AdminUserItem[]> {
    const term = query?.trim().toLowerCase() ?? '';
    return this.users.filter(
      user =>
        (!role || user.role === role) &&
        (!term || user.email.toLowerCase().includes(term) || user.name.toLowerCase().includes(term)),
    );
  }

  async updateUserStatus(id: string, status: AdminUserStatus): Promise<AdminUserItem> {
    const user = this.users.find(entry => entry.id === id);
    if (!user) throw Object.assign(new Error('missing'), { code: 'P2025' });
    user.status = status;
    return user;
  }

  async listReviews(status?: AdminReviewStatus): Promise<AdminReviewItem[]> {
    return this.reviews.filter(review => !status || review.status === status);
  }

  async updateReviewStatus(id: string, status: AdminReviewStatus): Promise<AdminReviewItem> {
    const review = this.reviews.find(entry => entry.id === id);
    if (!review) throw Object.assign(new Error('missing'), { code: 'P2025' });
    review.status = status;
    return review;
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
  role: UserRecord['role'],
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

/** Every route in the module, with a minimal valid call where one needs a body. */
const HOST_CALLS: { method: 'get' | 'patch'; path: string; body?: Record<string, string> }[] = [
  { method: 'get', path: '/api/admin/stats' },
  { method: 'get', path: '/api/admin/listings?status=PENDING' },
  { method: 'patch', path: `/api/admin/listings/${HOTEL_ID}/status`, body: { status: 'PUBLISHED' } },
  { method: 'get', path: '/api/admin/users?query=host&role=HOST' },
  { method: 'patch', path: `/api/admin/users/${GUEST_ID}/status`, body: { status: 'SUSPENDED' } },
  { method: 'get', path: '/api/admin/reviews?status=VISIBLE' },
  { method: 'patch', path: `/api/admin/reviews/${REVIEW_ID}/status`, body: { status: 'HIDDEN' } },
];

describe('Admin API (e2e)', () => {
  let app: INestApplication;
  let hostCookie: string;
  let adminCookie: string;

  beforeAll(async () => {
    const passwords = new PasswordService();
    const host = await seededUser(passwords, HOST_ID, 'host@example.com', 'HOST');
    const guest = await seededUser(passwords, GUEST_ID, 'guest@example.com', 'GUEST');
    const admin = await seededUser(passwords, ADMIN_ID, 'admin@example.com', 'ADMIN');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        $queryRaw: () => Promise.resolve([{ ok: 1 }]),
        $connect: () => Promise.resolve(),
      })
      .overrideProvider(USERS_REPOSITORY)
      .useValue(
        new StubUsers(
          new Map([
            [host.email, host],
            [guest.email, guest],
            [admin.email, admin],
          ]),
        ),
      )
      .overrideProvider(HOST_REPOSITORY)
      .useValue(new StubHostRepository())
      .overrideProvider(ADMIN_REPOSITORY)
      .useValue(new StubAdmin())
      .compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    for (const [email, slot] of [[host.email, 'host'], [admin.email, 'admin']] as const) {
      const login = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password: PASSWORD })
        .expect(200);
      const cookie = (login.headers['set-cookie'] as unknown as string[])[0] as string;
      if (slot === 'host') hostCookie = cookie;
      else adminCookie = cookie;
    }
  });

  afterAll(async () => {
    await app.close();
  });

  describe('role enforcement', () => {
    const callAs = (
      cookie: string | undefined,
      method: 'get' | 'patch',
      path: string,
      body?: Record<string, string>,
    ) => {
      const call = method === 'get'
        ? request(app.getHttpServer()).get(path)
        : request(app.getHttpServer()).patch(path);
      if (cookie) call.set('Cookie', cookie);
      return body ? call.send(body) : call;
    };

    it.each(HOST_CALLS)('$method $path 403s a host with ADMIN_REQUIRED', async ({ method, path, body }) => {
      const response = await callAs(hostCookie, method, path, body).expect(403);

      expect(response.body).toEqual({
        success: false,
        error: { code: 'ADMIN_REQUIRED', message: 'Admin access required' },
      });
    });

    it('401s an anonymous caller on every route', async () => {
      for (const { method, path, body } of HOST_CALLS) {
        await callAs(undefined, method, path, body).expect(401);
      }
    });
  });

  describe('as an admin', () => {
    it('reads stats', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/admin/stats')
        .set('Cookie', adminCookie)
        .expect(200);

      expect(response.body.data).toMatchObject({ usersTotal: 3, hotelsTotal: 1, reviewsTotal: 1 });
    });

    it('approves a pending listing', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/admin/listings/${HOTEL_ID}/status`)
        .set('Cookie', adminCookie)
        .send({ status: 'PUBLISHED' })
        .expect(200);

      expect(response.body.data).toMatchObject({ id: HOTEL_ID, status: 'PUBLISHED' });
    });

    it('suspends a user', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/admin/users/${GUEST_ID}/status`)
        .set('Cookie', adminCookie)
        .send({ status: 'SUSPENDED' })
        .expect(200);

      expect(response.body.data).toMatchObject({ id: GUEST_ID, status: 'SUSPENDED' });
    });

    it('refuses to suspend itself with ADMIN_SELF_SUSPEND', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/admin/users/${ADMIN_ID}/status`)
        .set('Cookie', adminCookie)
        .send({ status: 'SUSPENDED' })
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: { code: 'ADMIN_SELF_SUSPEND', message: 'Admins cannot suspend their own account' },
      });
    });

    it('hides a review', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/admin/reviews/${REVIEW_ID}/status`)
        .set('Cookie', adminCookie)
        .send({ status: 'HIDDEN' })
        .expect(200);

      expect(response.body.data).toMatchObject({ id: REVIEW_ID, status: 'HIDDEN' });
    });
  });
});
