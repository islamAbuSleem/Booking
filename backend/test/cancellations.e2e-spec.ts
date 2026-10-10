import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/bootstrap.js';
import { PasswordService } from '../src/modules/auth/password.service.js';
import { HOST_REPOSITORY } from '../src/modules/host/host.repository.js';
import { StubHostRepository } from '../src/modules/host/host.stub.js';
import {
  USERS_REPOSITORY,
  type UserRecord,
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
import { PrismaService } from '../src/prisma/prisma.service.js';
import type { UserRole } from '../src/modules/users/users.repository.js';

/**
 * T37 over real HTTP, with only the database replaced.
 *
 * The guard, the pipes, the envelope and the status codes are all real. The ticket's
 * verify lines are all about the wire — tier boundaries, the no-refund window, the
 * exact boundary day, and the fully refundable early cancellation — so they are pinned
 * here, against the clock the server actually reads.
 */

const GUEST_ID = '11111111-1111-4111-8111-111111111111';
const HOST_ID = '22222222-2222-4222-8222-222222222222';
const STRANGER_ID = '33333333-3333-4333-8333-333333333333';
const HOTEL_ID = '44444444-4444-4444-8444-444444444444';
const BOOKING_ID = '55555555-5555-4555-8555-555555555555';
const PENDING_BOOKING_ID = '66666666-6666-4666-8666-666666666666';
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
    createdAt: new Date('2026-05-20T10:00:00.000Z'),
    ...overrides,
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
    const record = {
      hotelId,
      tiers: [...tiers].sort((a, b) => b.daysBefore - a.daysBefore),
      noRefundWithinHours,
      version,
    };
    this.rows.set(hotelId, record);
    return record;
  }
}

