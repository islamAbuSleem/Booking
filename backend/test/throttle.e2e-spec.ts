import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/bootstrap.js';
import {
  USERS_REPOSITORY,
  type UserRecord,
  type UsersRepository,
} from '../src/modules/users/users.repository.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * T29 over real HTTP, with only the database replaced.
 *
 * The throttle guard is wired in `configureApp` like the JWT and roles guards, so it
 * runs here exactly as in production — with a fresh in-memory store per suite, which
 * is what makes the sixth rapid registration deterministically the blocked one. The
 * ticket's verify clause lives here: the 429 arrives as the standard envelope with
 * `code: "RATE_LIMITED"` (the exception filter already maps 429) and a `Retry-After`
 * header (the guard sets it), not as Nest's default body.
 */

class OpenUsers implements UsersRepository {
  private seq = 0;

  async findByEmail(): Promise<UserRecord | null> {
    return null;
  }

  async findById(): Promise<UserRecord | null> {
    return null;
  }

  async findByOAuth(): Promise<UserRecord | null> {
    return null;
  }

  async create(data: {
    email: string;
    name: string;
    passwordHash?: string | null;
    role: UserRecord['role'];
  }): Promise<UserRecord> {
    this.seq += 1;
    return {
      id: `00000000-0000-4000-8000-00000000${String(this.seq).padStart(4, '0')}`,
      email: data.email,
      name: data.name,
      avatarUrl: null,
      passwordHash: data.passwordHash ?? null,
      role: data.role,
      status: 'ACTIVE',
      oauthProvider: null,
      oauthAccountId: null,
      createdAt: new Date(),
    };
  }

  async update(): Promise<UserRecord> {
    throw new Error('unused');
  }
}

describe('Rate limiting (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        $queryRaw: () => Promise.resolve([{ ok: 1 }]),
        $connect: () => Promise.resolve(),
      })
      .overrideProvider(USERS_REPOSITORY)
      .useValue(new OpenUsers())
      .compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers the sixth rapid registration with a 429 envelope and Retry-After', async () => {
    // Five allowed per 15 minutes per IP (the auth tier): distinct emails, so every
    // attempt before the sixth is a genuine 201 rather than a 409 that never exercises
    // the happy path.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email: `throttle-${attempt}@example.com`, password: 'long-enough-1', name: 'Throttle' })
        .expect(201);
    }

    const blocked = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: 'throttle-5@example.com', password: 'long-enough-1', name: 'Throttle' })
      .expect(429);

    expect(blocked.body).toEqual({
      success: false,
      error: { code: 'RATE_LIMITED', message: expect.any(String) },
    });
    expect(blocked.headers['retry-after']).toMatch(/^\d+$/);
  });

  it('does not throttle the health check: monitors poll it constantly', async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await request(app.getHttpServer()).get('/api/health').expect(200);
    }
  });
});
