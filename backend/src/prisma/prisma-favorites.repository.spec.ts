import { Prisma } from '../generated/prisma/client.js';
import {
  isDuplicateFavoriteError,
  PrismaFavoritesRepository,
} from './prisma-favorites.repository.js';
import type { PrismaService } from './prisma.service.js';

/**
 * The one place a Prisma error code is read for favourites, so it is the one place worth
 * pinning: get it wrong in the loose direction and an unrelated database failure is reported
 * to the guest as "you have already favourited this hotel".
 */
function prismaError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('unique constraint failed', {
    code,
    clientVersion: '7.10.0',
  });
}

/** The repository over a `favorite.create` that answers or throws as told. */
function repositoryWhere(
  create: () => Promise<unknown>,
): PrismaFavoritesRepository {
  return new PrismaFavoritesRepository({
    favorite: { create },
  } as unknown as PrismaService);
}

describe('isDuplicateFavoriteError', () => {
  it('recognises P2002, the composite primary key on (userId, hotelId)', () => {
    expect(isDuplicateFavoriteError(prismaError('P2002'))).toBe(true);
  });

  it('does not treat a foreign key failure as a duplicate', () => {
    // P2003 means the hotel or the user is gone. Calling that "already a favourite" would
    // tell the guest to refresh a heart that will never render.
    expect(isDuplicateFavoriteError(prismaError('P2003'))).toBe(false);
  });

  it('does not treat a missing row as a duplicate', () => {
    expect(isDuplicateFavoriteError(prismaError('P2025'))).toBe(false);
  });

  it('does not treat a write conflict as a duplicate', () => {
    expect(isDuplicateFavoriteError(prismaError('P2034'))).toBe(false);
  });

  it('does not treat an ordinary failure as a duplicate', () => {
    expect(isDuplicateFavoriteError(new Error('connection reset'))).toBe(false);
    expect(isDuplicateFavoriteError(undefined)).toBe(false);
  });
});

describe('PrismaFavoritesRepository.create', () => {
  const ROW = { userId: 'u-1', hotelId: 'h-1', createdAt: new Date(0) };

  it('returns the row on a clean insert and null on a duplicate', async () => {
    expect(await repositoryWhere(async () => ROW).create('u-1', 'h-1')).toEqual(
      ROW,
    );
    expect(
      await repositoryWhere(async () => {
        throw prismaError('P2002');
      }).create('u-1', 'h-1'),
    ).toBeNull();
  });

  it('404s a hotel that vanished between the lookup and the insert', async () => {
    // The same condition the caller's lookup answers, so the wire answer does not
    // depend on which of the two round trips noticed.
    await expect(
      repositoryWhere(async () => {
        throw prismaError('P2003');
      }).create('u-1', 'h-1'),
    ).rejects.toMatchObject({
      status: 404,
      response: { code: 'HOTEL_NOT_FOUND' },
    });
  });

  it('rethrows every other failure untouched', async () => {
    const failure = prismaError('P2034');
    await expect(
      repositoryWhere(async () => {
        throw failure;
      }).create('u-1', 'h-1'),
    ).rejects.toBe(failure);
  });
});
