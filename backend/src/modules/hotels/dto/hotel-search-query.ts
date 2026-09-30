import { z } from 'zod';

/**
 * T16 — the whole `GET /api/hotels` query string, parsed through ONE schema.
 *
 * Zod 4: `z.iso.date()` is the `YYYY-MM-DD` form (`z.string().date()` is gone), and every
 * numeric field arrives as a string, so it needs `z.coerce`.
 *
 * Money is integer cents everywhere else, but `minPrice`/`maxPrice` are what a person
 * types into a filter box, so they are **major currency units** — `150` means 150.00.
 * The service converts to cents at the boundary.
 */
export const HOTEL_SORT_OPTIONS = [
  'recommended',
  'price_asc',
  'price_desc',
  'rating_desc',
  'name_asc',
] as const;

/** The object before the cross-field refinements, so the docs can read `.shape`. */
export const hotelSearchQueryBase = z.object({
  city: z.string().trim().min(1).max(120).optional(),
  checkIn: z.iso.date().optional(),
  checkOut: z.iso.date().optional(),
  guests: z.coerce.number().int().min(1).max(20).default(2),
  minPrice: z.coerce.number().min(0).max(1_000_000).optional(),
  maxPrice: z.coerce.number().min(0).max(1_000_000).optional(),
  /** Comma-separated amenity slugs, e.g. `wifi,pool`. Every one must be present. */
  amenities: z.string().trim().optional(),
  sort: z.enum(HOTEL_SORT_OPTIONS).default('recommended'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, 'currency must be an ISO 4217 code')
    .default('USD'),
});

export const hotelSearchQuery = hotelSearchQueryBase
  .refine(
    (query) =>
      !query.checkIn || !query.checkOut || query.checkOut > query.checkIn,
    {
      message: 'checkOut must be after checkIn',
      path: ['checkOut'],
    },
  )
  .refine(
    (query) =>
      query.minPrice === undefined ||
      query.maxPrice === undefined ||
      query.minPrice <= query.maxPrice,
    {
      message: 'minPrice must be less than or equal to maxPrice',
      path: ['minPrice'],
    },
  )
  .transform((query) => ({
    ...query,
    amenityIds: parseAmenities(query.amenities),
  }));

export type HotelSearchQuery = z.infer<typeof hotelSearchQuery>;

/** `GET /api/hotels/:id` accepts either the uuid or the slug. The frontend routes by
 *  slug (`/hotels/the-larkspur-hotel`), so a bare uuid is not the only thing that resolves. */
export const hotelIdParam = z.object({ id: z.string().trim().min(1).max(160) });

export type HotelIdParam = z.infer<typeof hotelIdParam>;

/** Drops empty entries from `?amenities=a,,b` and lower-cases the slugs. */
function parseAmenities(raw: string | undefined): string[] {
  if (!raw) return [];
  return [
    ...new Set(
      raw
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter((value) => value.length > 0),
    ),
  ].sort();
}
