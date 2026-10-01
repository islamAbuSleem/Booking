import { applyDecorators } from '@nestjs/common';
import { ApiQuery, type ApiQueryOptions } from '@nestjs/swagger';
import { availabilityQueryBase } from './availability.dto.js';

/**
 * T18 — the OpenAPI description of the `GET /api/hotels/:id/availability` query string.
 *
 * Written out rather than derived, because the description sentences are what the frontend
 * agent needs and they do not fit in a type. The `assertCoversQuery()` call at the bottom is
 * the drift guard from T13a: adding a field to the Zod schema without documenting it here
 * throws at import time instead of shipping an undocumented param.
 */
type QueryParamDoc = ApiQueryOptions & { name: string };

export const AVAILABILITY_PARAMS: QueryParamDoc[] = [
  {
    name: 'checkIn',
    required: true,
    type: String,
    format: 'date',
    description:
      'First night, `YYYY-MM-DD`. Required: without a range there are no nights to report ' +
      'on, and an empty range would make every room vacuously available.',
    example: '2026-06-01',
  },
  {
    name: 'checkOut',
    required: true,
    type: String,
    format: 'date',
    description:
      'Last day the guest leaves, `YYYY-MM-DD`. Must be strictly after `checkIn`. The stay is ' +
      'half-open, so `checkOut` is not one of its nights and a checkout equal to another ' +
      "booking's check-in never overlaps.",
    example: '2026-06-04',
  },
  {
    name: 'guests',
    required: false,
    type: Number,
    description:
      'Party size, 1-20. A room that cannot sleep the party reports `available: false` even ' +
      'when it has units left on every night.',
    example: 2,
  },
];

/** Documents every query parameter of `availabilityQueryBase`. */
export function ApiAvailabilityQuery(): MethodDecorator {
  return applyDecorators(
    ...AVAILABILITY_PARAMS.map((param) => ApiQuery(param)),
  );
}

function assertCoversQuery(): void {
  const documented = new Set(AVAILABILITY_PARAMS.map((param) => param.name));
  const missing = Object.keys(availabilityQueryBase.shape).filter(
    (key) => !documented.has(key),
  );
  if (missing.length > 0) {
    throw new Error(
      `[bookings] the OpenAPI query list is missing: ${missing.join(', ')}. ` +
        'Add them to AVAILABILITY_PARAMS.',
    );
  }
}

assertCoversQuery();
