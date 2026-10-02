/**
 * T26 — the payments persistence contract, expressed in domain terms.
 *
 * The payments service depends on this interface, never on `PrismaService`: the
 * one-row-per-booking invariant is then testable with a stub and no database.
 * `PrismaPaymentsRepository` is the one implementation, and it is the only place a
 * Prisma type appears.
 *
 * Money is integer cents in the booking's own currency — the row snapshots what the
 * PaymentIntent was created for, and the API never accepts a client-sent amount (D3).
 */

export const PAYMENTS_REPOSITORY = Symbol('PAYMENTS_REPOSITORY');

export type PaymentStatus = 'requires_payment' | 'succeeded' | 'refunded' | 'failed';

export interface PaymentRecord {
  id: string;
  bookingId: string;
  stripePaymentIntentId: string;
  amountCents: number;
  currency: string;
  status: PaymentStatus;
  receiptUrl: string | null;
  createdAt: Date;
}

export interface UpsertPaymentData {
  bookingId: string;
  stripePaymentIntentId: string;
  amountCents: number;
  currency: string;
  status: PaymentStatus;
}

export interface PaymentsRepository {
  /** Null when no intent has been created for the booking yet. */
  findByBooking(bookingId: string): Promise<PaymentRecord | null>;
  /**
   * One row per booking: `booking_id` is unique, so a repeated intent for the same
   * booking replaces the row rather than appending a second one. The Stripe-side
   * dedupe is the idempotency key; this is the local one.
   */
  upsert(data: UpsertPaymentData): Promise<PaymentRecord>;
}
