import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/bootstrap.js';
import { PasswordService } from '../src/modules/auth/password.service.js';
import {
  USERS_REPOSITORY,
  type UserRecord,
  type UsersRepository,
} from '../src/modules/users/users.repository.js';
import {
  FAVORITES_REPOSITORY,
  type FavoriteRecord,
  type FavoritesRepository,
} from '../src/prisma/favorites.repository.js';
import { HOST_REPOSITORY } from '../src/modules/host/host.repository.js';
import { StubHostRepository } from '../src/modules/host/host.stub.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * T19 over real HTTP, with only the database replaced.
 *
 * The repository is a stub but the guard, the pipes, the envelope and the status codes are
 * all real. That is the point of this file: the ticket's promises are all about the wire —
 * a 409 a client can branch on, a 204 that stays a 204 on the second click, and a 401 for an
 * anonymous caller — and none of them are visible from a service-level test.
 */

/** One seeded hotel, and every other id is unknown. */
const HOTEL_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const UNKNOWN_HOTEL_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3302';
const PASSWORD = 'correct-password-1';

/** Fixed so two rows for the same pair are byte-identical, which the toggle test compares. */
const FAVORITED_AT = new Date('2026-05-20T10:00:00.000Z');

class StubFavorites implements FavoritesRepository {
  readonly rows = new Map<string, FavoriteRecord>();

  async hotelExists(hotelId: string): Promise<boolean> {
    return hotelId === HOTEL_ID;
  }

  async create(
    userId: string,
    hotelId: string,
  ): Promise<FavoriteRecord | null> {
    const key = `${userId}:${hotelId}`;
    if (this.rows.has(key)) return null;
    const record: FavoriteRecord = {
      userId,
      hotelId,
      createdAt: FAVORITED_AT,
    };
    this.rows.set(key, record);
    return record;
  }

