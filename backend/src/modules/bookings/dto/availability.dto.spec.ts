import {
  MAX_STAY_NIGHTS,
  availabilityQuerySchema,
  quoteRequestSchema,
} from './availability.dto.js';

/**
 * Both endpoints share the same half-open range, so both are checked here. Query values and
 * JSON body values both arrive as strings, which is what the `z.coerce` on `guests` is for.
 */
const ROOM_ID = '22222222-2222-4222-8222-222222222222';

describe('availabilityQuerySchema', () => {
  it('defaults the party size to 2 and requires the range', () => {
    const parsed = availabilityQuerySchema.parse({
      checkIn: '2026-06-01',
      checkOut: '2026-06-04',
    });

    expect(parsed.guests).toBe(2);
    expect(parsed.checkIn).toBe('2026-06-01');
  });

  it('coerces a guest count arriving as a query string', () => {
    const parsed = availabilityQuerySchema.parse({
      checkIn: '2026-06-01',
      checkOut: '2026-06-04',
      guests: '4',
    });

    expect(parsed.guests).toBe(4);
  });

  it('rejects a missing range, because there is nothing to report without one', () => {
    expect(availabilityQuerySchema.safeParse({}).success).toBe(false);
  });

  it('rejects a checkout that is not after the check-in', () => {
    const result = availabilityQuerySchema.safeParse({
      checkIn: '2026-06-04',
      checkOut: '2026-06-01',
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['checkOut']);
    expect(result.error?.issues[0]?.message).toBe(
      'checkOut must be after checkIn',
    );
  });

  it('rejects a same-day stay, which has no nights in it', () => {
    expect(
      availabilityQuerySchema.safeParse({
        checkIn: '2026-06-01',
        checkOut: '2026-06-01',
      }).success,
    ).toBe(false);
  });

  it('rejects a malformed or impossible date', () => {
    for (const checkIn of ['01/06/2026', '2026-13-01', '2026-02-30', 'soon']) {
      expect(
        availabilityQuerySchema.safeParse({
          checkIn,
          checkOut: '2026-06-04',
        }).success,
      ).toBe(false);
    }
  });

  it('rejects a party size outside 1-20', () => {
    const range = { checkIn: '2026-06-01', checkOut: '2026-06-04' };

    expect(
      availabilityQuerySchema.safeParse({ ...range, guests: '0' }).success,
    ).toBe(false);
    expect(
      availabilityQuerySchema.safeParse({ ...range, guests: '21' }).success,
    ).toBe(false);
    expect(
      availabilityQuerySchema.safeParse({ ...range, guests: '2.5' }).success,
    ).toBe(false);
  });

  it('rejects a stay longer than the cap', () => {
    const result = availabilityQuerySchema.safeParse({
      checkIn: '2026-06-01',
      checkOut: '2026-09-01',
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['checkOut']);
  });

  it('accepts a stay of exactly the cap, because the bound is inclusive', () => {
    const checkOut = new Date(
      Date.parse('2026-06-01T00:00:00.000Z') + MAX_STAY_NIGHTS * 86_400_000,
    )
      .toISOString()
      .slice(0, 10);

    expect(
      availabilityQuerySchema.safeParse({ checkIn: '2026-06-01', checkOut })
        .success,
    ).toBe(true);
  });

  it('rejects the widest range a valid date can express, so it cannot be used to burn CPU', () => {
    expect(
      availabilityQuerySchema.safeParse({
        checkIn: '0001-01-01',
        checkOut: '9999-12-31',
      }).success,
    ).toBe(false);
  });
});

describe('quoteRequestSchema', () => {
  const valid = {
    roomId: ROOM_ID,
    checkIn: '2026-06-01',
    checkOut: '2026-06-04',
    guests: 2,
  };

  it('accepts the ticket body and defaults the currency to USD', () => {
    const parsed = quoteRequestSchema.parse(valid);

    expect(parsed.currency).toBe('USD');
    expect(parsed.roomId).toBe(ROOM_ID);
  });

  it('upper-cases the currency code', () => {
    expect(
      quoteRequestSchema.parse({ ...valid, currency: 'eur' }).currency,
    ).toBe('EUR');
  });

  it('rejects a non-ISO currency', () => {
    expect(
      quoteRequestSchema.safeParse({ ...valid, currency: 'DOLLARS' }).success,
    ).toBe(false);
  });

  it('rejects a room id that is not a uuid, so it cannot be interpolated into a query', () => {
    expect(
      quoteRequestSchema.safeParse({ ...valid, roomId: '1 OR 1=1' }).success,
    ).toBe(false);
  });

  it('rejects a checkout that is not after the check-in', () => {
    const result = quoteRequestSchema.safeParse({
      ...valid,
      checkIn: '2026-06-04',
      checkOut: '2026-06-01',
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['checkOut']);
  });

  it('rejects a same-day stay', () => {
    expect(
      quoteRequestSchema.safeParse({ ...valid, checkOut: '2026-06-01' })
        .success,
    ).toBe(false);
  });

  it('rejects a party size below one or above the platform cap', () => {
    expect(quoteRequestSchema.safeParse({ ...valid, guests: 0 }).success).toBe(
      false,
    );
    expect(quoteRequestSchema.safeParse({ ...valid, guests: 21 }).success).toBe(
      false,
    );
  });

  it('rejects a body missing the range entirely', () => {
    expect(
      quoteRequestSchema.safeParse({ roomId: ROOM_ID, guests: 2 }).success,
    ).toBe(false);
  });

  it('accepts a single-night stay, which is one night and not zero', () => {
    const parsed = quoteRequestSchema.parse({
      ...valid,
      checkOut: '2026-06-02',
    });

    expect(parsed.checkOut).toBe('2026-06-02');
  });

  it('does not require checkIn to be in the future, because the ticket sets no such rule', () => {
    const parsed = quoteRequestSchema.parse({
      ...valid,
      checkIn: '2020-01-01',
      checkOut: '2020-01-03',
    });

    expect(parsed.checkIn).toBe('2020-01-01');
  });

  it('rejects a stay longer than the cap, because a quote walks every night', () => {
    const result = quoteRequestSchema.safeParse({
      ...valid,
      checkIn: '2026-06-01',
      checkOut: '2026-09-01',
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['checkOut']);
  });

  it('rejects the widest range a valid date can express', () => {
    expect(
      quoteRequestSchema.safeParse({
        ...valid,
        checkIn: '0001-01-01',
        checkOut: '9999-12-31',
      }).success,
    ).toBe(false);
  });
});
