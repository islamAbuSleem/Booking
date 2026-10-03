import {
  CanActivate,
  ExecutionContext,
  type INestApplication,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureApp } from '../src/bootstrap.js';
import { USERS_REPOSITORY } from '../src/modules/users/users.repository.js';
import { HOST_REPOSITORY } from '../src/modules/host/host.repository.js';
import { StubHostRepository } from '../src/modules/host/host.stub.js';
import type {
  UserRecord,
  UsersRepository,
} from '../src/modules/users/users.repository.js';
import { PasswordService } from '../src/modules/auth/password.service.js';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * T14 + T15 over real HTTP, with only the database replaced.
 *
 * The repository is a stub but the hashing, the JWT, the cookie and the
 * guards are all real — this is the test that the `Max-Age` on the wire is
 * seconds derived from a milliseconds `res.cookie` call, that a missing
 * cookie is a 401 envelope, and that the OAuth callbacks set the same cookie
 * and redirect (with the provider guards mocked, per the ticket).
 */
class FakeUsers implements UsersRepository {
  private seq = 0;
  readonly byEmail = new Map<string, UserRecord>();
  readonly byId = new Map<string, UserRecord>();
  readonly byOAuth = new Map<string, UserRecord>();

  async findByEmail(email: string): Promise<UserRecord | null> {
    return this.byEmail.get(email) ?? null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    return this.byId.get(id) ?? null;
  }

  async findByOAuth(
    provider: string,
    accountId: string,
  ): Promise<UserRecord | null> {
    return this.byOAuth.get(`${provider}:${accountId}`) ?? null;
  }

  async create(data: {
    email: string;
    name: string;
    passwordHash?: string | null;
    role: 'GUEST' | 'HOST' | 'ADMIN';
    oauthProvider?: string | null;
    oauthAccountId?: string | null;
    avatarUrl?: string | null;
  }): Promise<UserRecord> {
    this.seq += 1;
    const created: UserRecord = {
      id: `00000000-0000-4000-8000-${String(this.seq).padStart(12, '0')}`,
      email: data.email,
      name: data.name,
      avatarUrl: data.avatarUrl ?? null,
      passwordHash: data.passwordHash ?? null,
      role: data.role,
      oauthProvider: data.oauthProvider ?? null,
      oauthAccountId: data.oauthAccountId ?? null,
      createdAt: new Date(),
    };
    this.byEmail.set(created.email, created);
    this.byId.set(created.id, created);
    return created;
  }

  async update(id: string, patch: Partial<UserRecord>): Promise<UserRecord> {
    const current = this.byId.get(id);
    if (!current) throw new Error('missing');
    const next = { ...current, ...patch };
    this.byEmail.set(next.email, next);
    this.byId.set(id, next);
    return next;
  }
}

/** Stands in for Passport: pretends the provider returned a session. */
class MockOAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    context.switchToHttp().getRequest().user = {
      user: {
        id: '00000000-0000-4000-8000-000000000099',
        email: 'oauth@example.com',
        name: 'OAuth',
        avatarUrl: null,
        role: 'GUEST',
      },
      token: 'oauth-session-token',
    };
    return true;
  }
}

describe('Auth API (e2e)', () => {
  let app: INestApplication;
  let users: FakeUsers;

  beforeAll(async () => {
    users = new FakeUsers();
    const passwords = new PasswordService();
    const seeded = await passwords.hash('correct-password-1');
    const record: UserRecord = {
      id: '11111111-1111-4111-8111-111111111111',
      email: 'ada@example.com',
      name: 'Ada',
      avatarUrl: null,
      passwordHash: seeded,
      role: 'GUEST',
      status: 'ACTIVE',
      oauthProvider: null,
      oauthAccountId: null,
      createdAt: new Date(),
    };
    users.byEmail.set(record.email, record);
    users.byId.set(record.id, record);

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
      .overrideGuard(AuthGuard('google'))
      .useValue(new MockOAuthGuard())
      .overrideGuard(AuthGuard('github'))
      .useValue(new MockOAuthGuard())
      .compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('registers a HOST and sets the session cookie', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: 'host@example.com',
        password: 'long-enough-1',
        name: 'Host',
        wantsToHost: true,
      })
      .expect(201);

    expect(response.body).toMatchObject({
      success: true,
      data: { user: { email: 'host@example.com', role: 'HOST' } },
    });
    expect(response.body.data.token).toEqual(expect.any(String));
    expect(response.body.data.user).not.toHaveProperty('passwordHash');
    const setCookie = response.headers['set-cookie'] as unknown as string[];
    expect(setCookie.join(';')).toContain('access_token=');
    expect(setCookie.join(';')).toContain('HttpOnly');
    // `res.cookie` takes milliseconds; Express sends `Max-Age` in seconds.
    // 7 days = 604800s. Had seconds been passed to `res.cookie`, the wire
    // value would be 1000x larger.
    expect(setCookie.join(';')).toContain('Max-Age=604800');
  });

  it('rejects a wrong password with the same code as a missing email', async () => {
    const wrong = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'ada@example.com', password: 'wrong-password-1' })
      .expect(401);
    const missing = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'wrong-password-1' })
      .expect(401);

    expect(wrong.body).toMatchObject({
      success: false,
      error: { code: 'INVALID_CREDENTIALS' },
    });
    expect(missing.body).toMatchObject({
      success: false,
      error: { code: 'INVALID_CREDENTIALS' },
    });
  });

  it('logs in, reads me with the cookie, and logs out to 204', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'ada@example.com', password: 'correct-password-1' })
      .expect(200);
    const cookie = (login.headers['set-cookie'] as unknown as string[])[0];

    const me = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', cookie)
      .expect(200);
    expect(me.body).toEqual({
      success: true,
      data: {
        user: expect.objectContaining({ email: 'ada@example.com' }),
      },
    });

    await request(app.getHttpServer()).get('/api/auth/me').expect(401);

    const logout = await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Cookie', cookie)
      .expect(204);
    expect(logout.text).toBe('');
  });

  it('issues the same cookie on the OAuth callbacks and redirects', async () => {
    for (const provider of ['google', 'github']) {
      const response = await request(app.getHttpServer())
        .get(`/api/auth/${provider}/callback`)
        .expect(302);

      const setCookie = response.headers['set-cookie'] as unknown as string[];
      expect(setCookie.join(';')).toContain('access_token=oauth-session-token');
      expect(response.headers['location']).toEqual(expect.any(String));
    }
  });
});
