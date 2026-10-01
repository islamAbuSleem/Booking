import { z } from 'zod';
import { envelopeSchema } from '../../../common/envelope.js';

/**
 * T18 — the availability and quote contract, as Zod schemas.
 *
 * The backend owns the API shape, so these schemas ARE the contract: `openapi.json` is
 * generated from them (`src/openapi/schemas.ts`). A field cannot drift between what the
 * API validates and what the frontend generates from.
 *
 * Things a generated frontend type must know:
 *   * Dates are `YYYY-MM-DD` day strings, not timestamps. A stay is half-open, so `nights`
 *     is `checkOut - checkIn` and `checkOut` is not a night.
 *   * `remainingPerNight` is one entry per night in stay order, first night first, and a
 *     blacked-out or fully booked night is `0` — never negative.
 *   * `breakdown[].priceCents` is the same for every night of a stay, because `room_prices`
 *     holds one price per room and currency (context/architecture.md, "Pricing"). It is a
 *     per-night list anyway so a dated rate table can land without changing the contract.
 *   * `holdExpiresAt` is advisory: a quote writes nothing, so nothing is held until T20
 *     creates the `PENDING` booking inside this window.
 *   * A stay is at most `MAX_STAY_NIGHTS` nights. Both endpoints are public and both walk the
 *     range one night at a time, so an unbounded range is a denial-of-service lever.
 */

/**
 * `guests` is capped at 20 platform-wide to match `GET /api/hotels`, so a search result and
 * an availability read are never asked about different-sized parties.
 */
const MAX_GUESTS = 20;

const guestsSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(MAX_GUESTS)
  .describe('Party size, 1-20. Checked against the room again server-side.');

/**
 * A night range as its two endpoints. Both the query string and the quote body carry the
 * same two fields under the same half-open rule, so the shape is shared; the `refine` that
 * enforces the ordering is not, because the two endpoints are parsed independently.
 */
const nightRangeBase = z.object({
  checkIn: z.iso
    .date()
    .describe(
      'First night, `YYYY-MM-DD`. Stored as a Postgres DATE, never a timestamp.',
    ),
  checkOut: z.iso
    .date()
    .describe(
      'Last day the guest leaves, `YYYY-MM-DD`. Strictly after `checkIn`. The stay is ' +
        'half-open, so a checkout equal to another booking check-in never overlaps.',
    ),
});

/**
 * The half-open rule, stated once. Compared as strings because `YYYY-MM-DD` is
 * zero-padded and therefore orders lexicographically the same as it orders chronologically,
 * and `z.iso.date()` has already guaranteed the format.
 */
const CHECKOUT_AFTER_CHECKIN = {
  message: 'checkOut must be after checkIn',
  path: ['checkOut'],
};

/**
 * The longest stay the API will price. Both endpoints are public, and both walk the range one
 * night at a time in memory, so an unbounded range (`0001-01-01` to `9999-12-31` passes the
 * date shape) would cost one unauthenticated caller millions of night entries and a filtered
 * booking scan per night. 30 nights covers every realistic hotel stay, and the cap is one
 * constant rather than a value per endpoint.
 */
export const MAX_STAY_NIGHTS = 30;

const STAY_TOO_LONG = {
  message: `a stay cannot be longer than ${MAX_STAY_NIGHTS} nights`,
  path: ['checkOut'],
};

const MILLIS_PER_DAY = 86_400_000;

/** Nights in a half-open range, counted as UTC days so no host timezone can shift it. */
function stayLength(checkIn: string, checkOut: string): number {
  const from = Date.parse(`${checkIn}T00:00:00.000Z`);
  const to = Date.parse(`${checkOut}T00:00:00.000Z`);
  return Math.round((to - from) / MILLIS_PER_DAY);
}

/**
 * `GET /api/hotels/:id/availability` — the range is required; there is nothing to report
 * without it, and an empty range would make every room vacuously available.
 */
export const availabilityQueryBase = nightRangeBase.extend({
  guests: guestsSchema.default(2),
});

