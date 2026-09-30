import { z } from 'zod';
import { envelopeSchema } from '../../../common/envelope.js';

/**
 * T13a — the hotels response contract, as Zod schemas.
 *
 * The backend owns the API shape, so these schemas ARE the contract. `openapi.json` is
 * generated from them (`src/openapi/build-document.ts`), which is why a field cannot
 * drift between what the API validates and what the frontend generates from.
 *
 * Things a generated frontend type must know:
 *   * `reviews.rating` is 1-5, not the 1-10 the Phase 1 mock used.
 *   * `priceFrom` and every `rooms[].price` are `null` when the room has no price row in
 *     the requested currency. Never `0` — a missing price is not free.
 *   * `rating.average` is `null` for a hotel with no visible reviews, not `0`.
 */

const imageSummarySchema = z.object({
  url: z.string(),
  altText: z.string().nullable(),
  /** `3:2` | `4:3` | `16:9` | `1:1`, matching `hotel_images.aspect`. */
  aspect: z.string(),
  width: z.int(),
  height: z.int(),
});

const moneySchema = z.object({
  /** Integer cents. Format at the edge, never in the client from a float. */
  amountCents: z.int(),
  currency: z.string().describe('ISO 4217 code.'),
});

const ratingSummarySchema = z.object({
  /** 1-5 scale. `null` when the hotel has no visible reviews. */
  average: z.number().nullable(),
  totalReviews: z.int(),
});

/** Named so the generated component is `AmenitySlug` and not a Zod `__schema0`. */
const amenitySlugSchema = z
  .string()
  .describe(
    'Amenity slug, lowercase: wifi, pool, breakfast, pets, ac, workspace, gym, spa, restaurant, bar, parking, shuttle.',
  );

const hotelCardSchema = z.object({
  id: z.uuid(),
  slug: z.string().describe('Stable, URL-safe. The detail route accepts this.'),
  name: z.string(),
  city: z.string(),
  country: z.string(),
  starRating: z.int(),
  coverImage: imageSummarySchema.nullable(),
  amenityIds: z.array(amenitySlugSchema),
  rating: ratingSummarySchema,
  /** Cheapest room that fits the requested guest count. */
  priceFrom: moneySchema.nullable(),
  currency: z.string().describe('ISO 4217 code the prices are quoted in.'),
});

const hotelRoomDetailSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string(),
  bedType: z.string(),
  maxGuests: z.int(),
  totalInventory: z.int(),
  price: moneySchema.nullable(),
  images: z.array(imageSummarySchema),
});

const hotelDetailSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  addressLine: z.string(),
  city: z.string(),
  country: z.string(),
  lat: z.number(),
  lng: z.number(),
  starRating: z.int(),
  status: z.enum(['PENDING', 'PUBLISHED', 'REJECTED', 'SUSPENDED']),
  checkInTime: z.string().describe('Local wall-clock `HH:mm`.'),
  checkOutTime: z.string().describe('Local wall-clock `HH:mm`.'),
  currency: z.string(),
  coverImage: imageSummarySchema.nullable(),
  images: z
    .array(imageSummarySchema)
    .describe('Hotel-level imagery, cover first.'),
  amenityIds: z.array(amenitySlugSchema),
  rating: ratingSummarySchema,
  rooms: z.array(hotelRoomDetailSchema),
  host: z.object({ id: z.uuid(), name: z.string() }).nullable(),
});

const hotelListDataSchema = z.object({
  items: z.array(hotelCardSchema),
  total: z.int().describe('Total matching hotels, ignoring pagination.'),
  page: z.int(),
  pageSize: z.int(),
});

const healthDataSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  db: z.enum(['up', 'down']),
});

export const hotelListEnvelopeSchema = envelopeSchema(hotelListDataSchema);
export const hotelDetailEnvelopeSchema = envelopeSchema(hotelDetailSchema);
export const healthEnvelopeSchema = envelopeSchema(healthDataSchema);

export type HotelCardDto = z.infer<typeof hotelCardSchema>;
export type HotelDetailDto = z.infer<typeof hotelDetailSchema>;
export type HotelListDataDto = z.infer<typeof hotelListDataSchema>;
export type HealthDataDto = z.infer<typeof healthDataSchema>;

/**
 * Named so the OpenAPI components are stable, readable identifiers. The frontend agent
 * generates types from `backend/openapi.json` and references these names.
 */
export const DTO_SCHEMAS = {
  AmenitySlug: amenitySlugSchema,
  HotelImage: imageSummarySchema,
  Money: moneySchema,
  RatingSummary: ratingSummarySchema,
  HotelCard: hotelCardSchema,
  HotelRoom: hotelRoomDetailSchema,
  HotelDetail: hotelDetailSchema,
  HotelListData: hotelListDataSchema,
  HealthData: healthDataSchema,
  HotelListEnvelope: hotelListEnvelopeSchema,
  HotelDetailEnvelope: hotelDetailEnvelopeSchema,
  HealthEnvelope: healthEnvelopeSchema,
} as const satisfies Record<string, z.ZodType>;
