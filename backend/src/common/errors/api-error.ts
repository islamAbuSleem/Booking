import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * The machine-readable error codes the API is allowed to emit. Clients branch on these,
 * never on `message` (context/code-standards.md, "Error contract").
 *
 * Extend this union when a new module introduces a code; the exception filter and the
 * OpenAPI document are both generated from it, so a typo is a type error.
 */
export const ERROR_CODES = [
  'BAD_REQUEST',
  'VALIDATION_FAILED',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'UNPROCESSABLE',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
  // Module-specific. T14/T16 own these; more are added as modules land.
  'HOTEL_NOT_FOUND',
  'ROOM_NOT_FOUND',
  // T14 — auth. INVALID_CREDENTIALS covers both "no such email" and "wrong
  // password" on purpose, so the code never leaks which one failed.
  'INVALID_CREDENTIALS',
  'EMAIL_TAKEN',
  // T15 — OAuth profile has no usable email, provider error, or link failure.
  'OAUTH_FAILED',

  // T18 — availability and quote. ROOM_UNAVAILABLE is the ticket's code for a room that
  // cannot take the stay (sold out, blacked out, or too small for the party).
  'ROOM_UNAVAILABLE',
  // T18 — the room exists but has no `room_prices` row in the requested currency. A missing
  // price is an error, never a zero (context/architecture.md, "Pricing").
  'PRICE_UNAVAILABLE',

  // T19 — the caller already has this hotel in their favourites. It needs its own code
  // rather than a bare `CONFLICT` because the client branches on it: an optimistic toggle
  // reads this 409 as "already on, keep the filled heart" instead of as a failure to roll
  // back. `translatePrismaError`'s generic P2002 -> CONFLICT cannot express that.
  'FAVORITE_EXISTS',
  'OAUTH_LINK_CONFLICT',


] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiErrorBody {
  code: ErrorCode;
  message: string;
  details?: unknown;
}

/**
 * The only error type domain code should throw. Everything else that reaches the
 * exception filter is treated as internal and hidden from the client.
 */
export class ApiError extends HttpException {
  constructor(
    status: HttpStatus,
    code: ErrorCode,
    message: string,
    details?: unknown,
  ) {
    const body: ApiErrorBody =
      details === undefined ? { code, message } : { code, message, details };
    super(body, status);
  }
}

export function badRequest(message: string, details?: unknown): ApiError {
  return new ApiError(HttpStatus.BAD_REQUEST, 'BAD_REQUEST', message, details);
}

export function notFound(
  code: ErrorCode,
  message: string,
  details?: unknown,
): ApiError {
  return new ApiError(HttpStatus.NOT_FOUND, code, message, details);
}
