import { z } from 'zod';
import { envelopeSchema } from '../../../common/envelope.js';

/**
 * T26 — the payments contract, as Zod schemas.
 *
 * The backend owns the API shape. `openapi.json` is generated from these schemas, and
 * the frontend's types are generated from that document.
 *
 * There is deliberately no amount in the intent request: the server recomputes from
 * the booking snapshot, and a client-sent total is stripped, never trusted (D3).
 */

export const intentRequestSchema = z.object({
  bookingId: z.uuid(),
});

/** `GET /api/payments/:bookingId` — the same uuid, in the path. */
export const paymentBookingParamSchema = z.object({
  bookingId: z.uuid().describe('The booking, by uuid.'),
});

const intentDataSchema = z.object({
  /** Handed to Stripe.js in the browser. Short-lived and bound to this intent. */
  clientSecret: z.string(),
  paymentIntentId: z.string(),
  /** Integer cents, the booking's server-computed total in `currency`. */
  amountCents: z.int(),
  currency: z.string().describe('ISO 4217 code, as stored on the booking.'),
});

const paymentSchema = z.object({
  id: z.uuid(),
  bookingId: z.uuid(),
  stripePaymentIntentId: z.string(),
  amountCents: z.int(),
  currency: z.string(),
  status: z.enum(['requires_payment', 'succeeded', 'refunded', 'failed']),
  receiptUrl: z.string().nullable(),
  createdAt: z.string(),
});

const intentEnvelopeSchema = envelopeSchema(intentDataSchema);
const paymentEnvelopeSchema = envelopeSchema(paymentSchema);

const webhookDataSchema = z.object({
  received: z.literal(true),
});

const webhookEnvelopeSchema = envelopeSchema(webhookDataSchema);

export const DTO_SCHEMAS = {
  IntentRequest: intentRequestSchema,
  IntentData: intentDataSchema,
  IntentEnvelope: intentEnvelopeSchema,
  Payment: paymentSchema,
  PaymentEnvelope: paymentEnvelopeSchema,
  WebhookData: webhookDataSchema,
  WebhookEnvelope: webhookEnvelopeSchema,
} as const satisfies Record<string, z.ZodType>;

export type IntentRequest = z.infer<typeof intentRequestSchema>;
export type PaymentBookingParam = z.infer<typeof paymentBookingParamSchema>;
export type IntentData = z.infer<typeof intentDataSchema>;
export type PaymentDto = z.infer<typeof paymentSchema>;
export type WebhookData = z.infer<typeof webhookDataSchema>;
