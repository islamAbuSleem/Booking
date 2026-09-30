import { z } from 'zod';
import { envelopeSchema } from '../../../common/envelope.js';

/**
 * T19 — the favourites contract, as Zod schemas.
 *
 * The backend owns the API shape, so these schemas ARE the contract: `openapi.json` is
 * generated from them (`src/openapi/schemas.ts`). A field cannot drift between what the API
 * validates and what the frontend generates from.
 *
 * Things a generated frontend type must know:
 *   * `userId` in the response is the caller's own id, echoed for convenience. The REQUEST
 *     never carries one: it is read from the JWT, so a body that includes `userId` has it
 *     stripped rather than obeyed. Stripping (not rejecting) is what every other schema in
 *     this API does, and a strict object here would 400 a field the service would ignore.
 *   * `createdAt` is an ISO 8601 instant, not a `YYYY-MM-DD` day string. It records when the
 *     guest acted, and a day is not precise enough to order a list by.
 */

/** `POST /api/favorites` — the hotel to favourite, and nothing else. */
export const createFavoriteSchema = z.object({
  hotelId: z.uuid().describe('The hotel to favourite, by uuid.'),
});

export type CreateFavorite = z.infer<typeof createFavoriteSchema>;

/** `DELETE /api/favorites/:hotelId` — the same uuid, in the path. */
export const favoriteHotelIdParam = z.object({
  hotelId: z.uuid().describe('The hotel to un-favourite, by uuid.'),
});

export type FavoriteHotelIdParam = z.infer<typeof favoriteHotelIdParam>;

const favoriteSchema = z.object({
  /** The caller, from the JWT. Never a request field. */
  userId: z.uuid(),
  hotelId: z.uuid(),
  createdAt: z.string().describe('ISO 8601 instant the favourite was created.'),
});

export const favoriteEnvelopeSchema = envelopeSchema(favoriteSchema);

export type FavoriteDto = z.infer<typeof favoriteSchema>;

/** Named so the OpenAPI components are stable, readable identifiers. */
export const DTO_SCHEMAS = {
  CreateFavorite: createFavoriteSchema,
  Favorite: favoriteSchema,
  FavoriteEnvelope: favoriteEnvelopeSchema,
} as const satisfies Record<string, z.ZodType>;
