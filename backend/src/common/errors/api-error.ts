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
  // T19 — OAuth sign-in found an existing account it may not link to.
  'OAUTH_LINK_CONFLICT',

  // T20 — bookings. A booking that exists but belongs to a different guest is a 403, not a
  // 404, so the code states which rule failed rather than hiding the row's existence.
  'NOT_BOOKING_OWNER',
  'BOOKING_NOT_FOUND',
  // T20 — cancel is guarded to CONFIRMED only (D55): a PENDING hold cannot be cancelled
  // until T26/T27 confirm it, and a COMPLETED stay is past cancelling at all.
  'INVALID_CANCEL_STATE',
  // T21 — uploads. A `publicId` that does not start with the caller's own
  // `booking/hotels/{hostId}/` folder is a foreign asset: another host's upload, which
  // this host may neither attach nor delete. The folder-prefix rule is the DB-free check
  // the ticket specifies (D58); a listing-ownership check is T22's, not this one's.
  'UPLOAD_FOREIGN',
  // T22 — host listing management. Every host route is scoped to the caller's own
  // listings, so a hotel/room/blackout owned by someone else is a 403, not a 404: the
  // code states which rule failed rather than hiding the row's existence (same shape
  // as T20's NOT_BOOKING_OWNER).
  'NOT_HOTEL_OWNER',
  // T22 — a delete blocked by booking history. `Booking.room` is `onDelete: Restrict`, so a
  // hotel or room with any booking cannot be removed. It gets its own codes rather than a
  // bare `CONFLICT` because the client shows the reason, and because letting Prisma's P2003
  // reach the filter would answer a misleading 400 about a "missing referenced record".
  'HOTEL_HAS_BOOKINGS',
  'ROOM_HAS_BOOKINGS',

  // T24 — reviews. One review per completed stay: the unique `bookingId` is the
  // authority, and a second write for the same stay is a 409 the form branches on
  // (showing the existing review instead of failing silently).
  'ALREADY_REVIEWED',
  // T24 — the stay is not in a reviewable state. Only COMPLETED stays can be reviewed;
  // anything else (PENDING, CONFIRMED, CANCELLED) is a 400, not a silent no-op.
  'INVALID_REVIEW_STATE',

  // T25 — admin moderation and suspension.
  // `ADMIN_REQUIRED`: every `/api/admin/*` route, so the client distinguishes "sign in"
  // (401) from "signed in as the wrong role" (this) instead of rendering one login wall.
  'ADMIN_REQUIRED',
  // `ACCOUNT_SUSPENDED`: login and every JWT-authenticated route for a suspended
  // account. A distinct code — not INVALID_CREDENTIALS — because the fix is "contact
  // support", not "retry the password", and the client must not offer a retry loop.
  'ACCOUNT_SUSPENDED',
  // `ADMIN_SELF_SUSPEND`: an admin suspending their own account, refused as a 400.
  'ADMIN_SELF_SUSPEND',

  // T26 — payments.
  // `INVALID_PAYMENT_STATE`: only a PENDING booking can take an intent. Anything else
  // (CONFIRMED, COMPLETED, CANCELLED) is a 400 — the money for those states is settled
  // or gone, and an intent now would charge for nothing.
  'INVALID_PAYMENT_STATE',
  // `HOLD_EXPIRED`: the booking hold has expired, payment cannot proceed.
  'HOLD_EXPIRED',
  // `PAYMENT_NOT_FOUND`: no intent has been created for the booking yet.
  'PAYMENT_NOT_FOUND',
  // `STRIPE_NOT_CONFIGURED`: the route ran without `STRIPE_SECRET_KEY` (503). Keys are
  // optional at boot (T15/T21 precedent), so the failure names the missing key instead
  // of crashing on a null client.
  'STRIPE_NOT_CONFIGURED',
  // `PAYMENT_FAILED`: the provider answered something the contract cannot use.
  'PAYMENT_FAILED',

  // T27 — `INVALID_SIGNATURE`: the webhook signature did not verify. 400, and the
  // message says nothing about why: detail here is an oracle for forging.
  'INVALID_SIGNATURE',
  // T25 — admin moderation and suspension.
  // `ADMIN_REQUIRED`: every `/api/admin/*` route, so the client distinguishes "sign in"
  // (401) from "signed in as the wrong role" (this) instead of rendering one login wall.
  'ADMIN_REQUIRED',
  // `ACCOUNT_SUSPENDED`: login and every JWT-authenticated route for a suspended
  // account. A distinct code — not INVALID_CREDENTIALS — because the fix is "contact
  // support", not "retry the password", and the client must not offer a retry loop.
  'ACCOUNT_SUSPENDED',
  // `ADMIN_SELF_SUSPEND`: an admin suspending their own account, refused as a 400.
  'ADMIN_SELF_SUSPEND',
  // T35 — messaging. A thread that exists but names neither the guest nor the host is
  // a 403, not a 404, so the code states which rule failed rather than hiding the
  // row's existence (same shape as T20's NOT_BOOKING_OWNER).
  'NOT_THREAD_PARTICIPANT',
  'THREAD_NOT_FOUND',
  // T38 — refunds. `ALREADY_REFUNDED` is the D11 invariant made visible: a booking
  // with one `succeeded` refund row takes no further refund, so a retry after success
  // is a 409 rather than a second charge back to the guest.
  'ALREADY_REFUNDED',
  // T38 — the booking has no captured payment to refund against. A 400, not a 404:
  // the booking exists and is the caller's, it simply never took money.
  'NO_CAPTURED_PAYMENT',
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

export function forbidden(
  code: ErrorCode,
  message: string,
  details?: unknown,
): ApiError {
  return new ApiError(HttpStatus.FORBIDDEN, code, message, details);
}

export function notFound(
  code: ErrorCode,
  message: string,
  details?: unknown,
): ApiError {
  return new ApiError(HttpStatus.NOT_FOUND, code, message, details);
}

export function conflict(
  code: ErrorCode,
  message: string,
  details?: unknown,
): ApiError {
  return new ApiError(HttpStatus.CONFLICT, code, message, details);
}
