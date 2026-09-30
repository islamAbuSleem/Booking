import { Prisma } from '../../generated/prisma/client.js';

/**
 * T13 — Prisma error codes, translated once, at the boundary.
 *
 * Codes are unchanged in Prisma 7 (context/library-docs.md):
 *   P2002 unique constraint, P2003 foreign key, P2025 record not found,
 *   P2034 write conflict / serialization failure.
 *
 * Nothing from the original error object — message, `meta`, or stack — reaches the
 * client. Only the status and the generic message.
 */

export interface TranslatedPrismaError {
  status: number;
  code: string;
  message: string;
}

const KNOWN: Record<string, Omit<TranslatedPrismaError, 'status'>> = {
  P2002: { code: 'CONFLICT', message: 'That value is already taken' },
  P2003: { code: 'BAD_REQUEST', message: 'Referenced record does not exist' },
  P2025: { code: 'NOT_FOUND', message: 'Record not found' },
  P2034: {
    code: 'CONFLICT',
    message: 'The write conflicted with a concurrent request',
  },
};

const STATUS: Record<string, number> = {
  P2002: 409,
  P2003: 400,
  P2025: 404,
  P2034: 409,
};

export function isPrismaKnownError(
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError;
}

export function translatePrismaError(
  error: unknown,
): TranslatedPrismaError | null {
  if (!isPrismaKnownError(error)) return null;
  const known = KNOWN[error.code];
  if (!known) return null;
  return { status: STATUS[error.code] ?? 500, ...known };
}

/**
 * Retryable-transaction detection, used by T18's availability math.
 *
 * `P2034` alone is not enough. Prisma's own guidance is to also match the Postgres
 * `sqlState` on `error.cause`, and their two examples disagree about which signal is
 * canonical — `P2034` is not guaranteed to fire for every `40001`. Match both. This is
 * the one place a wrong condition silently allows an oversell.
 */
export function isRetryableWriteConflict(error: unknown): boolean {
  if (isPrismaKnownError(error) && error.code === 'P2034') return true;

  // `cause` is read off any object, not only an `Error`: the driver sometimes wraps the
  // Postgres error in a plain object, and missing that would silently allow an oversell.
  const source = hasCause(error) ? error.cause : error;
  if (typeof source !== 'object' || source === null || !('sqlState' in source))
    return false;
  const sqlState = (source as { sqlState?: unknown }).sqlState;
  // 40001 serialization_failure, 40P01 deadlock_detected. Both are retryable.
  return sqlState === '40001' || sqlState === '40P01';
}

function hasCause(error: unknown): error is { cause: unknown } {
  return typeof error === 'object' && error !== null && 'cause' in error;
}
