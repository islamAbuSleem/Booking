import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/bootstrap.js';
import {
  AVAILABILITY_REPOSITORY,
  type AvailabilityRepository,
  type AvailabilityRoom,
  type BlackoutWindow,
  type BookingOverlap,
  type HotelRooms,
  type RoomPrice,
} from '../src/prisma/availability.repository.js';
import {
  BOOKINGS_REPOSITORY,
  type BookingCreateInput,
  type BookingHotelSnapshot,
  type BookingRecord,
  type BookingRepository,
  type BookingStatus,
} from '../src/prisma/bookings.repository.js';
import {
  USERS_REPOSITORY,
  type UserRecord,
  type UsersRepository,
} from '../src/modules/users/users.repository.js';
import { PasswordService } from '../src/modules/auth/password.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * T20 over real HTTP, with only the database replaced.
 *
 * The guard, the pipes, the envelope and the status codes are all real; the two
 * repositories are in-memory. Cases 7 and 8 (the oversell proof and the P2034 retry)
 * live in `prisma-bookings.repository.spec.ts` against a fake `PrismaService` — that is
 * where the transaction is unit-testable. This file pins the wire: the 201/403/404/409
 * codes a client branches on, the embedded hotel snapshot, and the 401 every route owes
 * an anonymous caller.
 */

const HOTEL_ID = '11111111-1111-4111-8111-111111111111';
const ROOM_ID = '22222222-2222-4222-8222-222222222222';
const UNKNOWN_BOOKING = '99999999-9999-4999-8999-999999999999';

const ADA_ID = '33333333-3333-4333-8333-333333333333';
const BO_ID = '44444444-4444-4444-8444-444444444444';
const PASSWORD = 'correct-password-1';

const HOTEL: BookingHotelSnapshot = {
  id: HOTEL_ID,
  slug: 'the-larkspur-hotel',
  name: 'Larkspur House',
  city: 'Lisbon',
  country: 'Portugal',
  addressLine: '12 Rua do Vale',
  coverImage: 'https://images.test/larkspur-cover.jpg',
};

const ROOM: AvailabilityRoom = {
  id: ROOM_ID,
  hotelId: HOTEL_ID,
  name: 'Deluxe King',
  bedType: 'king',
  maxGuests: 2,
  totalInventory: 5,
};

const PRICE: RoomPrice = { amountCents: 20_000, currency: 'USD' };

/**
 * One in-memory world implementing both repository contracts, so create, list, get and
 * cancel share the rows they actually read and write.
 */
class InMemoryWorld implements AvailabilityRepository, BookingRepository {
  readonly bookings = new Map<string, BookingRecord>();
  private seq = 0;

  // AvailabilityRepository — one PUBLISHED hotel and one priced room, nothing overlapping.
  async findHotelRooms(idOrSlug: string): Promise<HotelRooms | null> {
    return idOrSlug === HOTEL_ID
      ? { id: HOTEL_ID, status: 'PUBLISHED', rooms: [ROOM] }
      : null;
  }

  async findRoom(roomId: string): Promise<AvailabilityRoom | null> {
    return roomId === ROOM_ID ? ROOM : null;
  }

  async findOverlappingBookings(
    roomIds: readonly string[],
    checkIn: string,
    checkOut: string,
  ): Promise<BookingOverlap[]> {
    return [...this.bookings.values()].filter(
      (row) =>
        roomIds.includes(row.roomId) &&
        (row.status === 'PENDING' || row.status === 'CONFIRMED') &&
        row.checkIn < checkOut &&
        row.checkOut > checkIn,
    );
  }

  async findOverlappingBlackouts(): Promise<BlackoutWindow[]> {
    return [];
  }

  async findRoomPrice(
    roomId: string,
    currency: string,
  ): Promise<RoomPrice | null> {
    if (roomId !== ROOM_ID) return null;
    return PRICE.currency === currency ? PRICE : null;
  }

  // BookingRepository
  async createPending(input: BookingCreateInput): Promise<BookingRecord> {
    // The `:id` param is validated as a uuid on the wire, so the fake's ids are uuids too.
    const seq = ++this.seq;
    const record: BookingRecord = {
      id: `10000000-0000-4000-8000-00000000${String(seq).padStart(4, '0')}`,
      reference: `GB-${String(this.seq).padStart(4, '0')}`,
      status: 'PENDING',
      guestId: input.guestId,
      roomId: input.roomId,
      hotelId: HOTEL_ID,
      roomName: ROOM.name,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      guestsCount: input.guests,
      nights: input.nights,
      subtotalCents: input.subtotalCents,
      feesCents: input.feesCents,
      totalCents: input.totalCents,
      currency: input.currency,
      createdAt: new Date(),
    };
    this.bookings.set(record.id, record);
    return record;
  }

  async findById(bookingId: string): Promise<BookingRecord | null> {
    return this.bookings.get(bookingId) ?? null;
  }

  async findForOwner(ownerId: string): Promise<BookingRecord[]> {
    return [...this.bookings.values()].filter((row) => row.guestId === ownerId);
  }

