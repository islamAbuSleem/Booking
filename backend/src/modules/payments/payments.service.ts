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

  async getPayment(callerId: string, bookingId: string): Promise<PaymentDto> {
    await this.requireOwnedBooking(callerId, bookingId);
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

  private async requireOwnedBooking(callerId: string, bookingId: string): Promise<BookingRecord> {
    const booking = await this.bookings.findById(bookingId);
    if (!booking) throw notFound('BOOKING_NOT_FOUND', 'Booking not found');
    if (booking.guestId !== callerId) {
      throw forbidden('NOT_BOOKING_OWNER', 'This booking belongs to another guest');
    }
    return booking;
  }
}
