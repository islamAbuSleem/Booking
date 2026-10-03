import { z } from 'zod';
import { envelopeSchema } from '../../../common/envelope.js';

/**
 * T24 — the reviews contract, as Zod schemas.
 *
 * The backend owns the API shape, so these schemas ARE the contract. `openapi.json` is
 * generated from them, and the frontend's types are generated from that document —
 * never hand-written to match.
 *
 * `reviews.rating` is 1–5, per `context/architecture.md`. The Phase 1 mock used 1–10;
 * the API follows the schema (D43).
 */

export const createReviewSchema = z.object({
  bookingId: z.uuid(),
  /** 1–5. Anything else is a 400, not a clamp — clamping would invent a score. */
  rating: z.int().min(1).max(5),
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(5000),
});

export const reviewListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});

export const bookingIdParamSchema = z.object({ id: z.uuid() });

const reviewSchema = z.object({
  id: z.uuid(),
  bookingId: z.uuid(),
  author: z.object({ id: z.uuid(), name: z.string() }),
  hotelId: z.uuid(),
  /** 1–5 scale. */
  rating: z.int(),
  title: z.string(),
  body: z.string(),
  status: z.enum(['VISIBLE', 'HIDDEN']),
  createdAt: z.string().describe('ISO 8601 instant the review was written.'),
});

const reviewListDataSchema = z.object({
  items: z.array(reviewSchema),
  total: z.int().describe('Total VISIBLE reviews, ignoring pagination.'),
  /** 1–5 average, null when the hotel has no visible reviews. Never 0. */
  average: z.number().nullable(),
});

const reviewableDataSchema = z.object({
  canReview: z.boolean(),
  /**
   * Why not, when `canReview` is false. The form shows the matching message; anything
   * else is a real error and renders as one.
   */
  reason: z.enum(['NOT_COMPLETED', 'ALREADY_REVIEWED']).optional(),
});

const reviewEnvelopeSchema = envelopeSchema(reviewSchema);
const reviewListEnvelopeSchema = envelopeSchema(reviewListDataSchema);
const reviewableEnvelopeSchema = envelopeSchema(reviewableDataSchema);

export const DTO_SCHEMAS = {
  CreateReview: createReviewSchema,
  Review: reviewSchema,
  ReviewListData: reviewListDataSchema,
  ReviewEnvelope: reviewEnvelopeSchema,
  ReviewListEnvelope: reviewListEnvelopeSchema,
  ReviewableData: reviewableDataSchema,
  ReviewableEnvelope: reviewableEnvelopeSchema,
} as const satisfies Record<string, z.ZodType>;

export type CreateReviewDto = z.infer<typeof createReviewSchema>;
export type ReviewListQuery = z.infer<typeof reviewListQuerySchema>;
export type BookingIdParam = z.infer<typeof bookingIdParamSchema>;
export type ReviewDto = z.infer<typeof reviewSchema>;
export type ReviewListData = z.infer<typeof reviewListDataSchema>;
export type ReviewableData = z.infer<typeof reviewableDataSchema>;