  async findHotelSnapshot(
    hotelId: string,
  ): Promise<BookingHotelSnapshot | null> {
    return hotelId === HOTEL_ID ? HOTEL : null;
  }

  async findRoomPriceCurrency(roomId: string): Promise<string | null> {
    return roomId === ROOM_ID ? PRICE.currency : null;
  }

  async updateStatus(
    bookingId: string,
    status: BookingStatus,
  ): Promise<BookingRecord | null> {
    const row = this.bookings.get(bookingId);
    if (!row) return null;
    const updated = { ...row, status };
    this.bookings.set(bookingId, updated);
    return updated;
  }

  /** Test-only: the T26 confirmation, so cancel can be exercised both ways. */
  confirm(bookingId: string): void {
    const row = this.bookings.get(bookingId);
    if (!row) throw new Error('no such booking');
    this.bookings.set(bookingId, { ...row, status: 'CONFIRMED' });
  }

  /** Every test starts from the first booking's row, which is what the assertions above rely on. */
  reset(): void {
    this.bookings.clear();
    this.seq = 0;
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
    oauthProvider: null,
    oauthAccountId: null,
    createdAt: new Date(),
  };
}

const CREATE_BODY = {
  roomId: ROOM_ID,
  checkIn: '2026-06-01',
  checkOut: '2026-06-04',
  guests: 2,
  guestName: 'Ada Lovelace',
  guestEmail: 'ada@example.com',
  guestPhone: '+351 21 000 0000',
};

