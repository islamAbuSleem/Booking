import { z } from 'zod';
import { envelopeSchema } from '../../../common/envelope.js';
import { bookingSchema } from '../../bookings/dto/booking.dto.js';

/**
 * T38 — the refunds contract, as Zod schemas.
 *
 * The backend owns the API shape. `openapi.json` is generated from these schemas, and
 * the frontend's types are generated from that document.
 *
 * Things a generated frontend type must know:
 *   * `POST /cancel` answers `{ booking, refund }`: the booking in its new CANCELLED
 *     state and the refund attempt the cancellation created. `refund` is **null** when
 *     the booking had no captured payment to refund against — cancelling an unpaid hold
 *     is a state flip with no money involved.
 *   * A duplicate cancel on an already-CANCELLED booking is a **read**, not an error: it
 *     answers 200 with the existing refund and its status (D11).
 *   * `Refund` carries the percent and attempt number, so the ledger reads as a history
 *     of tries rather than a single status column.
 *   * No request anywhere carries an amount: the money comes from T37's quote (D3).
 */

export const REFUND_STATUSES = ['pending', 'succeeded', 'failed'] as const;

const refundStatusSchema = z.enum(REFUND_STATUSES);

const refundSchema = z.object({
  id: z.uuid(),
  bookingId: z.uuid(),
  amountCents: z
    .int()
    .describe('Integer cents, from the T37 quote. Never a client-sent amount.'),
  currency: z.string().describe('The booking’s own currency, as quoted.'),
  percent: z.int().describe('The percent of the total this attempt refunded.'),
  status: refundStatusSchema,
  attempts: z
    .int()
    .describe('1 for the cancellation’s own refund, 2+ for each retry.'),
  createdAt: z.string().describe('ISO 8601 instant the attempt was appended.'),
});

/** `POST /api/bookings/:id/cancel` — the booking plus the attempt it created. */
const cancelResultSchema = z.object({
  booking: bookingSchema,
  refund: refundSchema
    .nullable()
    .describe('Null when there was no captured payment to refund.'),
});

const refundListDataSchema = z.object({
  items: z.array(refundSchema).describe('Newest attempt first.'),
  total: z.int().describe('Always `items.length` until the list is paginated.'),
});

export const refundEnvelopeSchema = envelopeSchema(refundSchema);
export const cancelResultEnvelopeSchema = envelopeSchema(cancelResultSchema);
export const refundListEnvelopeSchema = envelopeSchema(refundListDataSchema);

export type RefundDto = z.infer<typeof refundSchema>;
export type CancelResultDto = z.infer<typeof cancelResultSchema>;
export type RefundListData = z.infer<typeof refundListDataSchema>;

/** Named so the OpenAPI components are stable, readable identifiers. */
export const DTO_SCHEMAS = {
  Refund: refundSchema,
  RefundEnvelope: refundEnvelopeSchema,
  CancelResult: cancelResultSchema,
  CancelResultEnvelope: cancelResultEnvelopeSchema,
  RefundListData: refundListDataSchema,
  RefundListEnvelope: refundListEnvelopeSchema,
} as const satisfies Record<string, z.ZodType>;
