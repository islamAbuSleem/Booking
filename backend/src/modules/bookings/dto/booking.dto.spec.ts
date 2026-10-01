import { MAX_STAY_NIGHTS } from './availability.dto.js';
import { bookingIdParam, createBookingSchema } from './booking.dto.js';

/**
 * T20 — the request contract, pinned. The two rules worth their own tests: the body has
 * NO money fields (a client-sent total is stripped, not trusted), and the range keeps T18's
 * half-open rule.
 */
const ROOM_ID = '22222222-2222-4222-8222-222222222222';

const valid = {
  roomId: ROOM_ID,
  checkIn: '2026-06-01',
  checkOut: '2026-06-04',
  guests: 2,
  guestName: 'Ada Lovelace',
  guestEmail: 'ada@example.com',
  guestPhone: '+351 21 000 0000',
};

describe('createBookingSchema', () => {
  it('accepts the ticket body, with or without a currency', () => {
    const parsed = createBookingSchema.parse(valid);

    expect(parsed.roomId).toBe(ROOM_ID);
    expect(parsed.guests).toBe(2);
    expect(parsed.currency).toBeUndefined();

    const withCurrency = createBookingSchema.parse({
      ...valid,
      currency: 'USD',
    });
    expect(withCurrency.currency).toBe('USD');
  });

  it('upper-cases the currency code, like the quote does', () => {
    expect(
      createBookingSchema.parse({ ...valid, currency: 'eur' }).currency,
    ).toBe('EUR');
  });

  it('rejects a non-ISO currency', () => {
    expect(
      createBookingSchema.safeParse({ ...valid, currency: 'DOLLARS' }).success,
    ).toBe(false);
  });

  it('strips client-sent money: the totals are a server snapshot, never a request field', () => {
    // D3, made structural. A body that brings numbers still only carries the ones the
    // schema declares, so the service arithmetic cannot be pre-empted.
    const parsed = createBookingSchema.parse({
      ...valid,
      subtotalCents: 99_999,
      totalCents: 1,
      feesCents: 7,
      priceCents: 3,
    });

    expect('subtotalCents' in parsed).toBe(false);
    expect('totalCents' in parsed).toBe(false);
    expect('feesCents' in parsed).toBe(false);
    expect('priceCents' in parsed).toBe(false);
  });

  it('rejects a checkout that is not after the check-in', () => {
    const result = createBookingSchema.safeParse({
      ...valid,
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
      createBookingSchema.safeParse({ ...valid, checkOut: '2026-06-01' })
        .success,
    ).toBe(false);
  });

  it('rejects a malformed date', () => {
    for (const checkIn of ['01/06/2026', '2026-02-30', 'soon']) {
      expect(createBookingSchema.safeParse({ ...valid, checkIn }).success).toBe(
        false,
      );
    }
  });

  it('rejects a party size outside 1-20', () => {
    expect(createBookingSchema.safeParse({ ...valid, guests: 0 }).success).toBe(
      false,
    );
    expect(
      createBookingSchema.safeParse({ ...valid, guests: 21 }).success,
    ).toBe(false);
    expect(
      createBookingSchema.safeParse({ ...valid, guests: 2.5 }).success,
    ).toBe(false);
  });

  it('requires a lead-guest name and a valid email', () => {
    expect(
      createBookingSchema.safeParse({ ...valid, guestName: '' }).success,
    ).toBe(false);
    expect(
      createBookingSchema.safeParse({ ...valid, guestEmail: 'not-an-email' })
        .success,
    ).toBe(false);
    expect(createBookingSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects a room id that is not a uuid, so it cannot be interpolated into a query', () => {
    expect(
      createBookingSchema.safeParse({ ...valid, roomId: '1 OR 1=1' }).success,
    ).toBe(false);
  });

  it('rejects a stay longer than the shared cap, which would overflow the money columns', () => {
    // One over `MAX_STAY_NIGHTS` is a 400, not a 500 from the `Int` overflow, and it is
    // the same bound the quote and the availability read use.
    const checkOut = new Date(
      Date.parse(`${valid.checkIn}T00:00:00.000Z`) +
        (MAX_STAY_NIGHTS + 1) * 86_400_000,
    )
      .toISOString()
      .slice(0, 10);

    expect(createBookingSchema.safeParse({ ...valid, checkOut }).success).toBe(
      false,
    );
    expect(
      createBookingSchema.safeParse({ ...valid, checkOut: '2026-06-30' })
        .success,
    ).toBe(true);
  });

  it('rejects a stay spanning the whole representable calendar', () => {
    const result = createBookingSchema.safeParse({
      ...valid,
      checkIn: '0001-01-01',
      checkOut: '9999-12-31',
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain(
      `${MAX_STAY_NIGHTS} nights`,
    );
  });

  it('does not require checkIn to be in the future: the ticket sets no such rule', () => {
    expect(
      createBookingSchema.parse({
        ...valid,
        checkIn: '2020-01-01',
        checkOut: '2020-01-03',
      }).checkIn,
    ).toBe('2020-01-01');
  });
});

describe('bookingIdParam', () => {
  it('accepts a uuid and rejects anything else', () => {
    expect(bookingIdParam.safeParse({ id: ROOM_ID }).success).toBe(true);
    expect(bookingIdParam.safeParse({ id: 'GB-4821' }).success).toBe(false);
    expect(bookingIdParam.safeParse({}).success).toBe(false);
  });
});
