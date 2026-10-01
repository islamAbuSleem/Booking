import { Prisma } from '../generated/prisma/client.js';
import { isDuplicateFavoriteError } from './prisma-favorites.repository.js';

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
