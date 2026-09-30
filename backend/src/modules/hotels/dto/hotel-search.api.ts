import { applyDecorators } from '@nestjs/common';
import { ApiQuery, type ApiQueryOptions } from '@nestjs/swagger';
import {
  HOTEL_SORT_OPTIONS,
  hotelSearchQueryBase,
} from './hotel-search-query.js';

/**
 * T13a — the OpenAPI description of the `GET /api/hotels` query string.
 *
 * Written out rather than derived, because the description sentences are what the
 * frontend agent actually needs and they do not fit in a type. The `assertCoversQuery()`
 * call at the bottom is the drift guard: adding a field to the Zod schema without
 * documenting it here throws at import time instead of shipping an undocumented param.
 */
type QueryParamDoc = ApiQueryOptions & { name: string };

export const HOTEL_SEARCH_PARAMS: QueryParamDoc[] = [
  {
    name: 'city',
    required: false,
    type: String,
    description:
      'City name, case-insensitive exact match. Omit to search every city.',
    example: 'Lisbon',
  },
  {
    name: 'checkIn',
    required: false,
    type: String,
    format: 'date',
    description:
      'First night, `YYYY-MM-DD`. Stored as a Postgres DATE, never a timestamp.',
    example: '2026-06-01',
  },
  {
    name: 'checkOut',
    required: false,
    type: String,
    format: 'date',
    description:
      'Last day the guest leaves, `YYYY-MM-DD`. Must be strictly after `checkIn`. The stay is ' +
      'half-open, so a checkout equal to another booking check-in never overlaps.',
    example: '2026-06-04',
  },
  {
    name: 'guests',
    required: false,
    type: Number,
    description:
      'Party size, 1-20. A hotel qualifies only if it has a room that fits.',
    example: 2,
  },
  {
    name: 'minPrice',
    required: false,
    type: Number,
    description:
      'LOWEST nightly price in MAJOR currency units, not cents. `150` means 150.00. Must be ' +
      '<= maxPrice.',
    example: 150,
  },
  {
    name: 'maxPrice',
    required: false,
    type: Number,
    description: 'Highest nightly price in MAJOR currency units, not cents.',
    example: 500,
  },
  {
    name: 'amenities',
    required: false,
    type: String,
    description:
      'Comma-separated amenity slugs, ANDed: `wifi,pool` returns only hotels with both. ' +
      'Slugs are lowercase: wifi, pool, breakfast, pets, ac, workspace, gym, spa, restaurant, ' +
      'bar, parking, shuttle.',
    example: 'wifi,breakfast',
  },
  {
    name: 'sort',
    required: false,
    enum: [...HOTEL_SORT_OPTIONS],
    description:
      '`recommended` (default) is star rating then name. `rating_desc` puts hotels with no ' +
      'reviews last, because a null average is not the best rating.',
    example: 'price_asc',
  },
  {
    name: 'page',
    required: false,
    type: Number,
    description: '1-based page number.',
    example: 1,
  },
  {
    name: 'pageSize',
    required: false,
    type: Number,
    description: 'Items per page, 1-50.',
    example: 12,
  },
  {
    name: 'currency',
    required: false,
    type: String,
    description:
      'ISO 4217 code to price in. Only USD has price rows today; a currency with no ' +
      '`room_prices` row yields `priceFrom: null`, never zero.',
    example: 'USD',
  },
];

/** Reference a contract component by name. The name is the Zod schema id. */
export function contractRef(name: string): string {
  return `#/components/schemas/${name}`;
}

/** Documents every query parameter of `hotelSearchQueryBase`. */
export function ApiHotelSearchQuery(): MethodDecorator {
  return applyDecorators(
    ...HOTEL_SEARCH_PARAMS.map((param) => ApiQuery(param)),
  );
}

function assertCoversQuery(): void {
  const documented = new Set(HOTEL_SEARCH_PARAMS.map((param) => param.name));
  const missing = Object.keys(hotelSearchQueryBase.shape).filter(
    (key) => !documented.has(key),
  );
  if (missing.length > 0) {
    throw new Error(
      `[hotels] the OpenAPI query list is missing: ${missing.join(', ')}. ` +
        'Add them to HOTEL_SEARCH_PARAMS.',
    );
  }
}

assertCoversQuery();
