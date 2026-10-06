import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ApiError, forbidden, notFound } from '../../common/errors/api-error.js';
import type Stripe from 'stripe';
import {
  BOOKINGS_REPOSITORY,
  type BookingRecord,
  type BookingRepository,
} from '../../prisma/bookings.repository.js';
import {
  PAYMENTS_REPOSITORY,
  type PaymentRecord,
  type PaymentStatus,
  type PaymentsRepository,
} from '../../prisma/payments.repository.js';
import type { IntentData, IntentRequest, PaymentDto } from './dto/payment.dto.js';
import { STRIPE_CLIENT, type StripeClient } from './stripe.client.js';

/**
 * T26 — payment intents. The browser confirms with Stripe.js; the API only ever
 * *creates* the intent and *reads* the row. Confirmation arrives via webhook (T27),
 * never from the browser's "payment succeeded" claim (D3).
 *
 * The rules, cheapest-first:
 *
 *   1. No such booking → 404 `BOOKING_NOT_FOUND`.
 *   2. Not the caller's booking → 403 `NOT_BOOKING_OWNER` (the T20 shape).
 *   3. Booking not PENDING → 400 `INVALID_PAYMENT_STATE`: only an unpaid hold can
 *      take an intent, and the request carries no amount to argue with.
 *   4. Otherwise create the intent with the booking's server-computed total and an
 *      idempotency key derived from the booking reference, then upsert the single
 *      payment row. A repeated call is the same Stripe call, not a second charge.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @Inject(BOOKINGS_REPOSITORY) private readonly bookings: BookingRepository,
    @Inject(PAYMENTS_REPOSITORY) private readonly payments: PaymentsRepository,
    @Inject(STRIPE_CLIENT) private readonly stripe: StripeClient,
  ) {}

  /** The Stripe idempotency key: stable per booking, human-matchable in support. */
  static intentKey(reference: string): string {
    return `payments-intent:${reference}`;
  }

  async createIntent(callerId: string, input: IntentRequest): Promise<IntentData> {
    const booking = await this.requireOwnedBooking(callerId, input.bookingId);
    if (booking.status !== 'PENDING') {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        'INVALID_PAYMENT_STATE',
        'Only pending bookings can take a payment',
      );
    }
    if (booking.holdExpiresAt && booking.holdExpiresAt <= new Date()) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        'HOLD_EXPIRED',
        'The booking hold has expired',
      );
    }

    const intent = await this.stripe.createIntent({
      amountCents: booking.totalCents,
      currency: booking.currency,
      bookingId: booking.id,
      reference: booking.reference,
      idempotencyKey: PaymentsService.intentKey(booking.reference),
    });

    await this.payments.upsert({
      bookingId: booking.id,
      stripePaymentIntentId: intent.paymentIntentId,
      amountCents: booking.totalCents,
      currency: booking.currency,
      status: intent.status,
    });
    this.logger.log(`[payments] intent ${intent.paymentIntentId} for booking ${booking.reference}`);

    return {
      clientSecret: intent.clientSecret,
      paymentIntentId: intent.paymentIntentId,
      amountCents: booking.totalCents,
      currency: booking.currency,
    };
  }

  async getPayment(callerId: string, bookingId: string): Promise<PaymentDto> {    await this.requireOwnedBooking(callerId, bookingId);
    const payment = await this.payments.findByBooking(bookingId);
    if (!payment) {
      throw notFound('PAYMENT_NOT_FOUND', 'No payment has been started for this booking');
    }
    return {
      id: payment.id,
      bookingId: payment.bookingId,
      stripePaymentIntentId: payment.stripePaymentIntentId,
      amountCents: payment.amountCents,
      currency: payment.currency,
      status: payment.status,
      receiptUrl: payment.receiptUrl,
      createdAt: payment.createdAt.toISOString(),
    };
  }

  /**
   * T27 — the webhook entry point. Verifies first, dispatches second: nothing below
   * runs on an unverified body, and the signature header missing entirely is the same
   * 400 as a forged one (there is no "anonymous but well-formed" webhook).
   */
  async handleWebhook(rawBody: Buffer | string | undefined, signature: string | undefined): Promise<void> {
    if (!rawBody || !signature) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        'INVALID_SIGNATURE',
        'The webhook signature is invalid',
      );
    }
    const event = await this.stripe.verifyWebhook(rawBody, signature);
    await this.dispatchWebhookEvent(event);
  }

  /**
   * Stripe retries every event until it gets a 200, so each arm must be safe to run
   * twice: the conditional transition flips at most once (a retry finds nothing in
   * `from` and writes nothing), and unknown types are logged and ignored rather than
   * erroring the delivery into a retry loop.
   */
  private async dispatchWebhookEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'payment_intent.succeeded':
        await this.onPaymentSucceeded(event.data.object as Stripe.PaymentIntent);
        break;
      case 'payment_intent.payment_failed':
        await this.onPaymentFailed(event.data.object as Stripe.PaymentIntent);
        break;
      default:
        this.logger.log(`[payments] ignored webhook event ${event.type}`);
        break;
    }
  }

  private async onPaymentSucceeded(intent: Stripe.PaymentIntent): Promise<void> {
    const payment = await this.payments.findByIntent(intent.id);
    if (!payment) {
      // Not one of ours — possibly a different Stripe account's intent replayed here.
      // Warn loudly, change nothing, still 200: Stripe must not retry what we will
      // never accept.
      this.logger.warn(`[payments] succeeded intent ${intent.id} matches no booking`);
      return;
    }
    const flipped = await this.bookings.transitionStatus(payment.bookingId, 'PENDING', 'CONFIRMED');
    if (!flipped) {
      // The flip already happened. That is either an ordinary redelivery or the retry of
      // a partial write (the flip landed, the payment row did not) — and it is the second
      // case that makes a bare "duplicate event" return wrong: a CONFIRMED booking stuck
      // reading `requires_payment` with no receipt has no retry left to heal it. So the
      // payment row is reconciled rather than assumed.
      await this.reconcile(payment, 'succeeded', await this.stripe.receiptUrl(intent), 'CONFIRMED');
      return;
    }
    await this.payments.upsert({
      bookingId: payment.bookingId,
      stripePaymentIntentId: intent.id,
      amountCents: payment.amountCents,
      currency: payment.currency,
      status: 'succeeded',
      receiptUrl: await this.stripe.receiptUrl(intent),
    });
    this.logger.log(`[payments] booking ${flipped.reference} CONFIRMED by intent ${intent.id}`);
  }

  private async onPaymentFailed(intent: Stripe.PaymentIntent): Promise<void> {
    const payment = await this.payments.findByIntent(intent.id);
    if (!payment) {
      this.logger.warn(`[payments] failed intent ${intent.id} matches no booking`);
      return;
    }
    // Only a PENDING hold is released. A late failure for an already-CONFIRMED stay
    // must not cancel it — the money moved, and the failure is Stripe's stale news.
    const flipped = await this.bookings.transitionStatus(payment.bookingId, 'PENDING', 'CANCELLED');
    if (!flipped) {
      // Same partial-write hazard as the success arm, mirrored: a redelivered failure must
      // still land on the payment row, or the released hold keeps reading `succeeded`.
      await this.reconcile(payment, 'failed', payment.receiptUrl, 'CANCELLED');
      return;
    }
    await this.payments.upsert({
      bookingId: payment.bookingId,
      stripePaymentIntentId: intent.id,
      amountCents: payment.amountCents,
      currency: payment.currency,
      status: 'failed',
    });
    this.logger.log(`[payments] booking ${flipped.reference} CANCELLED by failed intent ${intent.id}`);
  }

  /**
   * Writes the payment row for an event whose booking flip had already happened.
   *
   * `settledOn` is the booking state this event's outcome implies: a `succeeded` event
   * needs the stay kept, a `failed` one the hold released. A booking sitting anywhere else
   * was moved by something other than this event, so nothing is written — reconciling
   * across such a gap would claim a stay that was not kept, or reopen a released hold.
   */
  private async reconcile(
    payment: PaymentRecord,
    status: PaymentStatus,
    receiptUrl: string | null,
    settledOn: 'CONFIRMED' | 'CANCELLED',
  ): Promise<void> {
    const booking = await this.bookings.findById(payment.bookingId);
    if (!booking || booking.status !== settledOn) {
      this.logger.log(`[payments] ${status} event for booking ${payment.bookingId} arrived after ${booking?.status ?? 'a missing booking'}`);
      return;
    }
    await this.payments.upsert({
      bookingId: payment.bookingId,
      stripePaymentIntentId: payment.stripePaymentIntentId,
      amountCents: payment.amountCents,
      currency: payment.currency,
      status,
      receiptUrl,
    });
    this.logger.log(`[payments] payment row for booking ${payment.bookingId} reconciled to ${status}`);
  }

  private async requireOwnedBooking(callerId: string, bookingId: string): Promise<BookingRecord> {
    const booking = await this.bookings.findById(bookingId);
    if (!booking) throw notFound('BOOKING_NOT_FOUND', 'Booking not found');
    if (booking.guestId !== callerId) {
      throw forbidden('NOT_BOOKING_OWNER', 'This booking belongs to another guest');
    }
    return booking;
  }
}
