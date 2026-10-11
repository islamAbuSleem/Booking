import { z } from 'zod';
import { errorEnvelopeSchema } from '../common/envelope.js';
import { DTO_SCHEMAS as AVAILABILITY_DTO_SCHEMAS } from '../modules/bookings/dto/availability.dto.js';
import { DTO_SCHEMAS as BOOKINGS_DTO_SCHEMAS } from '../modules/bookings/dto/booking.dto.js';
import { DTO_SCHEMAS as AUTH_DTO_SCHEMAS } from '../modules/auth/dto/auth.dto.js';
import { DTO_SCHEMAS as FAVORITES_DTO_SCHEMAS } from '../modules/favorites/dto/favorite.dto.js';
import { DTO_SCHEMAS } from '../modules/hotels/dto/hotel.dto.js';
import { DTO_SCHEMAS as HOST_DTO_SCHEMAS } from '../modules/host/dto/host.api.js';
import { DTO_SCHEMAS as REVIEWS_DTO_SCHEMAS } from '../modules/reviews/dto/review.dto.js';
import { DTO_SCHEMAS as ADMIN_DTO_SCHEMAS } from '../modules/admin/dto/admin.dto.js';
import { DTO_SCHEMAS as PAYMENTS_DTO_SCHEMAS } from '../modules/payments/dto/payment.dto.js';
import { DTO_SCHEMAS as CANCELLATIONS_DTO_SCHEMAS } from '../modules/cancellations/dto/cancellation.dto.js';
import { DTO_SCHEMAS as THREADS_DTO_SCHEMAS } from '../modules/threads/dto/thread.dto.js';
import { DTO_SCHEMAS as REFUNDS_DTO_SCHEMAS } from '../modules/refunds/dto/refund.dto.js';
import { DTO_SCHEMAS as UPLOADS_DTO_SCHEMAS } from '../modules/uploads/dto/uploads.dto.js';
import { DTO_SCHEMAS as USER_DTO_SCHEMAS } from '../modules/users/dto/user.dto.js';

/**
 * T13a — every Zod schema that becomes a named OpenAPI component.
 *
 * One list, in one place. A schema that is not here is documented inline or not at all,
 * which is how a contract gap becomes visible.
 *
 * `ApiErrorEnvelope` is included because the error side of the envelope is part of the
 * contract even though no success route returns it.
 */
export const CONTRACT_SCHEMAS = {
  ApiErrorEnvelope: errorEnvelopeSchema,
  ...DTO_SCHEMAS,
  ...USER_DTO_SCHEMAS,
  ...AUTH_DTO_SCHEMAS,
  ...AVAILABILITY_DTO_SCHEMAS,
  ...FAVORITES_DTO_SCHEMAS,
  // T20 — the booking components. The module-specific error codes (NOT_BOOKING_OWNER,
  // BOOKING_NOT_FOUND, INVALID_CANCEL_STATE, plus T18's ROOM_UNAVAILABLE and
  // PRICE_UNAVAILABLE) live in `ERROR_CODES` in `common/errors/api-error.ts`, and are
  // deliberately NOT a Zod union: `errorBodySchema.code` is `z.string()` (D54), so the
  // generated frontend types branch on an untyped literal. Making it a typed union is its
  // own ticket.
  ...BOOKINGS_DTO_SCHEMAS,
  // T21 — the upload components. T21's new code `UPLOAD_FOREIGN` joins `ERROR_CODES` in
  // `common/errors/api-error.ts` the same way; the `ApiErrorEnvelope` code stays an
  // untyped `z.string()` (D54). `AttachUploadEnvelope` wraps the T16 `HotelImage`
  // component, not a copy of it.
  ...UPLOADS_DTO_SCHEMAS,
  // T22 — host listing management components.
  ...HOST_DTO_SCHEMAS,
  // T24 — reviews. `ALREADY_REVIEWED` and `INVALID_REVIEW_STATE` join `ERROR_CODES`
  // the same way; the `ApiErrorEnvelope` code stays an untyped `z.string()` (D54).
  ...REVIEWS_DTO_SCHEMAS,
  // T25 — admin console components. `ADMIN_REQUIRED`, `ACCOUNT_SUSPENDED` and
  // `ADMIN_SELF_SUSPEND` join `ERROR_CODES` the same way.
  ...ADMIN_DTO_SCHEMAS,
  // T26 - payment intent and payment components.
  ...PAYMENTS_DTO_SCHEMAS,
  // T35 — messaging threads and messages. `NOT_THREAD_PARTICIPANT` and
  // `THREAD_NOT_FOUND` join `ERROR_CODES` the same way.
  ...THREADS_DTO_SCHEMAS,
  // T37 — cancellation policy and quote components.
  ...CANCELLATIONS_DTO_SCHEMAS,
  // T38 — refund ledger components. `ALREADY_REFUNDED` and `NO_CAPTURED_PAYMENT` join
  // `ERROR_CODES` the same way.
  ...REFUNDS_DTO_SCHEMAS,
} as const satisfies Record<string, z.ZodType>;

export type ContractSchemaName = keyof typeof CONTRACT_SCHEMAS;

let registered = false;

/**
 * Zod's global registry turns a schema into a named `$ref`. Registration is global
 * mutable state, so it is done once, on first use, and never from a decorator.
 */
export function registerContractSchemas(): void {
  if (registered) return;
  for (const [name, schema] of Object.entries(CONTRACT_SCHEMAS)) {
    z.globalRegistry.add(schema, { id: name });
  }
  registered = true;
}
