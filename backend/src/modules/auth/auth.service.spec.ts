import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service.js';
import { PasswordService } from './password.service.js';
import type { UsersRepository, UserRecord } from '../users/users.repository.js';

function record(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'ada@example.com',
    name: 'Ada',
    avatarUrl: null,
    passwordHash: null,
    role: 'GUEST',
    status: 'ACTIVE',
    oauthProvider: null,
    oauthAccountId: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

class FakeUsers implements UsersRepository {
  readonly created: UserRecord[] = [];
  byEmail = new Map<string, UserRecord>();
  byOAuth = new Map<string, UserRecord>();
  byId = new Map<string, UserRecord>();
  updated: { id: string; patch: unknown }[] = [];

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
    const created = record({
      id: `id-${this.created.length + 1}`,
      email: data.email,
      name: data.name,
      passwordHash: data.passwordHash ?? null,
      role: data.role,
      oauthProvider: data.oauthProvider ?? null,
      oauthAccountId: data.oauthAccountId ?? null,
      avatarUrl: data.avatarUrl ?? null,
    });
    this.created.push(created);
    this.byEmail.set(created.email, created);
    this.byId.set(created.id, created);
    if (created.oauthProvider && created.oauthAccountId) {
      this.byOAuth.set(
        `${created.oauthProvider}:${created.oauthAccountId}`,
        created,
      );
    }
    return created;
  }

  async update(id: string, patch: Partial<UserRecord>): Promise<UserRecord> {
    const current = this.byId.get(id);
    if (!current) throw new Error('missing');
    const next = { ...current, ...patch };
    this.updated.push({ id, patch });
    this.byEmail.set(next.email, next);
    this.byId.set(id, next);
    if (next.oauthProvider && next.oauthAccountId) {
      this.byOAuth.set(`${next.oauthProvider}:${next.oauthAccountId}`, next);
    }
    return next;
  }
}

function serviceWith(users: FakeUsers): {
  service: AuthService;
  passwords: PasswordService;
  jwt: JwtService;
} {
  const passwords = new PasswordService();
  const config = new ConfigService({
    JWT_SECRET: 'test-test-test-test-test-test-00',
    JWT_EXPIRES_IN: '7d',
    JWT_ISSUER: 'booking-api',
    JWT_AUDIENCE: 'booking-web',
  });
  const jwt = new JwtService();
  const service = new AuthService(users, passwords, jwt, config);
  return { service, passwords, jwt };
}

describe('AuthService.register', () => {
  it('promotes to HOST when wantsToHost is true, else GUEST', async () => {
    const hostUsers = new FakeUsers();
    const { service: hostService } = serviceWith(hostUsers);
    const guestUsers = new FakeUsers();
    const { service: guestService } = serviceWith(guestUsers);

    const host = await hostService.register({
      email: 'host@example.com',
      password: 'long-enough-1',
      name: 'Host',
      wantsToHost: true,
    });
    const guest = await guestService.register({
      email: 'guest@example.com',
      password: 'long-enough-1',
      name: 'Guest',
      wantsToHost: false,
    });

    expect(host.user.role).toBe('HOST');
    expect(guest.user.role).toBe('GUEST');
    expect(host.token.length).toBeGreaterThan(0);
    expect(host.user).not.toHaveProperty('passwordHash');
  });

  it('409s with EMAIL_TAKEN for a duplicate email', async () => {
    const users = new FakeUsers();
    users.byEmail.set('ada@example.com', record());
    const { service } = serviceWith(users);

    await expect(
      service.register({
        email: 'ada@example.com',
        password: 'long-enough-1',
        name: 'Ada',
        wantsToHost: false,
      }),
    ).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({ code: 'EMAIL_TAKEN' }),
    });
  });
});

describe('AuthService.login', () => {
  it('fails with INVALID_CREDENTIALS on a wrong password', async () => {
    const users = new FakeUsers();
    const { service, passwords } = serviceWith(users);
    const hash = await passwords.hash('correct-password-1');
    const stored = record({ passwordHash: hash });
    users.byEmail.set(stored.email, stored);
    users.byId.set(stored.id, stored);

    await expect(
      service.login({ email: stored.email, password: 'wrong-password-1' }),
    ).rejects.toMatchObject({
      status: 401,
      response: expect.objectContaining({ code: 'INVALID_CREDENTIALS' }),
    });
  });

  it('runs the dummy verify when the user is not found', async () => {
    const users = new FakeUsers();
    const { service, passwords } = serviceWith(users);
    const dummy = vi.spyOn(passwords, 'dummyVerify');

    await expect(
      service.login({ email: 'nobody@example.com', password: 'whatever-1' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'INVALID_CREDENTIALS' }),
    });
    expect(dummy).toHaveBeenCalledTimes(1);
  });

  it('runs the dummy verify for an OAuth-only account, with the same code', async () => {
    const users = new FakeUsers();
    const { service, passwords } = serviceWith(users);
    const stored = record({ passwordHash: null });
    users.byEmail.set(stored.email, stored);
    const dummy = vi.spyOn(passwords, 'dummyVerify');

    await expect(
      service.login({ email: stored.email, password: 'whatever-1' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'INVALID_CREDENTIALS' }),
    });
    expect(dummy).toHaveBeenCalledTimes(1);
  });

  it('succeeds with the right password and returns no hash', async () => {
    const users = new FakeUsers();
    const { service, passwords } = serviceWith(users);
    const hash = await passwords.hash('correct-password-1');
    const stored = record({ passwordHash: hash });
    users.byEmail.set(stored.email, stored);
    users.byId.set(stored.id, stored);

    const session = await service.login({
      email: stored.email,
      password: 'correct-password-1',
    });

    expect(session.user.id).toBe(stored.id);
    expect(session.user).not.toHaveProperty('passwordHash');
    expect(session.token.length).toBeGreaterThan(0);
  });
});

