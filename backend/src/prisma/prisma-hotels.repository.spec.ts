import { Prisma } from '../generated/prisma/client.js';
import { buildPublishedWhere } from './prisma-hotels.repository.js';
import type { HotelSearchCriteria } from './hotels.repository.js';

function criteria(
  overrides: Partial<HotelSearchCriteria> = {},
): HotelSearchCriteria {
  return { amenities: [], guests: 2, currency: 'USD', ...overrides };
}

/**
 * The PUBLISHED rule lives in SQL, not in a post-filter, so this is the test that
 * matters: a PENDING draft must never be selectable, whatever else the query asks for.
 */
describe('buildPublishedWhere', () => {
  it('is scoped to PUBLISHED with no arguments at all', () => {
    expect(buildPublishedWhere(criteria()).status).toBe('PUBLISHED');
  });

  it('keeps the PUBLISHED filter alongside every other filter', () => {
    const where = buildPublishedWhere(
      criteria({
        city: 'Lisbon',
        guests: 4,
        amenities: ['wifi', 'pool'],
        minPriceCents: 10_000,
        maxPriceCents: 50_000,
        currency: 'EUR',
      }),
    );

    expect(where.status).toBe('PUBLISHED');
    expect(where.city).toEqual({ equals: 'Lisbon', mode: 'insensitive' });
  });

  it('ANDs every requested amenity, so `wifi,pool` means both', () => {
    const where = buildPublishedWhere(
      criteria({ amenities: ['wifi', 'pool'] }),
    );

    expect(where.AND).toEqual([
      { amenities: { some: { amenityId: 'wifi' } } },
      { amenities: { some: { amenityId: 'pool' } } },
    ]);
  });

  it('adds no amenity clause when none were asked for', () => {
    expect(buildPublishedWhere(criteria()).AND).toBeUndefined();
  });

  it('requires a room that fits the party and has a price in the currency', () => {
    const where = buildPublishedWhere(criteria({ guests: 3, currency: 'EUR' }));

    expect(where.rooms).toEqual({
      some: { maxGuests: { gte: 3 }, prices: { some: { currency: 'EUR' } } },
    });
  });

  it('applies the price bounds in cents when a range was given', () => {
    const where = buildPublishedWhere(
      criteria({ minPriceCents: 10_000, maxPriceCents: 50_000 }),
    );

    expect(where.rooms).toEqual({
      some: {
        maxGuests: { gte: 2 },
        prices: {
          some: { currency: 'USD', priceCents: { gte: 10_000, lte: 50_000 } },
        },
      },
    });
  });

  it('applies a half-open price bound when only one side was given', () => {
    const where = buildPublishedWhere(criteria({ minPriceCents: 10_000 }));

    expect(where.rooms).toEqual({
      some: {
        maxGuests: { gte: 2 },
        prices: { some: { currency: 'USD', priceCents: { gte: 10_000 } } },
      },
    });
  });

  it('sets status unconditionally, so nothing a caller sends can widen visibility', () => {
    // `status` is assigned, never spread from the criteria, so there is no code path that
    // merges a caller-supplied status into this clause.
    const where = buildPublishedWhere(criteria());

    expect(Object.keys(where).sort()).toEqual(['rooms', 'status']);
  });
});

describe('Prisma error classes', () => {
  it('keeps the documented P-codes stable in Prisma 7', () => {
    const error = new Prisma.PrismaClientKnownRequestError('x', {
      code: 'P2025',
      clientVersion: '7.10.0',
    });

    expect(error.code).toBe('P2025');
  });
});