export const availabilityQuerySchema = availabilityQueryBase
  .refine((query) => query.checkOut > query.checkIn, CHECKOUT_AFTER_CHECKIN)
  .refine(
    (query) => stayLength(query.checkIn, query.checkOut) <= MAX_STAY_NIGHTS,
    STAY_TOO_LONG,
  );

export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;

/** `POST /api/bookings/quote` — writes nothing, so the body is the same range plus a room. */
export const quoteRequestBase = nightRangeBase.extend({
  roomId: z.uuid(),
  guests: guestsSchema,
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, 'currency must be an ISO 4217 code')
    .default('USD')
    .describe(
      'ISO 4217 code to quote in. The room must have a `room_prices` row for it; a ' +
        'room with no row in this currency is an error, never a free stay.',
    ),
});

export const quoteRequestSchema = quoteRequestBase
  .refine(
    (request) => request.checkOut > request.checkIn,
    CHECKOUT_AFTER_CHECKIN,
  )
  .refine(
    (request) =>
      stayLength(request.checkIn, request.checkOut) <= MAX_STAY_NIGHTS,
    STAY_TOO_LONG,
  );

export type QuoteRequest = z.infer<typeof quoteRequestSchema>;

const availabilityRoomSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  bedType: z.string(),
  maxGuests: z.int(),
  totalInventory: z.int().describe('Units the hotel sells of this room type.'),
});

const roomAvailabilitySchema = z.object({
  room: availabilityRoomSchema,
  /**
   * True only when the room sleeps the party AND every night has at least one unit left AND
   * no blackout covers it. A room at exact fit is not bookable: the last unit taken leaves
   * nothing to sell.
   */
  available: z.boolean(),
  remainingPerNight: z
    .array(z.int())
    .describe(
      'Units left on each night, in stay order from `checkIn`. Length is `nights`. ' +
        'A blacked-out or fully booked night is 0; the value never goes negative.',
    ),
});

const hotelAvailabilityDataSchema = z.object({
  rooms: z.array(roomAvailabilitySchema),
});

const quoteNightSchema = z.object({
  date: z.iso.date().describe('The night this price covers, `YYYY-MM-DD`.'),
  priceCents: z
    .int()
    .describe('Integer cents for this night. Never major units.'),
});

const quoteDataSchema = z.object({
  nights: z.int().describe('`checkOut - checkIn` in whole days.'),
  subtotalCents: z.int(),
  feesCents: z.int().describe('Zero today; T20/T26 set the real fee schedule.'),
  totalCents: z.int().describe('Always `subtotalCents + feesCents`.'),
  currency: z.string().describe('ISO 4217 code the room is priced in.'),
  breakdown: z.array(quoteNightSchema),
  holdExpiresAt: z
    .string()
    .describe(
      'ISO 8601 instant by which T20 would take the hold. A quote holds nothing by ' +
        'itself, so this is advisory until the booking exists.',
    ),
});

export const hotelAvailabilityEnvelopeSchema = envelopeSchema(
  hotelAvailabilityDataSchema,
);
export const quoteEnvelopeSchema = envelopeSchema(quoteDataSchema);

export type HotelAvailabilityData = z.infer<typeof hotelAvailabilityDataSchema>;
export type RoomAvailability = z.infer<typeof roomAvailabilitySchema>;
export type QuoteData = z.infer<typeof quoteDataSchema>;

/** Named so the OpenAPI components are stable, readable identifiers. */
export const DTO_SCHEMAS = {
  AvailabilityRoom: availabilityRoomSchema,
  RoomAvailability: roomAvailabilitySchema,
  HotelAvailabilityData: hotelAvailabilityDataSchema,
  HotelAvailabilityEnvelope: hotelAvailabilityEnvelopeSchema,
  QuoteNight: quoteNightSchema,
  QuoteData: quoteDataSchema,
  QuoteEnvelope: quoteEnvelopeSchema,
} as const satisfies Record<string, z.ZodType>;
