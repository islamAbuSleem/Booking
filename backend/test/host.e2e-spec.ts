import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/bootstrap.js';
import { PasswordService } from '../src/modules/auth/password.service.js';
import {
  HOST_REPOSITORY,
  type HostHotelDetail,
  type HostRepository,
} from '../src/modules/host/host.repository.js';
import {
  USERS_REPOSITORY,
  type UserRecord,
  type UsersRepository,
} from '../src/modules/users/users.repository.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * T22 over real HTTP, with only the database replaced.
 *
 * The guard, the role check, the pipes, the envelope and the status codes are all real;
 * the host repository is in-memory with a single hotel owned by host A. This file pins
 * the ticket's verify clause: host B gets 403 `NOT_HOTEL_OWNER` on host A's listing,
 * a guest gets 403 from the role guard, and an anonymous caller gets 401.
 */

const HOST_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const HOST_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const GUEST = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ADMIN = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const HOTEL_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const ROOM_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const PASSWORD = 'correct-password-1';

const HOTEL: HostHotelDetail = {
  id: HOTEL_ID,
  slug: 'casa-azul',
  name: 'Casa Azul',
  description: 'A blue house.',
  addressLine: 'Rua Azul 1',
  city: 'Lisbon',
  country: 'Portugal',
  lat: 38.7,
  lng: -9.1,
  starRating: 4,
  status: 'PUBLISHED',
  checkInTime: '15:00',
  checkOutTime: '11:00',
  coverImageUrl: null,
  images: [],
  amenityIds: [],
  rooms: [],
  host: { id: HOST_A, name: 'host-a@example.com' },
};

/** One hotel, one owner. Every id that is not HOTEL_ID belongs to nobody. */
class OneHotelWorld implements HostRepository {
  async findByHost(hostId: string) {
    return hostId === HOST_A
      ? { items: [{ id: HOTEL.id, slug: HOTEL.slug, name: HOTEL.name, city: HOTEL.city, country: HOTEL.country, starRating: HOTEL.starRating, status: HOTEL.status, coverImageUrl: null, roomsCount: 0, upcomingBookingsCount: 0, createdAt: new Date().toISOString() }], total: 1 }
      : { items: [], total: 0 };
  }

  async findByIdAndHost(id: string, hostId: string): Promise<HostHotelDetail | null> {
    return (id === HOTEL_ID || id === HOTEL.slug) && hostId === HOST_A ? HOTEL : null;
  }

  async slugExists(slug: string): Promise<boolean> {
    return slug === HOTEL.slug;
  }

  async create(): Promise<HostHotelDetail> {
    throw new Error('unused');
  }

  async update(
    _id: string,
    _hostId: string,
    data: { status?: HostHotelDetail['status']; name?: string },
  ): Promise<HostHotelDetail> {
    return { ...HOTEL, ...data };
  }

  async delete(): Promise<void> {
    throw new Error('unused');
  }

  async createRoom(): Promise<never> {
    throw new Error('unused');
  }

  async updateRoom(): Promise<never> {
    throw new Error('unused');
  }

  async deleteRoom(): Promise<void> {
    throw new Error('unused');
  }

  async createBlackout(): Promise<never> {
    throw new Error('unused') as never;
  }

  async deleteBlackout(): Promise<void> {
    throw new Error('unused');
  }

  async findBookingsByHost() {
    return { items: [], total: 0 };
  }

  async findRoomHost(roomId: string): Promise<string | null> {
    return roomId === ROOM_ID ? HOST_A : null;
  }

