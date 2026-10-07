import { z } from 'zod';
import { envelopeSchema } from '../../../common/envelope.js';

/**
 * T37 — the cancellation-policy contract, as Zod schemas.
 *
 * The backend owns the API shape, so these schemas ARE the contract: `openapi.json` is
 * generated from them (`src/openapi/schemas.ts`).
 *
 * Things a generated frontend type must know:
 *   * A `Policy` is the tier list highest-`daysBefore` first, the no-refund window in
 *     hours, and a `version` that bumps on every PUT — a quote pins the version it
 *     priced against.
 *   * A `CancellationQuote` is the one computation the API performs: the percent, the
 *     integer-cent refund in the booking's own currency, and the policy version.
 */

const policyTierSchema = z.object({
  daysBefore: z
    .int()
    .min(0)
    .describe('Whole days before check-in this tier starts at, inclusive.'),
  refundPercent: z
    .int()
    .min(0)
    .max(100)
    .describe('Percent of the booking total refunded from this tier on.'),
});

export const updatePolicySchema = z.object({
  tiers: z
    .array(policyTierSchema)
    .min(1)
    .max(10)
    .describe('Ordered highest-`daysBefore` first. Stored sorted that way.'),
  noRefundWithinHours: z
    .int()
    .min(0)
    .describe('Inside this many hours of check-in the refund is 0, whatever the tiers say.'),
});

export type UpdatePolicy = z.infer<typeof updatePolicySchema>;

const policySchema = z.object({
  hotelId: z.uuid(),
  tiers: z.array(policyTierSchema),
  noRefundWithinHours: z.int(),
  version: z
    .int()
    .describe('Bumps on every PUT. 0 means the API default, not a stored row.'),
});

const quoteDataSchema = z.object({
  refundPercent: z.int().describe('0-100, from the tier the cancellation lands in.'),
  refundCents: z.int().describe('Integer cents of the booking total at that percent.'),
  currency: z.string().describe('The booking\u2019s own currency, never re-denominated.'),
  policyVersion: z.int().describe('The policy version this quote priced against.'),
});

export const policyEnvelopeSchema = envelopeSchema(policySchema);
export const quoteEnvelopeSchema = envelopeSchema(quoteDataSchema);

export type PolicyDto = z.infer<typeof policySchema>;
export type QuoteDto = z.infer<typeof quoteDataSchema>;

/** Named so the OpenAPI components are stable, readable identifiers. */
export const DTO_SCHEMAS = {
  UpdatePolicy: updatePolicySchema,
  CancellationPolicy: policySchema,
  CancellationPolicyEnvelope: policyEnvelopeSchema,
  CancellationQuote: quoteDataSchema,
  CancellationQuoteEnvelope: quoteEnvelopeSchema,
} as const satisfies Record<string, z.ZodType>;
