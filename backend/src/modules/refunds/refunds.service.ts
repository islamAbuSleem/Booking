import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ApiError, forbidden, notFound } from '../../common/errors/api-error.js';
import {
  BOOKINGS_REPOSITORY,
  type BookingRecord,
  type BookingRepository,
} from '../../prisma/bookings.repository.js';
import {
  PAYMENTS_REPOSITORY,
  type PaymentsRepository,
} from '../../prisma/payments.repository.js';
import {
  REFUNDS_REPOSITORY,
  type RefundRecord,
  type RefundsRepository,
} from '../../prisma/refunds.repository.js';
import { STRIPE_CLIENT, type StripeClient } from '../payments/stripe.client.js';
import { stripeFailure } from '../payments/stripe.client.js';
import { CancellationService } from '../cancellations/cancellations.service.js';
import type { RefundDto, RefundListData } from './dto/refund.dto.js';

/**
 * The cancellation outcome, in domain terms: the booking row in its new state and the
 * attempt the cancellation produced. The `BookingDto` wire shape is not built here —
 * the booking's hotel snapshot is the bookings module's business, and this module has no
 * route into it (see `BookingsService.describe`).
 */
export interface CancelOutcome {
  booking: BookingRecord;
  refund: RefundDto | null;
}

/**
 * T38 — the refund rules.
 *
 * The refund invariant (D11) is **at most one `succeeded` row per booking**, not at most
 * one attempt. A failed Stripe call must never strand a guest's money, so:
 *
 *   - `cancel` on a `CONFIRMED` booking flips it to `CANCELLED` **first**, then appends
 *     the refund attempt and calls Stripe. The flip is unconditional because the stay is
 *     over either way; the refund is the part that can fail, and it failing leaves the
 *     booking cancelled and the row `failed`, with a retry as the way back.
 *   - `cancel` on an already-`CANCELLED` booking is a **read**: it answers with the
 *     existing refund and its status. A duplicate cancel is not a double charge and not
 *     an error.
 *   - `retry` appends a **new** row and calls Stripe again. If any row has already
 *     succeeded it answers 409 `ALREADY_REFUNDED` — the one thing that must never happen
 *     twice.
 *
 * Every amount comes from T37's quote, computed once per cancellation and pinned onto
 * the row. No route accepts a client-sent amount (D3).
 *
 * Depends on repository interfaces and the Stripe boundary token, never on `PrismaService`
 * or the Stripe SDK directly (context/code-standards.md, "Dependency inversion"), so every
 * rule below is testable with fakes and no network.
 */
@Injectable()
export class RefundsService {
  private readonly logger = new Logger(RefundsService.name);

  constructor(
    @Inject(BOOKINGS_REPOSITORY) private readonly bookings: BookingRepository,
    @Inject(PAYMENTS_REPOSITORY) private readonly payments: PaymentsRepository,
    @Inject(REFUNDS_REPOSITORY) private readonly refunds: RefundsRepository,
    @Inject(STRIPE_CLIENT) private readonly stripe: StripeClient,
    @Inject(CancellationService) private readonly cancellations: CancellationService,
  ) {}

  /**
   * `POST /api/bookings/:id/cancel`.
   *
   * Five answers, cheapest-first:
   *   1. No such booking → 404 `BOOKING_NOT_FOUND`.
   *   2. Not the caller's → 403 `NOT_BOOKING_OWNER` (the T20 shape).
   *   3. Already `CANCELLED` → the existing refund. A read, not a 409.
   *   4. Not `CONFIRMED` → 409 `INVALID_CANCEL_STATE`: a `PENDING` hold is unpaid and a
   *      `COMPLETED` stay is past cancelling.
   *   5. Nothing captured → 400 `NO_CAPTURED_PAYMENT`: a stay that never took money has
   *      nothing to put back.
   */
  async cancel(callerId: string, bookingId: string): Promise<CancelOutcome> {
    const booking = await this.requireOwnedBooking(callerId, bookingId);

    if (booking.status === 'CANCELLED') {
      return this.readCancellation(booking);
    }
    if (booking.status !== 'CONFIRMED') {
      throw new ApiError(
        HttpStatus.CONFLICT,
        'INVALID_CANCEL_STATE',
        'Only a confirmed booking can be cancelled',
      );
    }

    // The amount is decided while the booking is still CONFIRMED, and for two reasons:
    // T37's quote guard *is* that state, and a cancellation must not be allowed to
    // change the price it was quoted at. Refusing before the flip also means a booking
    // with nothing captured is never cancelled for a refund it cannot make.
    const quote = await this.cancellations.quote(booking.guestId, booking.id, Date.now());
    const payment = await this.payments.findByBooking(booking.id);
    if (!payment || payment.status !== 'succeeded') {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        'NO_CAPTURED_PAYMENT',
        'This booking has no captured payment to refund',
      );
    }

    // The stay is over either way, so the flip goes before the Stripe call and
    // unconditionally. Doing it after would leave a `CONFIRMED` booking holding
    // inventory for a stay the guest has cancelled whenever the provider is slow or down.
    const flipped = await this.bookings.transitionStatus(
      booking.id,
      'CONFIRMED',
      'CANCELLED',
    );
    if (!flipped) {
      // The row moved between the read and the write — most likely a duplicate cancel
      // landing concurrently. Re-read and answer as the read path does.
      const current = await this.bookings.findById(booking.id);
      if (current && current.status === 'CANCELLED') {
        return this.readCancellation(current);
      }
      throw new ApiError(
        HttpStatus.CONFLICT,
        'INVALID_CANCEL_STATE',
        'Only a confirmed booking can be cancelled',
      );
    }

