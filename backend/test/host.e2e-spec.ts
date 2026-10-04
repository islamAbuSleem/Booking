import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/bootstrap.js';
import { PasswordService } from '../src/modules/auth/password.service.js';
import {
  HOST_REPOSITORY,
  type CreateBlackoutData,
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
const BLACKOUT_ID = 'abababab-abab-4bab-8bab-abababababab';
const PASSWORD = 'correct-password-1';

/** A blackout `Date` back to the `YYYY-MM-DD` the API speaks in. */
function toDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

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
  readonly deleted: string[] = [];

  /** Set by the delete-blocked tests: which side has bookings on it. */
  bookingsOnHotel = 0;
  bookingsOnRoom = 0;

  createdRooms: string[] = [];

  /** Set by the blackout tests: ranges the hotel is already closed for. */
  blackouts: Array<{ startsOn: string; endsOn: string }> = [];
  createdBlackouts: string[] = [];

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
    this.deleted.push('hotel');
  }

  async countBookingsForHotel(): Promise<number> {
    return this.bookingsOnHotel;
  }

  async countBookingsForRoom(): Promise<number> {
    return this.bookingsOnRoom;
  }

  async deleteRoom(roomId: string): Promise<void> {
    this.deleted.push(`room:${roomId}`);
  }

  async deleteBlackout(id: string): Promise<void> {
    this.deleted.push(`blackout:${id}`);
  }

  async createRoom(data: { hotelId: string; name: string; images: Array<{ publicId: string }> }) {
    this.createdRooms.push(data.name);
    return {
      id: `room-${this.createdRooms.length}`,
      name: data.name,
      description: '',
      bedType: '',
      maxGuests: 1,
      totalInventory: 1,
      sortOrder: 0,
      prices: [],
      images: [],
      blackoutDates: [],
    };
  }

  async updateRoom(): Promise<never> {
    throw new Error('unused');
  }

  async hasOverlappingBlackout(
    _hotelId: string,
    startsOn: Date,
    endsOn: Date,
  ): Promise<boolean> {
    return this.blackouts.some(
      (row) => row.startsOn <= toDay(endsOn) && row.endsOn >= toDay(startsOn),
    );
  }

  async createBlackout(data: CreateBlackoutData) {
    this.createdBlackouts.push(`${data.startsOn.toISOString().slice(0, 10)}..${data.endsOn.toISOString().slice(0, 10)}`);
    return {
      id: `blackout-${this.createdBlackouts.length}`,
      roomId: data.roomId,
      hotelId: data.hotelId,
      startsOn: data.startsOn,
      endsOn: data.endsOn,
      reason: data.reason,
    };
  }

  async findBookingsByHost() {
    return { items: [], total: 0 };
  }

  async findRoomHost(roomId: string): Promise<string | null> {
    return roomId === ROOM_ID ? HOST_A : null;
  }

  async findBlackoutHost(id: string): Promise<string | null> {
    return id === BLACKOUT_ID ? HOST_A : null;
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
  let world: OneHotelWorld;

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
      .useValue((world = new OneHotelWorld()))
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
        error: { code: 'FORBIDDEN', message: 'Hosts can only suspend their own listing' },
      });
    });

    it('403s a host re-queueing a rejected listing, or unpublishing a live one', async () => {
      // Denying only `PUBLISHED` left every other status host-writable, so a host could
      // re-approve their own rejection or pull a live listing off the shelf.
      for (const status of ['PENDING', 'REJECTED'] as const) {
        const response = await request(app.getHttpServer())
          .patch(`/api/host/hotels/${HOTEL_ID}`)
          .set('Cookie', cookieA)
          .send({ status })
          .expect(403);
        expect(response.body).toEqual({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Hosts can only suspend their own listing' },
        });
      }
    });

    it('still writes the other fields when the status is left out entirely', async () => {
      // The allow-list only speaks about `status`; a plain rename must not trip it.
      const response = await request(app.getHttpServer())
        .patch(`/api/host/hotels/${HOTEL_ID}`)
        .set('Cookie', cookieA)
        .send({ name: 'Casa Azul Nova' })
        .expect(200);
      expect(response.body.data).toMatchObject({ name: 'Casa Azul Nova' });
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
   * The client only tolerates an empty body on a `DELETE`, so a void handler that keeps
   * Nest's default 200 answers `{"success":true}` — no `data` key — and every delete call
   * site throws `BAD_RESPONSE` even though the delete worked.
   */
  describe('DELETE routes answer 204 with no body', () => {
    beforeEach(() => {
      world.deleted.length = 0;
    });

    it('204s the hotel delete with an empty body', async () => {
      const response = await request(app.getHttpServer())
        .delete(`/api/host/hotels/${HOTEL_ID}`)
        .set('Cookie', cookieA)
        .expect(204);
      expect(response.text).toBe('');
      expect(world.deleted).toContain('hotel');
    });

    it('204s the room delete with an empty body', async () => {
      const response = await request(app.getHttpServer())
        .delete(`/api/host/hotels/rooms/${ROOM_ID}`)
        .set('Cookie', cookieA)
        .expect(204);
      expect(response.text).toBe('');
      expect(world.deleted).toContain(`room:${ROOM_ID}`);
    });

    it('409s a hotel delete blocked by bookings, before the FK ever trips', async () => {
      world.bookingsOnHotel = 2;
      try {
        const response = await request(app.getHttpServer())
          .delete(`/api/host/hotels/${HOTEL_ID}`)
          .set('Cookie', cookieA)
          .expect(409);
        expect(response.body).toEqual({
          success: false,
          error: {
            code: 'HOTEL_HAS_BOOKINGS',
            message: 'This listing has bookings and cannot be deleted',
          },
        });
        expect(world.deleted).not.toContain('hotel');
      }
      finally {
        world.bookingsOnHotel = 0;
      }
    });

    it('409s a room delete blocked by bookings, before the FK ever trips', async () => {
      world.bookingsOnRoom = 1;
      try {
        const response = await request(app.getHttpServer())
          .delete(`/api/host/hotels/rooms/${ROOM_ID}`)
          .set('Cookie', cookieA)
          .expect(409);
        expect(response.body).toEqual({
          success: false,
          error: {
            code: 'ROOM_HAS_BOOKINGS',
            message: 'This room has bookings and cannot be deleted',
          },
        });
        expect(world.deleted).not.toContain(`room:${ROOM_ID}`);
      }
      finally {
        world.bookingsOnRoom = 0;
      }
    });

    it('204s the blackout delete with an empty body', async () => {
      const response = await request(app.getHttpServer())
        .delete(`/api/host/hotels/blackouts/${BLACKOUT_ID}`)
        .set('Cookie', cookieA)
        .expect(204);
      expect(response.text).toBe('');
      expect(world.deleted).toContain(`blackout:${BLACKOUT_ID}`);
    });
  });

  describe('POST /api/host/hotels/:id/rooms', () => {
    const OWN_PUBLIC_ID = `booking/hotels/${HOST_A}/suite-1`;
    const ROOM = {
      name: 'Suite',
      description: 'A suite.',
      bedType: 'king',
      maxGuests: 2,
      totalInventory: 1,
      prices: [{ currency: 'USD', priceCents: 10_000 }],
      images: [] as Array<{
        url: string
        publicId: string
        altText: string | null
        sortOrder: number
        isCover: boolean
      }>,
    };

    beforeEach(() => {
      world.createdRooms.length = 0;
    });

    it('201s a room whose image publicId is in the caller\'s own folder', async () => {
      await request(app.getHttpServer())
        .post(`/api/host/hotels/${HOTEL_ID}/rooms`)
        .set('Cookie', cookieA)
        .send({
          ...ROOM,
          images: [
            {
              url: `https://res.cloudinary.com/x/image/upload/${OWN_PUBLIC_ID}.jpg`,
              publicId: OWN_PUBLIC_ID,
              altText: null,
              sortOrder: 0,
              isCover: true,
            },
          ],
        })
        .expect(201);
      expect(world.createdRooms).toEqual(['Suite']);
    });

    it('403s UPLOAD_FOREIGN for another host\'s asset, writing no room', async () => {
      const foreign = `booking/hotels/${HOST_B}/suite-1`;
      const response = await request(app.getHttpServer())
        .post(`/api/host/hotels/${HOTEL_ID}/rooms`)
        .set('Cookie', cookieA)
        .send({
          ...ROOM,
          images: [
            {
              url: `https://res.cloudinary.com/x/image/upload/${foreign}.jpg`,
              publicId: foreign,
              altText: null,
              sortOrder: 0,
              isCover: true,
            },
          ],
        })
        .expect(403);
      expect(response.body).toEqual({
        success: false,
        error: { code: 'UPLOAD_FOREIGN', message: 'This asset is not in your upload folder' },
      });
      expect(world.createdRooms).toEqual([]);
    });

    it('403s a sibling folder that merely shares the platform prefix', async () => {
      // `booking/hotels/{HOST_A}-extra/` starts with nothing the caller owns, and a plain
      // `startsWith('booking/hotels/')` would have let it through.
      const sibling = `booking/hotels/${HOST_A}-extra/suite-1`;
      await request(app.getHttpServer())
        .post(`/api/host/hotels/${HOTEL_ID}/rooms`)
        .set('Cookie', cookieA)
        .send({
          ...ROOM,
          images: [
            {
              url: `https://res.cloudinary.com/x/image/upload/${sibling}.jpg`,
              publicId: sibling,
              altText: null,
              sortOrder: 0,
              isCover: true,
            },
          ],
        })
        .expect(403);
      expect(world.createdRooms).toEqual([]);
    });

    it('201s a room with no images at all: there is nothing to check', async () => {
      await request(app.getHttpServer())
        .post(`/api/host/hotels/${HOTEL_ID}/rooms`)
        .set('Cookie', cookieA)
        .send(ROOM)
        .expect(201);
      expect(world.createdRooms).toEqual(['Suite']);
    });
  });

  describe('POST /api/host/hotels/:id/blackouts', () => {
    beforeEach(() => {
      world.blackouts = [{ startsOn: '2026-03-10', endsOn: '2026-03-20' }];
      world.createdBlackouts.length = 0;
    });

    it('201s a range that reaches no existing blackout', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/host/hotels/${HOTEL_ID}/blackouts`)
        .set('Cookie', cookieA)
        .send({ roomId: null, startsOn: '2026-04-01', endsOn: '2026-04-03', reason: null })
        .expect(201);
      expect(response.body.data).toMatchObject({ startsOn: '2026-04-01', endsOn: '2026-04-03' });
      expect(world.createdBlackouts).toEqual(['2026-04-01..2026-04-03']);
    });

    it('400s an inverted range instead of persisting it', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/host/hotels/${HOTEL_ID}/blackouts`)
        .set('Cookie', cookieA)
        .send({ roomId: null, startsOn: '2026-05-10', endsOn: '2026-05-01', reason: null })
        .expect(400);
      expect(response.body.error).toMatchObject({
        code: 'VALIDATION_FAILED',
        details: [expect.objectContaining({ path: 'endsOn' })],
      });
      expect(world.createdBlackouts).toEqual([]);
    });

    it('400s a range overlapping an existing one, whichever side reaches in', async () => {
      for (const range of [
        { startsOn: '2026-03-19', endsOn: '2026-03-25' },
        { startsOn: '2026-03-05', endsOn: '2026-03-11' },
        { startsOn: '2026-03-01', endsOn: '2026-03-31' },
      ]) {
        const response = await request(app.getHttpServer())
          .post(`/api/host/hotels/${HOTEL_ID}/blackouts`)
          .set('Cookie', cookieA)
          .send({ ...range, roomId: null, reason: null })
          .expect(400);
        expect(response.body.error.code).toBe('BAD_REQUEST');
      }
      // A blackout is inclusive on both ends, so touching it is an overlap too.
      const edge = await request(app.getHttpServer())
        .post(`/api/host/hotels/${HOTEL_ID}/blackouts`)
        .set('Cookie', cookieA)
        .send({ roomId: null, startsOn: '2026-03-20', endsOn: '2026-03-20', reason: null })
        .expect(400);
      expect(edge.body.error.code).toBe('BAD_REQUEST');
      expect(world.createdBlackouts).toEqual([]);
    });

    it('201s a range that only touches the day after the existing one', async () => {
      await request(app.getHttpServer())
        .post(`/api/host/hotels/${HOTEL_ID}/blackouts`)
        .set('Cookie', cookieA)
        .send({ roomId: null, startsOn: '2026-03-21', endsOn: '2026-03-22', reason: null })
        .expect(201);
    });

    it('403s host B before any overlap check answers for him', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/host/hotels/${HOTEL_ID}/blackouts`)
        .set('Cookie', cookieB)
        .send({ roomId: null, startsOn: '2026-03-01', endsOn: '2026-03-02', reason: null })
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
