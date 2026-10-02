import { UsersService } from './users.service.js';
import type { UsersRepository } from './users.repository.js';

describe('UsersService', () => {
  it('returns the public profile without the hash', async () => {
    const stored = {
      id: 'u-1',
      email: 'ada@example.com',
      name: 'Ada',
      avatarUrl: null,
      passwordHash: 'hash',
      role: 'GUEST' as const,
      status: 'ACTIVE' as const,
      oauthProvider: null,
      oauthAccountId: null,
      createdAt: new Date(),
    };
    const repository = {
      findById: async () => stored,
    } as unknown as UsersRepository;
    const service = new UsersService(repository);

    await expect(service.findPublicById('u-1')).resolves.toEqual({
      id: 'u-1',
      email: 'ada@example.com',
      name: 'Ada',
      avatarUrl: null,
      role: 'GUEST',
    });
  });

  it('returns null for an unknown id', async () => {
    const repository = {
      findById: async () => null,
    } as unknown as UsersRepository;
    const service = new UsersService(repository);

    await expect(service.findPublicById('missing')).resolves.toBeNull();
  });
});