describe('AuthService.validateOAuthProfile', () => {
  it('returns the same account for a known provider tuple', async () => {
    const users = new FakeUsers();
    const { service } = serviceWith(users);
    const stored = record({
      oauthProvider: 'google',
      oauthAccountId: 'g-1',
    });
    users.byOAuth.set('google:g-1', stored);
    users.byId.set(stored.id, stored);

    const session = await service.validateOAuthProfile({
      provider: 'google',
      providerId: 'g-1',
      email: stored.email,
      name: 'Ada',
      avatarUrl: null,
    });

    expect(session.user.id).toBe(stored.id);
    expect(users.created).toHaveLength(0);
  });

  it('links on an existing email rather than duplicating the person', async () => {
    const users = new FakeUsers();
    const { service } = serviceWith(users);
    const stored = record({ passwordHash: 'hash' });
    users.byEmail.set(stored.email, stored);
    users.byId.set(stored.id, stored);

    const session = await service.validateOAuthProfile({
      provider: 'github',
      providerId: 'gh-9',
      email: stored.email,
      name: 'Ada',
      avatarUrl: 'https://img.test/a.png',
    });

    // One person stays one account: no new row, same id, tuple linked.
    expect(session.user.id).toBe(stored.id);
    expect(users.created).toHaveLength(0);
    expect(users.updated).toHaveLength(1);
    expect(users.updated[0]).toMatchObject({
      id: stored.id,
      patch: expect.objectContaining({
        oauthProvider: 'github',
        oauthAccountId: 'gh-9',
      }),
    });
  });

  it('creates a GUEST with no password for a new email', async () => {
    const users = new FakeUsers();
    const { service } = serviceWith(users);

    const session = await service.validateOAuthProfile({
      provider: 'google',
      providerId: 'g-new',
      email: 'new@example.com',
      name: 'New',
      avatarUrl: null,
    });

    expect(session.user.role).toBe('GUEST');
    expect(session.user.email).toBe('new@example.com');
    expect(users.created).toHaveLength(1);
  });

  it('409s instead of overwriting a link the account already has', async () => {
    const users = new FakeUsers();
    const { service } = serviceWith(users);
    const stored = record({
      oauthProvider: 'google',
      oauthAccountId: 'g-1',
    });
    users.byOAuth.set('google:g-1', stored);
    users.byId.set(stored.id, stored);
    users.byEmail.set(stored.email, stored);

    // Same verified email, second provider. The Google link must survive.
    await expect(
      service.validateOAuthProfile({
        provider: 'github',
        providerId: 'gh-9',
        email: stored.email,
        name: 'Ada',
        avatarUrl: null,
      }),
    ).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({ code: 'OAUTH_LINK_CONFLICT' }),
    });

    expect(users.updated).toHaveLength(0);
    expect(users.byOAuth.get('google:g-1')?.oauthProvider).toBe('google');
  });

  it('409s when the same provider reports a different account id', async () => {
    const users = new FakeUsers();
    const { service } = serviceWith(users);
    const stored = record({
      oauthProvider: 'google',
      oauthAccountId: 'g-1',
    });
    users.byOAuth.set('google:g-1', stored);
    users.byId.set(stored.id, stored);
    users.byEmail.set(stored.email, stored);

    await expect(
      service.validateOAuthProfile({
        provider: 'google',
        providerId: 'g-other',
        email: stored.email,
        name: 'Ada',
        avatarUrl: null,
      }),
    ).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({ code: 'OAUTH_LINK_CONFLICT' }),
    });

    expect(users.updated).toHaveLength(0);
  });

  it('completes a half-written link instead of refusing it', async () => {
    const users = new FakeUsers();
    const { service } = serviceWith(users);
    const stored = record({ oauthProvider: 'google', oauthAccountId: null });
    users.byId.set(stored.id, stored);
    users.byEmail.set(stored.email, stored);

    const session = await service.validateOAuthProfile({
      provider: 'google',
      providerId: 'g-1',
      email: stored.email,
      name: 'Ada',
      avatarUrl: null,
    });

    expect(session.user.id).toBe(stored.id);
    expect(users.updated).toHaveLength(1);
    expect(users.updated[0]).toMatchObject({
      patch: expect.objectContaining({
        oauthProvider: 'google',
        oauthAccountId: 'g-1',
      }),
    });
  });
});