  async remove(userId: string, hotelId: string): Promise<void> {
    this.rows.delete(`${userId}:${hotelId}`);
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

describe('Favorites API (e2e)', () => {
  let app: INestApplication;
  let favorites: StubFavorites;
  let cookie: string;

  beforeAll(async () => {
    favorites = new StubFavorites();
    const passwords = new PasswordService();
    const ada = await seededUser(
      passwords,
      '11111111-1111-4111-8111-111111111111',
      'ada@example.com',
    );
    const bo = await seededUser(
      passwords,
      '22222222-2222-4222-8222-222222222222',
      'bo@example.com',
    );
    const users = new StubUsers(
      new Map([
        [ada.email, ada],
        [bo.email, bo],
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
      .overrideProvider(FAVORITES_REPOSITORY)
      .useValue(favorites)
      .compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    // A real login, so the cookie below is a real JWT and the guard does real work.
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: ada.email, password: PASSWORD })
      .expect(200);
    cookie = (login.headers['set-cookie'] as unknown as string[])[0] as string;
  });

  afterAll(async () => {
    await app.close();
  });

  // The pair is the key, so state from one test would make the next one a 409 or a no-op.
  // Each test sets up the state it is about.
  beforeEach(() => {
    favorites.rows.clear();
  });

  describe('POST /api/favorites', () => {
    it('creates the row and answers 201 with it inside the envelope', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/favorites')
        .set('Cookie', cookie)
        .send({ hotelId: HOTEL_ID })
        .expect(201);

      expect(response.body).toEqual({
        success: true,
        data: {
          userId: '11111111-1111-4111-8111-111111111111',
          hotelId: HOTEL_ID,
          createdAt: expect.stringMatching(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
          ),
        },
      });
    });

    it('409s with FAVORITE_EXISTS on the second POST, not a generic CONFLICT', async () => {
      // The frontend toggle branches on the code, so a bare CONFLICT is not enough.
      await request(app.getHttpServer())
        .post('/api/favorites')
        .set('Cookie', cookie)
        .send({ hotelId: HOTEL_ID })
        .expect(201);

      const response = await request(app.getHttpServer())
        .post('/api/favorites')
        .set('Cookie', cookie)
        .send({ hotelId: HOTEL_ID })
        .expect(409);

      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'FAVORITE_EXISTS',
          message: 'This hotel is already a favourite',
        },
      });
      expect(favorites.rows.size).toBe(1);
    });

    it('404s HOTEL_NOT_FOUND for a hotel that does not exist', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/favorites')
        .set('Cookie', cookie)
        .send({ hotelId: UNKNOWN_HOTEL_ID })
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        error: { code: 'HOTEL_NOT_FOUND', message: 'Hotel not found' },
      });
    });

    it('400s a body whose hotelId is not a uuid', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/favorites')
        .set('Cookie', cookie)
        .send({ hotelId: 'the-larkspur-hotel' })
        .expect(400);

      expect(response.body.error).toMatchObject({
        code: 'VALIDATION_FAILED',
        details: [expect.objectContaining({ path: 'hotelId' })],
      });
    });

    it('ignores a userId in the body: the row belongs to the token', async () => {
      // The body claims to be somebody else. The schema strips `userId`, the controller reads
      // the JWT subject, and the row is Ada's — not Bo's, and not the one in the body.
      const response = await request(app.getHttpServer())
        .post('/api/favorites')
        .set('Cookie', cookie)
        .send({
          hotelId: HOTEL_ID,
          userId: '22222222-2222-4222-8222-222222222222',
        })
        .expect(201);

      expect(response.body.data.userId).toBe(
        '11111111-1111-4111-8111-111111111111',
      );
      expect(
        favorites.rows.has('22222222-2222-4222-8222-222222222222:' + HOTEL_ID),
      ).toBe(false);
    });

    it('401s an unauthenticated caller', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/favorites')
        .send({ hotelId: HOTEL_ID })
        .expect(401);

      expect(response.body).toEqual({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
    });
  });

  describe('DELETE /api/favorites/:hotelId', () => {
    it('answers 204 with no body when it removes the row', async () => {
      await request(app.getHttpServer())
        .post('/api/favorites')
        .set('Cookie', cookie)
        .send({ hotelId: HOTEL_ID })
        .expect(201);

      const response = await request(app.getHttpServer())
        .delete(`/api/favorites/${HOTEL_ID}`)
        .set('Cookie', cookie)
        .expect(204);

      expect(response.text).toBe('');
      expect(favorites.rows.size).toBe(0);
    });

    it('answers 204 again when there was nothing to remove', async () => {
      // The idempotency claim, on the wire: the second click of a toggle is not an error.
      await request(app.getHttpServer())
        .delete(`/api/favorites/${HOTEL_ID}`)
        .set('Cookie', cookie)
        .expect(204);

      const response = await request(app.getHttpServer())
        .delete(`/api/favorites/${HOTEL_ID}`)
        .set('Cookie', cookie)
        .expect(204);

      expect(response.text).toBe('');
    });

    it('answers 204 for a hotel id that never existed', async () => {
      await request(app.getHttpServer())
        .delete(`/api/favorites/${UNKNOWN_HOTEL_ID}`)
        .set('Cookie', cookie)
        .expect(204);
    });

    it('400s a hotelId that is not a uuid', async () => {
      const response = await request(app.getHttpServer())
        .delete('/api/favorites/the-larkspur-hotel')
        .set('Cookie', cookie)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('401s an unauthenticated caller', async () => {
      const response = await request(app.getHttpServer())
        .delete(`/api/favorites/${HOTEL_ID}`)
        .expect(401);

      expect(response.body).toEqual({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
    });

    it('leaves another guest’s favourite of the same hotel alone', async () => {
      // Bo favourites it, Ada un-favourites it, and Bo's row survives: the row is keyed by
      // the pair and `userId` is the JWT subject, so there is nothing to authorise.
      const boLogin = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'bo@example.com', password: PASSWORD })
        .expect(200);
      const boCookie = (
        boLogin.headers['set-cookie'] as unknown as string[]
      )[0] as string;

      await request(app.getHttpServer())
        .post('/api/favorites')
        .set('Cookie', boCookie)
        .send({ hotelId: HOTEL_ID })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/api/favorites/${HOTEL_ID}`)
        .set('Cookie', cookie)
        .expect(204);

      expect([...favorites.rows.keys()]).toEqual([
        `22222222-2222-4222-8222-222222222222:${HOTEL_ID}`,
      ]);
    });
  });

  it('add → remove → add returns to the original state over HTTP', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/favorites')
      .set('Cookie', cookie)
      .send({ hotelId: HOTEL_ID })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/api/favorites/${HOTEL_ID}`)
      .set('Cookie', cookie)
      .expect(204);
    await request(app.getHttpServer())
      .delete(`/api/favorites/${HOTEL_ID}`)
      .set('Cookie', cookie)
      .expect(204);
    const again = await request(app.getHttpServer())
      .post('/api/favorites')
      .set('Cookie', cookie)
      .send({ hotelId: HOTEL_ID })
      .expect(201);

    expect(again.body.data).toEqual(created.body.data);
    expect(favorites.rows.size).toBe(1);
  });

  describe('the OpenAPI contract', () => {
    it('documents both favourites paths and the Favorite component', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/docs-json')
        .expect(200);

      expect(Object.keys(response.body.paths)).toEqual(
        expect.arrayContaining(['/api/favorites', '/api/favorites/{hotelId}']),
      );
      expect(response.body.components.schemas.Favorite).toMatchObject({
        type: 'object',
        required: ['userId', 'hotelId', 'createdAt'],
      });
      expect(
        response.body.paths['/api/favorites/{hotelId}'].delete.responses['204'],
      ).toBeDefined();
    });

    it('keeps the endpoints authenticated in the document', async () => {
      // Neither route is `@Public()`, so a reader of the generated types sees a 401 on both
      // and knows to send a session.
      const response = await request(app.getHttpServer())
        .get('/api/docs-json')
        .expect(200);

      const paths = response.body.paths;
      expect(Object.keys(paths['/api/favorites'].post.responses)).toEqual(
        expect.arrayContaining(['201', '400', '401', '404', '409']),
      );
      expect(
        Object.keys(paths['/api/favorites/{hotelId}'].delete.responses),
      ).toEqual(expect.arrayContaining(['204', '400', '401']));
    });
  });
});