    const attempt = await this.refunds.createAttempt({
      bookingId: flipped.id,
      paymentId: payment.id,
      // From the quote, computed once and pinned onto the row: a later policy edit can
      // never rewrite what this cancellation was actually paid.
      amountCents: quote.refundCents,
      currency: quote.currency,
      percent: quote.refundPercent,
      attempts: 1,
      reason: 'guest_cancellation',
    });
    const settled = await this.callStripe(
      attempt,
      payment.stripePaymentIntentId,
      flipped.reference,
    );
    this.logger.log(
      `[refunds] cancelled ${flipped.reference} with a ${settled.status} refund`,
    );
    return { booking: flipped, refund: toRefundDto(settled) };
  }

  /**
   * `POST /api/bookings/:id/refund/retry` — the way back from a `failed` attempt.
   *
   * A `succeeded` row anywhere on the booking blocks this outright (409
   * `ALREADY_REFUNDED`), which is the D11 invariant enforced rather than hoped for.
   */
  async retry(callerId: string, bookingId: string): Promise<RefundDto> {
    const booking = await this.requireOwnedBooking(callerId, bookingId);
    if (booking.status !== 'CANCELLED') {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        'INVALID_CANCEL_STATE',
        'Only a cancelled booking can be refunded',
      );
    }
    if (await this.refunds.hasSucceeded(booking.id)) {
      throw new ApiError(
        HttpStatus.CONFLICT,
        'ALREADY_REFUNDED',
        'This booking has already been refunded',
      );
    }

    const previous = await this.refunds.findLatestByBooking(booking.id);
    const payment = await this.payments.findByBooking(booking.id);
    if (!previous || !payment) {
      // A cancelled booking with no attempt and no payment is not a refund problem: the
      // hold was never paid, so there is nothing to put back.
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        'NO_CAPTURED_PAYMENT',
        'This booking has no captured payment to refund',
      );
    }

    const attempt = await this.refunds.createAttempt({
      bookingId: booking.id,
      paymentId: payment.id,
      amountCents: previous.amountCents,
      currency: previous.currency,
      percent: previous.percent,
      attempts: previous.attempts + 1,
      reason: 'retry',
    });

    const settled = await this.callStripe(
      attempt,
      payment.stripePaymentIntentId,
      booking.reference,
    );
    this.logger.log(
      `[refunds] retry ${settled.attempts} for booking ${booking.reference} -> ${settled.status}`,
    );
    return toRefundDto(settled);
  }

  /** `GET /api/bookings/:id/refunds` — the ledger, newest attempt first. */
  async list(callerId: string, bookingId: string): Promise<RefundListData> {
    await this.requireOwnedBooking(callerId, bookingId);
    const records = await this.refunds.findByBooking(bookingId);
    const items = records.map(toRefundDto);
    return { items, total: items.length };
  }

  /**
   * Call Stripe for one attempt and settle the row on whatever it answers.
   *
   * A thrown SDK error becomes a `failed` row rather than a 5xx: the booking is already
   * cancelled, the guest's money is the thing at stake, and a 502 tells them nothing they
   * can act on. The row stays `failed` so `retry` is the way back, which is exactly the
   * invariant D11 protects.
   */
  private async callStripe(
    attempt: RefundRecord,
    paymentIntentId: string,
    reference: string,
  ): Promise<RefundRecord> {
    try {
      const created = await this.stripe.createRefund({
        paymentIntentId,
        amountCents: attempt.amountCents,
        currency: attempt.currency,
        bookingId: attempt.bookingId,
        reference,
        idempotencyKey: RefundsService.refundKey(reference, attempt.attempts),
      });
      // A `pending` answer leaves the row pending for the webhook to settle: there is
      // nothing to move yet, and writing `pending` over `pending` is a no-op.
      if (created.status === 'pending') return attempt;
      const settled = await this.refunds.settle(attempt.id, {
        stripeRefundId: created.refundId,
        status: created.status,
      });
      return settled ?? attempt;
    } catch (error: unknown) {
      this.logger.error(
        `[refunds] stripe call for booking ${reference} failed on attempt ${attempt.attempts}`,
      );
      const failure = stripeFailure(error);
      // A provider *refusal* (amount under the currency minimum, unknown currency) fails
      // identically on every retry, so it is the one failure worth surfacing rather than
      // banking as a retryable `failed` row.
      if (failure.status === HttpStatus.BAD_REQUEST) {
        throw new ApiError(failure.status, failure.code, failure.message);
      }
      const settled = await this.refunds.settle(attempt.id, { status: 'failed' });
      return settled ?? attempt;
    }
  }

  /** The read path for a duplicate cancel: the existing refund, never a second charge. */
  private async readCancellation(booking: BookingRecord): Promise<CancelOutcome> {
    const existing = await this.refunds.findLatestByBooking(booking.id);
    return {
      booking,
      refund: existing ? toRefundDto(existing) : null,
    };
  }

  private async requireOwnedBooking(
    callerId: string,
    bookingId: string,
  ): Promise<BookingRecord> {
    const booking = await this.bookings.findById(bookingId);
    if (!booking) throw notFound('BOOKING_NOT_FOUND', 'Booking not found');
    if (booking.guestId !== callerId) {
      throw forbidden('NOT_BOOKING_OWNER', 'This booking belongs to another guest');
    }
    return booking;
  }

  /** Deterministic per attempt: a retry is a new call, a redelivery is not. */
  static refundKey(reference: string, attempts: number): string {
    return `refunds:${reference}:${attempts}`;
  }
}

function toRefundDto(record: RefundRecord): RefundDto {
  return {
    id: record.id,
    bookingId: record.bookingId,
    amountCents: record.amountCents,
    currency: record.currency,
    percent: record.percent,
    status: record.status,
    attempts: record.attempts,
    createdAt: record.createdAt.toISOString(),
  };
}
