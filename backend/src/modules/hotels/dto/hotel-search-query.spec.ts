import { hotelSearchQuery, hotelIdParam } from './hotel-search-query.js';

/**
 * The whole query string goes through one schema, so this is where a bad range is
 * rejected. Query values arrive as strings, which is what every `z.coerce` here is for.
 */
describe('hotelSearchQuery', () => {
  it('applies defaults for an empty query string', () => {
    const parsed = hotelSearchQuery.parse({});

    expect(parsed).toMatchObject({
      guests: 2,
      sort: 'recommended',
      page: 1,
      pageSize: 12,
      currency: 'USD',
    });
    expect(parsed.amenityIds).toEqual([]);
    expect(parsed.minPrice).toBeUndefined();
  });

  it('coerces numeric strings from the query', () => {
    const parsed = hotelSearchQuery.parse({
      guests: '4',
      page: '3',
      pageSize: '24',
      minPrice: '150',
      maxPrice: '500.50',
    });

    expect(parsed.guests).toBe(4);
    expect(parsed.page).toBe(3);
    expect(parsed.pageSize).toBe(24);
    expect(parsed.minPrice).toBe(150);
    expect(parsed.maxPrice).toBe(500.5);
  });

  it('normalises the amenity list to unique lowercase slugs', () => {
    const parsed = hotelSearchQuery.parse({ amenities: 'Wifi, pool ,,wifi' });

    expect(parsed.amenityIds).toEqual(['pool', 'wifi']);
  });

  it('upper-cases the currency code', () => {
    expect(hotelSearchQuery.parse({ currency: 'eur' }).currency).toBe('EUR');
  });

  describe('date range', () => {
    it('accepts a well-ordered range', () => {
      const parsed = hotelSearchQuery.parse({
        checkIn: '2026-06-01',
        checkOut: '2026-06-04',
      });

      expect(parsed.checkIn).toBe('2026-06-01');
      expect(parsed.checkOut).toBe('2026-06-04');
    });

    it('rejects a checkout that is not after checkin', () => {
      const result = hotelSearchQuery.safeParse({
        checkIn: '2026-06-04',
        checkOut: '2026-06-01',
      });

      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.path).toEqual(['checkOut']);
      expect(result.error?.issues[0]?.message).toBe(
        'checkOut must be after checkIn',
      );
    });

    it('rejects a same-day checkout', () => {
      expect(
        hotelSearchQuery.safeParse({
          checkIn: '2026-06-01',
          checkOut: '2026-06-01',
        }).success,
      ).toBe(false);
    });

    it('rejects a malformed date', () => {
      expect(
        hotelSearchQuery.safeParse({ checkIn: '01/06/2026' }).success,
      ).toBe(false);
      expect(
        hotelSearchQuery.safeParse({ checkIn: '2026-13-01' }).success,
      ).toBe(false);
    });
  });

  describe('price range', () => {
    it('accepts an equal min and max', () => {
      expect(
        hotelSearchQuery.safeParse({ minPrice: '200', maxPrice: '200' })
          .success,
      ).toBe(true);
    });

    it('rejects minPrice above maxPrice', () => {
      const result = hotelSearchQuery.safeParse({
        minPrice: '500',
        maxPrice: '100',
      });

      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.path).toEqual(['minPrice']);
    });

    it('rejects a negative price', () => {
      expect(hotelSearchQuery.safeParse({ minPrice: '-1' }).success).toBe(
        false,
      );
    });
  });

  it('rejects an out-of-range guest count', () => {
    expect(hotelSearchQuery.safeParse({ guests: '0' }).success).toBe(false);
    expect(hotelSearchQuery.safeParse({ guests: '21' }).success).toBe(false);
    expect(hotelSearchQuery.safeParse({ guests: '2.5' }).success).toBe(false);
  });

  it('rejects an unknown sort option', () => {
    expect(hotelSearchQuery.safeParse({ sort: 'cheapest' }).success).toBe(
      false,
    );
  });

  it('rejects a pageSize above the cap', () => {
    expect(hotelSearchQuery.safeParse({ pageSize: '51' }).success).toBe(false);
  });
});

describe('hotelIdParam', () => {
  it('accepts a slug, because the frontend routes by slug', () => {
    expect(hotelIdParam.parse({ id: 'the-larkspur-hotel' })).toEqual({
      id: 'the-larkspur-hotel',
    });
  });

  it('accepts a uuid', () => {
    const id = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
    expect(hotelIdParam.parse({ id })).toEqual({ id });
  });

  it('rejects an empty id', () => {
    expect(hotelIdParam.safeParse({ id: '' }).success).toBe(false);
  });
});
