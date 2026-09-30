import { ApiError } from './api-error.js';
import {
  isRetryableWriteConflict,
  translatePrismaError,
} from './prisma-error.js';
import { Prisma } from '../../generated/prisma/client.js';

function knownError(code: string): unknown {
  return new Prisma.PrismaClientKnownRequestError(
    'internal detail that must not leak',
    {
      code,
      clientVersion: '7.10.0',
    },
  );
}

describe('translatePrismaError', () => {
  it('maps P2002 (unique) to 409', () => {
    expect(translatePrismaError(knownError('P2002'))).toEqual({
      status: 409,
      code: 'CONFLICT',
      message: 'That value is already taken',
    });
  });

  it('maps P2003 (foreign key) to 400', () => {
    expect(translatePrismaError(knownError('P2003'))).toEqual({
      status: 400,
      code: 'BAD_REQUEST',
      message: 'Referenced record does not exist',
    });
  });

  it('maps P2025 (not found) to 404', () => {
    expect(translatePrismaError(knownError('P2025'))).toEqual({
      status: 404,
      code: 'NOT_FOUND',
      message: 'Record not found',
    });
  });

  it('maps P2034 (write conflict) to 409', () => {
    expect(translatePrismaError(knownError('P2034'))).toEqual({
      status: 409,
      code: 'CONFLICT',
      message: 'The write conflicted with a concurrent request',
    });
  });

  it('returns null for an unrecognised code, so it falls through to a generic 500', () => {
    expect(translatePrismaError(knownError('P9999'))).toBeNull();
  });

  it('returns null for something that is not a Prisma error at all', () => {
    expect(translatePrismaError(new Error('boom'))).toBeNull();
    expect(translatePrismaError('boom')).toBeNull();
  });
});

describe('isRetryableWriteConflict', () => {
  it('retries on P2034', () => {
    expect(isRetryableWriteConflict(knownError('P2034'))).toBe(true);
  });

  it('retries on sqlState 40001 on error.cause, because P2034 is not guaranteed to fire', () => {
    const error = new Error('write conflict', { cause: { sqlState: '40001' } });

    expect(isRetryableWriteConflict(error)).toBe(true);
  });

  it('retries on sqlState 40P01 (deadlock)', () => {
    expect(isRetryableWriteConflict({ cause: { sqlState: '40P01' } })).toBe(
      true,
    );
  });

  it('does not retry an unrelated error', () => {
    expect(isRetryableWriteConflict(new Error('unique violation'))).toBe(false);
    expect(isRetryableWriteConflict({ cause: { sqlState: '23505' } })).toBe(
      false,
    );
    expect(isRetryableWriteConflict(knownError('P2002'))).toBe(false);
  });
});

describe('ApiError', () => {
  it('puts a stable code and message on the wire, not the internal detail', () => {
    const error = new ApiError(404, 'HOTEL_NOT_FOUND', 'Hotel not found');

    expect(error.getResponse()).toEqual({
      code: 'HOTEL_NOT_FOUND',
      message: 'Hotel not found',
    });
  });

  it('includes details only when there are any', () => {
    const withDetails = new ApiError(400, 'VALIDATION_FAILED', 'Bad', [
      { path: 'page' },
    ]);
    const withoutDetails = new ApiError(400, 'BAD_REQUEST', 'Bad');

    expect(withDetails.getResponse()).toMatchObject({
      details: [{ path: 'page' }],
    });
    expect(withoutDetails.getResponse()).not.toHaveProperty('details');
  });
});
