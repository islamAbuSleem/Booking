import {
  DEFAULT_POLICY,
  quoteRefundPercent,
  refundCents,
} from './cancellation-policy.js';

/**
 * T37 — the refund arithmetic, pinned without a clock: every case passes its own
 * `nowMs`, so a boundary is a boundary on any machine on any day.
 */
const DAY_MS = 24 * 3_600_000;
const CHECK_IN = Date.parse('2026-08-01T00:00:00Z');

describe('quoteRefundPercent', () => {
  it('refunds 100% for a fully refundable early cancellation', async () => {
    expect(
      quoteRefundPercent({
        nowMs: CHECK_IN - 60 * DAY_MS,
        checkInMs: CHECK_IN,
        policy: DEFAULT_POLICY,
      }),
    ).toBe(100);
  });

  it('walks the tier boundaries highest-first', async () => {
    // 30 days -> 100, 29 days -> 50, 7 days -> 50, 6 days -> 0.
    expect(
      quoteRefundPercent({ nowMs: CHECK_IN - 30 * DAY_MS, checkInMs: CHECK_IN, policy: DEFAULT_POLICY }),
    ).toBe(100);
    expect(
      quoteRefundPercent({ nowMs: CHECK_IN - 29 * DAY_MS, checkInMs: CHECK_IN, policy: DEFAULT_POLICY }),
    ).toBe(50);
    expect(
      quoteRefundPercent({ nowMs: CHECK_IN - 7 * DAY_MS, checkInMs: CHECK_IN, policy: DEFAULT_POLICY }),
    ).toBe(50);
    expect(
      quoteRefundPercent({ nowMs: CHECK_IN - 6 * DAY_MS, checkInMs: CHECK_IN, policy: DEFAULT_POLICY }),
    ).toBe(0);
  });

  it('qualifies a cancellation at exactly the boundary day for that tier', async () => {
    // Boundaries are inclusive: exactly 7 days is the 50% tier, not the 0% gap below it.
    expect(
      quoteRefundPercent({
        nowMs: CHECK_IN - 7 * DAY_MS,
        checkInMs: CHECK_IN,
        policy: DEFAULT_POLICY,
      }),
    ).toBe(50);
    expect(
      quoteRefundPercent({
        nowMs: CHECK_IN - 30 * DAY_MS,
        checkInMs: CHECK_IN,
        policy: DEFAULT_POLICY,
      }),
    ).toBe(100);
  });

  it('returns 0 inside the no-refund window whatever the tiers say', async () => {
    // 12 hours out would sit in no tier at all, but the window is the explicit case:
    // 23 hours is inside the 24-hour window even though a tier starts at 0 days.
    const policy = {
      tiers: [{ daysBefore: 0, refundPercent: 100 }],
      noRefundWithinHours: 24,
    };
    expect(
      quoteRefundPercent({
        nowMs: CHECK_IN - 23 * 3_600_000,
        checkInMs: CHECK_IN,
        policy,
      }),
    ).toBe(0);
    expect(
      quoteRefundPercent({
        nowMs: CHECK_IN - 24 * 3_600_000,
        checkInMs: CHECK_IN,
        policy,
      }),
    ).toBe(100);
  });

  it('returns 0 after check-in has passed', async () => {
    expect(
      quoteRefundPercent({
        nowMs: CHECK_IN + DAY_MS,
        checkInMs: CHECK_IN,
        policy: DEFAULT_POLICY,
      }),
    ).toBe(0);
  });
});

describe('refundCents', () => {
  it('is the percent of the total, rounded half up, in integer cents', async () => {
    expect(refundCents(10000, 100)).toBe(10000);
    expect(refundCents(10000, 50)).toBe(5000);
    expect(refundCents(999, 50)).toBe(500);
    expect(refundCents(10000, 0)).toBe(0);
  });
});