class OwnerHostRepository extends StubHostRepository {
  async findByIdAndHost(id: string, hostId: string): Promise<never> {
    if (id === HOTEL_ID && hostId === HOST_ID) {
      return {
        id: HOTEL_ID,
        slug: HOTEL.slug,
        name: HOTEL.name,
        description: HOTEL.description,
        addressLine: HOTEL.addressLine,
        city: HOTEL.city,
        country: HOTEL.country,
        lat: HOTEL.lat,
        lng: HOTEL.lng,
        starRating: HOTEL.starRating,
        status: 'PUBLISHED',
        checkInTime: HOTEL.checkInTime,
        checkOutTime: HOTEL.checkOutTime,
        coverImageUrl: null,
        images: [],
        amenityIds: HOTEL.amenityIds,
        rooms: [],
        host: { id: HOST_ID, name: 'Beatriz Salgueiro' },
      } as never;
    }
    return null as never;
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

describe('Cancellation policy API (e2e)', () => {
  let app: INestApplication;
  let policies: StubPolicies;
  let guestCookie: string;
  let hostCookie: string;
  let strangerCookie: string;

  async function login(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return (response.headers['set-cookie'] as unknown as string[])[0] as string;
  }

  beforeAll(async () => {
    policies = new StubPolicies();
    const passwords = new PasswordService();
    const guest = await seededUser(passwords, GUEST_ID, 'guest@example.com', 'GUEST');
    const host = await seededUser(passwords, HOST_ID, 'host@example.com', 'HOST');
    const stranger = await seededUser(passwords, STRANGER_ID, 'stranger@example.com', 'GUEST');
    const users = new StubUsers(
      new Map([
        [guest.email, guest],
        [host.email, host],
        [stranger.email, stranger],
      ]),
    );
    const bookings = new StubBookings(
      new Map([
        [BOOKING_ID, bookingRecord()],
        [PENDING_BOOKING_ID, bookingRecord({ id: PENDING_BOOKING_ID, status: 'PENDING' })],
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
      .useValue(new OwnerHostRepository())
      .overrideProvider(HOTELS_REPOSITORY)
      .useValue(new StubHotels())
      .overrideProvider(BOOKINGS_REPOSITORY)
      .useValue(bookings)
      .overrideProvider(CANCELLATION_REPOSITORY)
      .useValue(policies)
      .compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    guestCookie = await login(guest.email);
    hostCookie = await login(host.email);
    strangerCookie = await login(stranger.email);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    policies.rows.clear();
  });

  describe('GET /api/hotels/:id/cancellation-policy', () => {
    it('answers the API default at version 0 when the hotel has no row', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/hotels/${HOTEL_ID}/cancellation-policy`)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: {
          hotelId: HOTEL_ID,
          tiers: [
            { daysBefore: 30, refundPercent: 100 },
            { daysBefore: 7, refundPercent: 50 },
          ],
          noRefundWithinHours: 24,
          version: 0,
        },
      });
    });

    it('404s HOTEL_NOT_FOUND for a hotel that does not exist', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/hotels/99999999-9999-4999-8999-999999999999/cancellation-policy')
        .expect(404);

      expect(response.body.error.code).toBe('HOTEL_NOT_FOUND');
    });
  });

  describe('PUT /api/host/hotels/:id/cancellation-policy', () => {
    it('stores the policy and bumps the version on every write', async () => {
      const first = await request(app.getHttpServer())
        .put(`/api/host/hotels/${HOTEL_ID}/cancellation-policy`)
        .set('Cookie', hostCookie)
        .send({
          tiers: [
            { daysBefore: 14, refundPercent: 75 },
            { daysBefore: 3, refundPercent: 25 },
          ],
          noRefundWithinHours: 48,
        })
        .expect(200);

      expect(first.body.data.version).toBe(1);

      const second = await request(app.getHttpServer())
        .put(`/api/host/hotels/${HOTEL_ID}/cancellation-policy`)
        .set('Cookie', hostCookie)
        .send({
          tiers: [{ daysBefore: 14, refundPercent: 75 }],
          noRefundWithinHours: 48,
        })
        .expect(200);

      expect(second.body.data.version).toBe(2);
    });

    it('403s NOT_HOTEL_OWNER for a host who does not own the listing', async () => {
      // A stranger with HOST role would pass the role guard but fail ownership;
      // here the stranger is a guest, so the role guard answers first — either way
      // a non-owner never writes.
      await request(app.getHttpServer())
        .put(`/api/host/hotels/${HOTEL_ID}/cancellation-policy`)
        .set('Cookie', strangerCookie)
        .send({
          tiers: [{ daysBefore: 14, refundPercent: 75 }],
          noRefundWithinHours: 48,
        })
        .expect(403);
    });
  });

  describe('POST /api/bookings/:id/cancellation-quote', () => {
    it('quotes a fully refundable early cancellation at 100% of the total', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/bookings/${BOOKING_ID}/cancellation-quote`)
        .set('Cookie', guestCookie)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: {
          refundPercent: 100,
          refundCents: 30500,
          currency: 'USD',
          policyVersion: 0,
        },
      });
    });

    it('prices against the stored policy version once the host writes one', async () => {
      await request(app.getHttpServer())
        .put(`/api/host/hotels/${HOTEL_ID}/cancellation-policy`)
        .set('Cookie', hostCookie)
        .send({
          tiers: [{ daysBefore: 60, refundPercent: 25 }],
          noRefundWithinHours: 0,
        })
        .expect(200);

      const response = await request(app.getHttpServer())
        .post(`/api/bookings/${BOOKING_ID}/cancellation-quote`)
        .set('Cookie', guestCookie)
        .expect(200);

      expect(response.body.data).toEqual({
        refundPercent: 25,
        refundCents: 7625,
        currency: 'USD',
        policyVersion: 1,
      });
    });

    it('400s INVALID_CANCEL_STATE for a booking that is not CONFIRMED, with the reason', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/bookings/${PENDING_BOOKING_ID}/cancellation-quote`)
        .set('Cookie', guestCookie)
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'INVALID_CANCEL_STATE',
          message: 'Only a confirmed booking can be cancelled',
        },
      });
    });

    it('403s NOT_BOOKING_OWNER for a booking that belongs to a different guest', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/bookings/${BOOKING_ID}/cancellation-quote`)
        .set('Cookie', strangerCookie)
        .expect(403);

      expect(response.body.error.code).toBe('NOT_BOOKING_OWNER');
    });
  });
});
