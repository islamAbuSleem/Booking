import type { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { UsersRepository } from '../users/users.repository.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

function setup(options: {
  isPublic: boolean;
  request: Record<string, unknown>;
  users?: Partial<UsersRepository>;
  verify?: (token: string) => Promise<unknown>;
}): { guard: JwtAuthGuard; context: ExecutionContext } {
  const reflector = new Reflector();
  vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(
    options.isPublic as never,
  );
  const config = new ConfigService({
    JWT_SECRET: 'test-test-test-test-test-test-00',
    JWT_ISSUER: 'booking-api',
    JWT_AUDIENCE: 'booking-web',
  });
  const jwt = new JwtService();
  if (options.verify) {
    vi.spyOn(jwt, 'verifyAsync').mockImplementation(options.verify as never);
  }
  const repository = {
    findByEmail: async () => null,
    findById: async () => null,
    findByOAuth: async () => null,
    create: async () => {
      throw new Error('unused');
    },
    update: async () => {
      throw new Error('unused');
    },
    ...options.users,
  } as UsersRepository;
  const guard = new JwtAuthGuard(reflector, jwt, config, repository);
  const context = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => options.request }),
  } as unknown as ExecutionContext;
  return { guard, context };
}

describe('JwtAuthGuard', () => {
  it('lets a @Public() route through with no token (200)', async () => {
    const { guard, context } = setup({ isPublic: true, request: {} });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('rejects a missing token with 401 UNAUTHORIZED', async () => {
    const { guard, context } = setup({
      isPublic: false,
      request: { cookies: {}, headers: {} },
    });

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: 401,
      response: expect.objectContaining({ code: 'UNAUTHORIZED' }),
    });
  });

  it('rejects an invalid token with 401 and no token detail', async () => {
    const { guard, context } = setup({
      isPublic: false,
      request: { cookies: { access_token: 'bad.token.here' }, headers: {} },
      verify: async () => {
        throw new Error('invalid signature');
      },
    });

    const error = await guard
      .canActivate(context)
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({
      status: 401,
      response: expect.objectContaining({ code: 'UNAUTHORIZED' }),
    });
    expect(JSON.stringify(error)).not.toContain('bad.token.here');
  });

  it('attaches the fresh user on a valid cookie token', async () => {
    const stored = {
      id: 'u-1',
      email: 'ada@example.com',
      name: 'Ada',
      avatarUrl: null,
      passwordHash: 'hash',
      role: 'HOST' as const,
      status: 'ACTIVE' as const,
      oauthProvider: null,
      oauthAccountId: null,
      createdAt: new Date(),
    };
    const request: Record<string, unknown> = {
      cookies: { access_token: 'good' },
      headers: {},
    };
    const { guard, context } = setup({
      isPublic: false,
      request,
      users: { findById: async () => stored },
      verify: async () => ({ sub: 'u-1' }),
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request['user']).toEqual({
      id: 'u-1',
      email: 'ada@example.com',
      name: 'Ada',
      avatarUrl: null,
      role: 'HOST',
    });
  });

  it('also accepts an Authorization Bearer token', async () => {
    const stored = {
      id: 'u-2',
      email: 'bo@example.com',
      name: 'Bo',
      avatarUrl: null,
      passwordHash: null,
      role: 'GUEST' as const,
      oauthProvider: 'google',
      oauthAccountId: 'g-1',
      createdAt: new Date(),
    };
    const { guard, context } = setup({
      isPublic: false,
      request: { cookies: {}, headers: { authorization: 'Bearer good' } },
      users: { findById: async () => stored },
      verify: async () => ({ sub: 'u-2' }),
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});
