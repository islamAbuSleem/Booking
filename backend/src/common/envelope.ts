import { SetMetadata } from '@nestjs/common';
import { z } from 'zod';

/**
 * Marks a route as already-shaped, so the global envelope interceptor leaves its
 * response alone. The OpenAPI document is served at `/api/docs-json` and must be the raw
 * specification — a wrapper object would make it unparseable by `openapi-typescript`.
 */
export const SKIP_ENVELOPE = 'skipEnvelope';

export const SkipEnvelope = (): MethodDecorator & ClassDecorator =>
  SetMetadata(SKIP_ENVELOPE, true);

/** The one envelope every endpoint returns. Documented in `openapi.json` as `ApiEnvelope`. */
export function envelopeSchema<T extends z.ZodType>(
  data: T,
): z.ZodObject<{
  success: z.ZodLiteral<true>;
  data: T;
}> {
  return z.object({ success: z.literal(true), data });
}

export const errorBodySchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});

export const errorEnvelopeSchema = z.object({
  success: z.literal(false),
  error: errorBodySchema,
});

export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;
