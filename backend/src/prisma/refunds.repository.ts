/**
 * T38 — the refund ledger contract, expressed in domain terms.
 *
 * The refunds service depends on this interface, never on `PrismaService`: the
 * "at most one `succeeded` row" invariant is then testable with a stub and no database.
 * `PrismaRefundsRepository` is the one implementation, and it is the only place a Prisma
 * type appears.
 *
 * **Append-only, with one exception.** A row's amount, currency and percent are written
 * once and never rewritten — a retry appends a new row (`createAttempt`) rather than
 * editing the failed one, which is what makes the ledger a history rather than a status
 * column. The exception is `settle`, which moves only `status` (and the Stripe id once
 * known) and exists because confirmation is webhook-driven: a `pending` row has to be
 * able to say `succeeded` or `failed`.
 */

export const REFUNDS_REPOSITORY = Symbol('REFUNDS_REPOSITORY');

export type RefundStatus = 'pending' | 'succeeded' | 'failed';

export interface RefundRecord {
  id: string;
  bookingId: string;
  paymentId: string;
  stripeRefundId: string | null;
  amountCents: number;
  currency: string;
  percent: number;
  reason: string | null;
  status: RefundStatus;
  attempts: number;
  createdAt: Date;
}

/** Everything an attempt needs. The money always comes from T37's quote (D3). */
export interface CreateRefundInput {
  bookingId: string;
  paymentId: string;
  amountCents: number;
  currency: string;
  percent: number;
  reason?: string | null;
  /** 1 for the cancellation's own refund, previous + 1 for a retry. */
  attempts: number;
}

export interface SettleRefundInput {
  /** Null while the attempt is pending: Stripe answers with one once it accepts. */
  stripeRefundId?: string | null;
  status: 'succeeded' | 'failed';
}

export interface RefundsRepository {
  /**
   * Append an attempt. Never edits an existing row, so the ledger keeps every try.
   */
  createAttempt(input: CreateRefundInput): Promise<RefundRecord>;
  /**
   * Move one attempt's outcome, and only that: `status` plus the Stripe id. A row
   * already on a terminal status is left alone, so a redelivered webhook cannot
   * walk a settled refund backwards.
   */
  settle(refundId: string, input: SettleRefundInput): Promise<RefundRecord | null>;
  /** The newest attempt first. `null` when this booking has never been refunded. */
  findLatestByBooking(bookingId: string): Promise<RefundRecord | null>;
  /** Every attempt, newest first — the ledger the guest reads. */
  findByBooking(bookingId: string): Promise<RefundRecord[]>;
  /** The attempt a Stripe webhook names, by its Stripe refund id. */
  findByStripeRefundId(stripeRefundId: string): Promise<RefundRecord | null>;
  /** True when any attempt for this booking reached `succeeded`. The D11 invariant. */
  hasSucceeded(bookingId: string): Promise<boolean>;
}
