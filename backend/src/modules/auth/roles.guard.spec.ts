import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../../common/decorators/roles.decorator.js';
import type { PublicUser } from '../users/dto/user.dto.js';
import { RolesGuard } from './roles.guard.js';

function setup(options: {
  roles?: ('GUEST' | 'HOST' | 'ADMIN')[];
  user?: PublicUser;
}): { guard: RolesGuard; context: ExecutionContext } {
  const reflector = new Reflector();
  vi.spyOn(reflector, 'getAllAndOverride').mockImplementation(
    (key: unknown) => {
      if (key === ROLES_KEY) return options.roles as never;
      return undefined as never;
    },
  );
  const guard = new RolesGuard(reflector);
  const context = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user: options.user }) }),
  } as unknown as ExecutionContext;
  return { guard, context };
}

function userWith(role: PublicUser['role']): PublicUser {
  return {
    id: 'u-1',
    email: 'ada@example.com',
    name: 'Ada',
    avatarUrl: null,
    role,
  };
}

describe('RolesGuard', () => {
  it('lets any authenticated role through when no @Roles() is set', () => {
    const { guard, context } = setup({ user: userWith('GUEST') });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('lets a matching role through (200)', () => {
    const { guard, context } = setup({
      roles: ['HOST'],
      user: userWith('HOST'),
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects a wrong role with 403 FORBIDDEN', () => {
    const { guard, context } = setup({
      roles: ['HOST'],
      user: userWith('GUEST'),
    });

    expect(() => guard.canActivate(context)).toThrowError(
      expect.objectContaining({
        status: 403,
      }),
    );
    try {
      guard.canActivate(context);
    } catch (caught) {
      const response = (caught as { getResponse(): unknown }).getResponse();
      expect(response).toMatchObject({ code: 'FORBIDDEN' });
    }
  });

  it('rejects an ADMIN-only route for a HOST with 403', () => {
    const { guard, context } = setup({
      roles: ['ADMIN'],
      user: userWith('HOST'),
    });

    try {
      guard.canActivate(context);
      expect.unreachable();
    } catch (caught) {
      expect(caught).toMatchObject({ status: 403 });
    }
  });

  it('rejects with 401 when there is no user at all', () => {
    const { guard, context } = setup({ roles: ['GUEST'] });

    try {
      guard.canActivate(context);
      expect.unreachable();
    } catch (caught) {
      expect(caught).toMatchObject({ status: 401 });
    }
  });
});