describe('Bookings API (e2e)', () => {
  let app: INestApplication;
  let world: InMemoryWorld;
  let adaCookie: string;
  let boCookie: string;

  beforeAll(async () => {
    world = new InMemoryWorld();
    const passwords = new PasswordService();
    const ada = await seededUser(passwords, ADA_ID, 'ada@example.com');
    const bo = await seededUser(passwords, BO_ID, 'bo@example.com');

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
            [ada.email, ada],
            [bo.email, bo],
          ]),
        ),
      )
      .overrideProvider(AVAILABILITY_REPOSITORY)
      .useValue(world)
      .overrideProvider(BOOKINGS_REPOSITORY)
      .useValue(world)
      .compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: ada.email, password: PASSWORD })
      .expect(200);
    adaCookie = (
      login.headers['set-cookie'] as unknown as string[]
    )[0] as string;

    const boLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: bo.email, password: PASSWORD })
      .expect(200);
    boCookie = (
      boLogin.headers['set-cookie'] as unknown as string[]
    )[0] as string;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    world.reset();
  });

  /** One PENDING booking for Ada, returned for the get/cancel cases. */
  async function adaBooking(): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/bookings')
      .set('Cookie', adaCookie)
      .send(CREATE_BODY)
      .expect(201);
    return response.body.data.id as string;
  }

  describe('POST /api/bookings', () => {
    it('creates the PENDING booking and embeds the property snapshot', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/bookings')
        .set('Cookie', adaCookie)
        .send(CREATE_BODY)
        .expect(201);

      expect(response.body).toEqual({
        success: true,
        data: {
          id: '10000000-0000-4000-8000-000000000001',
          reference: 'GB-0001',
          status: 'PENDING',
          checkIn: '2026-06-01',
          checkOut: '2026-06-04',
          nights: 3,
          guestsCount: 2,
          currency: 'USD',
          subtotalCents: 60_000,
          feesCents: 0,
          totalCents: 60_000,
          hotel: HOTEL,
          room: { name: 'Deluxe King' },
          createdAt: expect.stringMatching(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
          ),
        },
      });
    });

    it('ignores client-sent money: the snapshot is the server arithmetic', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/bookings')
        .set('Cookie', adaCookie)
        .send({
          ...CREATE_BODY,
          subtotalCents: 1,
          totalCents: 2,
          feesCents: 3,
        })
        .expect(201);

      expect(response.body.data.totalCents).toBe(60_000);
      expect(response.body.data.subtotalCents).toBe(60_000);
    });

    it('404s ROOM_NOT_FOUND for a room that does not exist', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/bookings')
        .set('Cookie', adaCookie)
        .send({ ...CREATE_BODY, roomId: UNKNOWN_BOOKING })
        .expect(404);

      expect(response.body.error).toMatchObject({ code: 'ROOM_NOT_FOUND' });
    });

    it('401s an unauthenticated caller', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/bookings')
        .send(CREATE_BODY)
        .expect(401);

      expect(response.body).toEqual({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
    });
  });

  describe('GET /api/bookings', () => {
    it("lists only the caller's bookings", async () => {
      await adaBooking();

      const mine = await request(app.getHttpServer())
        .get('/api/bookings')
        .set('Cookie', adaCookie)
        .expect(200);
      expect(mine.body).toEqual({
        success: true,
        data: {
          items: [
            expect.objectContaining({
              id: '10000000-0000-4000-8000-000000000001',
              status: 'PENDING',
            }),
          ],
          total: 1,
        },
      });

      const theirs = await request(app.getHttpServer())
        .get('/api/bookings')
        .set('Cookie', boCookie)
        .expect(200);
      expect(theirs.body.data).toEqual({ items: [], total: 0 });
    });

    it('401s an unauthenticated caller', async () => {
      await request(app.getHttpServer()).get('/api/bookings').expect(401);
    });
  });

  describe('GET /api/bookings/:id', () => {
    it("returns the caller's own booking", async () => {
      const id = await adaBooking();

      const response = await request(app.getHttpServer())
        .get(`/api/bookings/${id}`)
        .set('Cookie', adaCookie)
        .expect(200);

      expect(response.body.data).toMatchObject({
        id,
        reference: 'GB-0001',
        status: 'PENDING',
        hotel: { slug: 'the-larkspur-hotel' },
      });
    });

    it("403s NOT_BOOKING_OWNER for someone else's booking", async () => {
      const id = await adaBooking();

      const response = await request(app.getHttpServer())
        .get(`/api/bookings/${id}`)
        .set('Cookie', boCookie)
        .expect(403);

      expect(response.body.error).toMatchObject({
        code: 'NOT_BOOKING_OWNER',
      });
    });

    it('404s BOOKING_NOT_FOUND for a booking that does not exist', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/bookings/${UNKNOWN_BOOKING}`)
        .set('Cookie', adaCookie)
        .expect(404);

      expect(response.body.error).toMatchObject({ code: 'BOOKING_NOT_FOUND' });
    });

    it('401s an unauthenticated caller', async () => {
      const id = await adaBooking();
      await request(app.getHttpServer()).get(`/api/bookings/${id}`).expect(401);
    });
  });

  describe('POST /api/bookings/:id/cancel', () => {
    it('409s INVALID_CANCEL_STATE on a PENDING booking, which T26 has not confirmed', async () => {
      const id = await adaBooking();

      const response = await request(app.getHttpServer())
        .post(`/api/bookings/${id}/cancel`)
        .set('Cookie', adaCookie)
        .expect(409);

      expect(response.body.error).toMatchObject({
        code: 'INVALID_CANCEL_STATE',
      });
    });

    it('flips a CONFIRMED booking to CANCELLED and answers 200 with the new state', async () => {
      const id = await adaBooking();
      world.confirm(id);

      const response = await request(app.getHttpServer())
        .post(`/api/bookings/${id}/cancel`)
        .set('Cookie', adaCookie)
        .expect(200);

      expect(response.body.data).toMatchObject({
        id,
        status: 'CANCELLED',
        totalCents: 60_000,
      });
    });

    it('403s when the booking belongs to someone else', async () => {
      const id = await adaBooking();
      world.confirm(id);

      const response = await request(app.getHttpServer())
        .post(`/api/bookings/${id}/cancel`)
        .set('Cookie', boCookie)
        .expect(403);

      expect(response.body.error).toMatchObject({ code: 'NOT_BOOKING_OWNER' });
    });

    it('404s a booking that does not exist', async () => {
      await request(app.getHttpServer())
        .post(`/api/bookings/${UNKNOWN_BOOKING}/cancel`)
        .set('Cookie', adaCookie)
        .expect(404);
    });

    it('401s an unauthenticated caller', async () => {
      const id = await adaBooking();
      await request(app.getHttpServer())
        .post(`/api/bookings/${id}/cancel`)
        .expect(401);
    });
  });

  describe('the OpenAPI contract', () => {
    it('documents the four booking paths and the Booking component', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/docs-json')
        .expect(200);

      const paths = Object.keys(response.body.paths);
      expect(paths).toEqual(
        expect.arrayContaining([
          '/api/bookings',
          '/api/bookings/{id}',
          '/api/bookings/{id}/cancel',
          '/api/bookings/quote',
        ]),
      );
      expect(response.body.components.schemas.Booking).toMatchObject({
        type: 'object',
        required: [
          'id',
          'reference',
          'status',
          'checkIn',
          'checkOut',
          'nights',
          'guestsCount',
          'currency',
          'subtotalCents',
          'feesCents',
          'totalCents',
          'hotel',
          'room',
          'createdAt',
        ],
      });
      expect(response.body.components.schemas.CreateBooking).toBeDefined();
      expect(response.body.components.schemas.BookingListData).toBeDefined();
    });

    it('keeps the booking routes authenticated in the document', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/docs-json')
        .expect(200);

      const paths = response.body.paths;
      expect(Object.keys(paths['/api/bookings'].post.responses)).toEqual(
        expect.arrayContaining(['201', '400', '401', '404', '409', '422']),
      );
      expect(Object.keys(paths['/api/bookings'].get.responses)).toEqual(
        expect.arrayContaining(['200', '401']),
      );
      expect(Object.keys(paths['/api/bookings/{id}'].get.responses)).toEqual(
        expect.arrayContaining(['200', '401', '403', '404']),
      );
      expect(
        Object.keys(paths['/api/bookings/{id}/cancel'].post.responses),
      ).toEqual(expect.arrayContaining(['200', '401', '403', '404', '409']));
    });
  });
});