  async findBlackoutHost(): Promise<string | null> {
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
  role: UserRecord['role'],
): Promise<UserRecord> {
  return {
    id,
    email,
    name: email,
    avatarUrl: null,
    passwordHash: await passwords.hash(PASSWORD),
    role,
    oauthProvider: null,
    oauthAccountId: null,
    createdAt: new Date(),
  };
}

describe('Host API (e2e)', () => {
  let app: INestApplication;
  let cookieA: string;
  let cookieB: string;
  let cookieGuest: string;
  let cookieAdmin: string;

  beforeAll(async () => {
    const passwords = new PasswordService();
    const hostA = await seededUser(passwords, HOST_A, 'host-a@example.com', 'HOST');
    const hostB = await seededUser(passwords, HOST_B, 'host-b@example.com', 'HOST');
    const guest = await seededUser(passwords, GUEST, 'guest@example.com', 'GUEST');
    const admin = await seededUser(passwords, ADMIN, 'admin@example.com', 'ADMIN');

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
            [hostA.email, hostA],
            [hostB.email, hostB],
            [guest.email, guest],
            [admin.email, admin],
          ]),
        ),
      )
      .overrideProvider(HOST_REPOSITORY)
      .useValue(new OneHotelWorld())
      .compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    for (const [email, slot] of [
      [hostA.email, 'A'],
      [hostB.email, 'B'],
      [guest.email, 'guest'],
      [admin.email, 'admin'],
    ] as const) {
      const login = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password: PASSWORD })
        .expect(200);
      const cookie = (login.headers['set-cookie'] as unknown as string[])[0] as string;
      if (slot === 'A') cookieA = cookie;
      else if (slot === 'B') cookieB = cookie;
      else if (slot === 'guest') cookieGuest = cookie;
      else cookieAdmin = cookie;
    }
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/host/hotels', () => {
    it('lists only the caller\u2019s own hotels, so B never sees A\u2019s listing', async () => {
      const a = await request(app.getHttpServer())
        .get('/api/host/hotels')
        .set('Cookie', cookieA)
        .expect(200);
      expect(a.body.data.items).toHaveLength(1);

      const b = await request(app.getHttpServer())
        .get('/api/host/hotels')
        .set('Cookie', cookieB)
        .expect(200);
      expect(b.body.data).toEqual({ items: [], total: 0 });
    });

    it('401s an anonymous caller', async () => {
      const response = await request(app.getHttpServer()).get('/api/host/hotels').expect(401);
      expect(response.body).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });
    });

    it('403s a guest: the role guard is exact membership, no hierarchy', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/host/hotels')
        .set('Cookie', cookieGuest)
        .expect(403);
      expect(response.body).toMatchObject({ success: false });
    });
  });

  describe('GET /api/host/hotels/:id', () => {
    it('200s the owner', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/host/hotels/${HOTEL_ID}`)
        .set('Cookie', cookieA)
        .expect(200);
      expect(response.body.data).toMatchObject({ id: HOTEL_ID, slug: 'casa-azul' });
    });

    it('403s host B on host A\u2019s hotel with NOT_HOTEL_OWNER, not a 404', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/host/hotels/${HOTEL_ID}`)
        .set('Cookie', cookieB)
        .expect(403);
      expect(response.body).toEqual({
        success: false,
        error: { code: 'NOT_HOTEL_OWNER', message: 'This listing belongs to another host' },
      });
    });

    it('403s an unknown id too: missing and foreign answer alike', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/host/hotels/99999999-9999-4999-8999-999999999999')
        .set('Cookie', cookieA)
        .expect(403);
      expect(response.body.error.code).toBe('NOT_HOTEL_OWNER');
    });
  });

  describe('PATCH /api/host/hotels/:id', () => {
    it('403s host B on host A\u2019s hotel', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/host/hotels/${HOTEL_ID}`)
        .set('Cookie', cookieB)
        .send({ name: 'Stolen Casa' })
        .expect(403);
      expect(response.body.error.code).toBe('NOT_HOTEL_OWNER');
    });

    it('403s a host publishing their own hotel: publishing is the admin\u2019s decision', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/host/hotels/${HOTEL_ID}`)
        .set('Cookie', cookieA)
        .send({ status: 'PUBLISHED' })
        .expect(403);
      expect(response.body).toEqual({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Only admins can publish listings' },
      });
    });

    it('lets the owner suspend their own listing', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/host/hotels/${HOTEL_ID}`)
        .set('Cookie', cookieA)
        .send({ status: 'SUSPENDED' })
        .expect(200);
      expect(response.body.data).toMatchObject({ id: HOTEL_ID, status: 'SUSPENDED' });
    });

    it('403s an admin too: publishing goes through moderation (T25), never this route', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/host/hotels/${HOTEL_ID}`)
        .set('Cookie', cookieAdmin)
        .send({ status: 'PUBLISHED' })
        .expect(403);
      // Ownership is checked first: an admin who owns nothing here is a non-owner first.
      expect(response.body.error.code).toBe('NOT_HOTEL_OWNER');
    });
  });

  describe('PATCH /api/host/hotels/rooms/:roomId', () => {
    it('403s host B on host A\u2019s room', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/host/hotels/rooms/${ROOM_ID}`)
        .set('Cookie', cookieB)
        .send({ name: 'Stolen Room' })
        .expect(403);
      expect(response.body.error.code).toBe('NOT_HOTEL_OWNER');
    });
  });

  /**
   * Route registration order, pinned over HTTP: `@Get('bookings')` declared after
   * `@Get(':id')` is unreachable, and the failure mode is a 500 from the uuid filter
   * rather than a 404 — so only this test catches a regression.
   */
  describe('GET /api/host/hotels/bookings', () => {
    it('answers the bookings page instead of falling into :id', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/host/hotels/bookings')
        .set('Cookie', cookieA)
        .expect(200);
      expect(response.body).toEqual({
        success: true,
        data: { items: [], total: 0 },
      });
    });

    it('401s an anonymous caller', async () => {
      await request(app.getHttpServer()).get('/api/host/hotels/bookings').expect(401);
    });

    it('403s a guest: the role guard is exact membership, no hierarchy', async () => {
      await request(app.getHttpServer())
        .get('/api/host/hotels/bookings')
        .set('Cookie', cookieGuest)
        .expect(403);
    });
  });
});
