import { z } from 'zod';
import { envelopeSchema } from '../../../common/envelope.js';

/**
 * T20 — the bookings contract, as Zod schemas.
 *
 * The backend owns the API shape, so these schemas ARE the contract: `openapi.json` is
 * generated from them (`src/openapi/schemas.ts`). A field cannot drift between what the
 * API validates and what the frontend generates from.
 *
 * Things a generated frontend type must know:
 *   * `Booking` embeds a `hotel` display snapshot and a `room.name`: the T8 detail page
 *     renders both without a second fetch. Money is a server-computed snapshot in the
 *     booking's own currency — `totalCents` is always `subtotalCents + feesCents`.
 *   * The request carries **no money fields**. The schema strips anything else (the
 *     default Zod behaviour), so a client-sent total cannot reach the service, which is
 *     the D3 rule made structural.
 *   * `guestName`/`guestEmail`/`guestPhone` are accepted and validated but NOT persisted:
 *     the `bookings` table has no such columns and T12's migration cannot be re-run, so
 *     they are consumed by the payment flow (T26/T27) that books them a home.
 *   * `createdAt` is an ISO 8601 instant; `checkIn`/`checkOut` are `YYYY-MM-DD` day
 *     strings, and the stay is half-open, so `nights` is `checkOut - checkIn`.
 */

/**
 * `guests` is capped at 20 platform-wide to match `GET /api/hotels` and T18's quote, so a
 * search result, a quote and a create are never asked about different-sized parties.
 */
const MAX_GUESTS = 20;

export const createBookingSchema = z
  .object({
    roomId: z.uuid().describe('The room to book, by uuid.'),
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
    guests: z
      .number()
      .int()
      .min(1)
      .max(MAX_GUESTS)
      .describe(
        'Party size, 1-20. Checked against the room again server-side.',
      ),
    guestName: z
      .string()
      .min(1)
      .describe(
        'Lead guest name. Validated, not persisted (T26/T27 consume it).',
      ),
    guestEmail: z
      .email()
      .describe(
        'Lead guest email. Validated, not persisted (T26/T27 consume it).',
      ),
    guestPhone: z
      .string()
      .describe(
        'Lead guest phone. Validated, not persisted (T26/T27 consume it).',
      ),
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/, 'currency must be an ISO 4217 code')
      .optional()
      .describe(
        "ISO 4217 code to book in. Defaults to the room's price currency, else USD; a " +
          'room with no `room_prices` row in that currency is a PRICE_UNAVAILABLE error, ' +
          'never a free stay.',
      ),
  })
  .refine((body) => body.checkOut > body.checkIn, {
    message: 'checkOut must be after checkIn',
    path: ['checkOut'],
  });

export type CreateBooking = z.infer<typeof createBookingSchema>;

/** `GET /api/bookings/:id` and `POST /api/bookings/:id/cancel` — the same uuid, in the path. */
export const bookingIdParam = z.object({
  id: z.uuid().describe('The booking, by uuid.'),
});

export type BookingIdParam = z.infer<typeof bookingIdParam>;

/** The one place the booking statuses are named: the enum the `bookings.status` column holds. */
export const BOOKING_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'COMPLETED',
  'CANCELLED',
] as const;

const bookingStatusSchema = z.enum(BOOKING_STATUSES);

const bookingHotelSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  city: z.string(),
  country: z.string(),
  addressLine: z.string(),
  coverImage: z
    .string()
    .nullable()
    .describe('The hotel cover image URL, or null when it has none.'),
});

const bookingSchema = z.object({
  id: z.uuid(),
  reference: z
    .string()
    .describe(
      'Human-readable, e.g. GB-4821. Shown to the guest; never the primary key.',
    ),
  status: bookingStatusSchema,
  checkIn: z.iso.date(),
  checkOut: z.iso.date(),
  nights: z
    .int()
    .describe('`checkOut - checkIn` in whole days. The stay is half-open.'),
  guestsCount: z.int(),
  currency: z
    .string()
    .describe(
      'ISO 4217 code the booking was priced in. A historical label, not a key.',
    ),
  subtotalCents: z.int().describe('Integer cents for the stay, before fees.'),
  feesCents: z.int().describe('Zero today; T20/T26 set the real fee schedule.'),
  totalCents: z.int().describe('Always `subtotalCents + feesCents`.'),
  /** The property snapshot the T8 detail page renders; embedded so no second fetch. */
  hotel: bookingHotelSchema,
  room: z.object({ name: z.string() }),
  createdAt: z.string().describe('ISO 8601 instant the booking was created.'),
});

export const bookingEnvelopeSchema = envelopeSchema(bookingSchema);

/** `GET /api/bookings` — the caller's own bookings; not paginated yet, so `total` is `items.length`. */
const bookingListDataSchema = z.object({
  items: z.array(bookingSchema),
  total: z.int().describe('Always `items.length` until the list is paginated.'),
});

export const bookingListEnvelopeSchema = envelopeSchema(bookingListDataSchema);

export type BookingDto = z.infer<typeof bookingSchema>;
export type BookingListData = z.infer<typeof bookingListDataSchema>;

/** Named so the OpenAPI components are stable, readable identifiers. */
export const DTO_SCHEMAS = {
  CreateBooking: createBookingSchema,
  Booking: bookingSchema,
  BookingEnvelope: bookingEnvelopeSchema,
  BookingListData: bookingListDataSchema,
  BookingListEnvelope: bookingListEnvelopeSchema,
} as const satisfies Record<string, z.ZodType>;
