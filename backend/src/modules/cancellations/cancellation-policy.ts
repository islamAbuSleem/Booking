/**
 * T37 — the refund arithmetic, as a pure function.
 *
 * No clock reads inside: `nowMs` is passed in, so the calculation is fully testable
 * (tier boundaries, the no-refund window, the exact boundary day, and the fully
 * refundable early case all pin a timestamp). The API calls this exactly once per
 * cancellation quote, from the whole elapsed time between now and check-in.
 */

export interface PolicyTier {
  daysBefore: number;
  refundPercent: number;
}

export interface PolicyView {
  tiers: PolicyTier[];
  noRefundWithinHours: number;
}

/**
 * The fallback for a hotel with no stored policy. Free cancellation until 30 days,
 * half back until 7 days, nothing inside 24 hours: the same shape a host would write,
 * so the default reads as a policy rather than as an absence of one.
 */
export const DEFAULT_POLICY: PolicyView = {
  tiers: [
    { daysBefore: 30, refundPercent: 100 },
    { daysBefore: 7, refundPercent: 50 },
  ],
  noRefundWithinHours: 24,
};

/** Version stamped on quotes priced against the default (no stored row). */
export const DEFAULT_POLICY_VERSION = 0;

/**
 * The refund percentage for cancelling at `nowMs` a stay starting at `checkInMs`.
 * The no-refund window wins over every tier, and a boundary is inclusive: cancelling
 * at exactly `daysBefore` days qualifies for that tier.
 */
export function quoteRefundPercent(args: {
  nowMs: number;
  checkInMs: number;
  policy: PolicyView;
}): number {
  const hoursBefore = (args.checkInMs - args.nowMs) / 3_600_000;
  if (hoursBefore < args.policy.noRefundWithinHours) return 0;
  const tiers = [...args.policy.tiers].sort((a, b) => b.daysBefore - a.daysBefore);
  for (const tier of tiers) {
    if (hoursBefore >= tier.daysBefore * 24) return tier.refundPercent;
  }
  return 0;
}

/** Integer cents, rounded half up. A 0% quote is exactly 0, never a fee. */
export function refundCents(totalCents: number, refundPercent: number): number {
  return Math.round((totalCents * refundPercent) / 100);
}
