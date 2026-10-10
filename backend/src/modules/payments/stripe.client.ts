import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { ApiError, type ErrorCode } from '../../common/errors/api-error.js';

/**
 * T26 — the Stripe boundary, behind a DI token.
 *
 * The service depends on this interface, never on the SDK: the idempotency-key rule
 * is then testable with a recorder and no network. `StripePaymentClient` is the one
 * implementation, and it is the only place the `stripe` package appears.
 */

export const STRIPE_CLIENT = Symbol('STRIPE_CLIENT');

export interface CreateIntentInput {
  /** Integer cents. The booking's server-computed total — never a client-sent amount. */
  amountCents: number;
  /** Uppercase ISO 4217, as stored. Lowercased at the edge: Stripe wants `usd`. */
  currency: string;
  bookingId: string;
  reference: string;
  /**
   * Deterministic per booking, so a retry is the same Stripe call rather than a second
   * charge. Derived from the human-readable reference, not the uuid, so support can
   * match a Stripe dashboard row to the guest's email without a database lookup.
   */
  idempotencyKey: string;
}

export interface CreatedIntent {
  paymentIntentId: string;
  clientSecret: string;
  status: 'requires_payment' | 'succeeded' | 'failed';
}

export interface CreateRefundInput {
  /** The original PaymentIntent to refund against — never a client-sent id. */
  paymentIntentId: string;
  /** Integer cents from T37's quote. Never a client-sent amount (D3). */
  amountCents: number;
  currency: string;
  bookingId: string;
  reference: string;
  /**
   * Deterministic per *attempt*, so a retry is a new Stripe call while a redelivery of
   * the same attempt is not. Derived from the reference plus the attempt number, so a
   * duplicated cancel can never produce a second charge back to the guest.
   */
  idempotencyKey: string;
}

export interface CreatedRefund {
  /** Null until Stripe answers with one — a pending attempt carries nothing yet. */
  refundId: string | null;
  status: 'pending' | 'succeeded' | 'failed';
}

export interface StripeClient {
  createIntent(input: CreateIntentInput): Promise<CreatedIntent>;
  /** T38 — the refund against the original intent, behind the same boundary. */
  createRefund(input: CreateRefundInput): Promise<CreatedRefund>;
  /**
   * Verifies a webhook's signature against the raw request bytes and parses the event.
   * Pure HMAC — no network — so tests sign fixtures with the real algorithm instead of
   * mocking the verifier.
   */
  verifyWebhook(rawBody: string | Buffer, signature: string): Promise<Stripe.Event>;
  /**
   * The guest-facing receipt link for a succeeded intent, or null when there is none.
   *
   * Lives on this side of the boundary because the pinned API version no longer returns a
   * `charges` list on the PaymentIntent — the only charge handle an event carries is
   * `latest_charge`, which is a bare id on a webhook payload. Resolving it is SDK work.
   *
   * Never throws: a receipt is a nice-to-have, and failing the read must not turn a
   * settled payment into a webhook Stripe retries forever.
   */
  receiptUrl(intent: Stripe.PaymentIntent): Promise<string | null>;
}

/**
 * The `stripe` SDK, constructed lazily per call rather than in the constructor: a
 * missing `STRIPE_SECRET_KEY` must not fail boot (T15/T21 precedent — optional in dev
 * and tests). The first real payment call without credentials is a 503, not a crash,
 * so the failure names the missing key instead of a null reference.
 */
@Injectable()
export class StripePaymentClient implements StripeClient {
  private readonly logger = new Logger(StripePaymentClient.name);

  // Explicit `@Inject`: tsx/esbuild never emits `design:paramtypes`.
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  /**
   * The SDK, with the retry policy context/library-docs.md prescribes: one network blip
   * must not fail payment creation outright. Safe here because every call carries an
   * idempotency key or is a pure read.
   */
  private stripe(secret: string): Stripe {
    return new Stripe(secret, { maxNetworkRetries: 2 });
  }

  async createIntent(input: CreateIntentInput): Promise<CreatedIntent> {
    const secret = this.config.get<string>('STRIPE_SECRET_KEY');
    if (!secret) {
      throw new ApiError(
        HttpStatus.SERVICE_UNAVAILABLE,
        'STRIPE_NOT_CONFIGURED',
        'Payments are not configured on this deployment',
      );
    }

    const stripe = this.stripe(secret);
    let intent: Stripe.PaymentIntent;
    try {
      intent = await stripe.paymentIntents.create(
        {
          amount: input.amountCents,
          currency: input.currency.toLowerCase(),
          metadata: { bookingId: input.bookingId, reference: input.reference },
          // Test mode only (D7). The browser confirms with the test card; the API never
          // sees card data, and no live key may ever be deployed.
        },
        { idempotencyKey: input.idempotencyKey },
      );
    } catch (error) {
      // The SDK raises its own error classes here and none of them is an `HttpException`,
      // so without this the exception filter renders a wrong key or an unreachable Stripe
      // as an opaque 500 `INTERNAL_ERROR`: nothing for the operator to act on, and no code
      // for the client to branch on. The `STRIPE_NOT_CONFIGURED` check above only covers a
      // key that is *absent*; this one covers a key that is *wrong*.
      this.logger.error(
        `[payments] stripe ${stripeErrorLabel(error)} creating the intent for ${input.reference}`,
      );
      const failure = stripeFailure(error);
      throw new ApiError(failure.status, failure.code, failure.message);
    }

    if (!intent.client_secret) {
      // A successful create always carries one; its absence means the provider
      // answered something the contract cannot use, and charging on without it is
      // not an option.
      this.logger.error(`[payments] intent ${intent.id} arrived without a client secret`);
      throw new ApiError(
        HttpStatus.BAD_GATEWAY,
        'PAYMENT_FAILED',
        'The payment provider returned an unusable response',
      );
    }

    return {
      paymentIntentId: intent.id,
      clientSecret: intent.client_secret,
      status: mapStatus(intent.status),
    };
  }

  /**
   * T38 — the refund. Paid from T37's quote, against the original intent, keyed per
   * attempt so a retry is a new Stripe call and a redelivery is not.
   *
   * The Stripe answer is the outcome: test-mode refunds settle synchronously, so a
   * `succeeded` here is final and the ledger row is written settled. A `pending` answer
   * leaves the row pending for the webhook, and a thrown SDK error is caught and mapped
   * by the caller into a `failed` row — the booking is already cancelled either way, and
   * the guest must keep a way back.
   */
  async createRefund(input: CreateRefundInput): Promise<CreatedRefund> {
    const secret = this.config.get<string>('STRIPE_SECRET_KEY');
    if (!secret) {
      throw new ApiError(
        HttpStatus.SERVICE_UNAVAILABLE,
        'STRIPE_NOT_CONFIGURED',
        'Payments are not configured on this deployment',
      );
    }

    const stripe = this.stripe(secret);
    try {
      const refund = await stripe.refunds.create(
        {
          payment_intent: input.paymentIntentId,
          amount: input.amountCents,
          reason: 'requested_by_customer',
          metadata: { bookingId: input.bookingId, reference: input.reference },
        },
        { idempotencyKey: input.idempotencyKey },
      );
      return { refundId: refund.id, status: mapRefundStatus(refund.status) };
    } catch (error) {
      this.logger.error(
        `[payments] stripe ${stripeErrorLabel(error)} refunding ${input.reference}`,
      );
      throw error;
    }
  }

  async receiptUrl(intent: Stripe.PaymentIntent): Promise<string | null> {
    const secret = this.config.get<string>('STRIPE_SECRET_KEY');
    const latest = intent.latest_charge;
    // No key, or a payment method that settles without a charge at all.
    if (!secret || !latest) return null;
    try {
      // An expanded `latest_charge` carries the receipt already; a webhook payload
      // carries only the id, so that is one read against the charges resource.
      const charge = typeof latest === 'string'
        ? await this.stripe(secret).charges.retrieve(latest)
        : latest;
      const url = charge.receipt_url;
      return typeof url === 'string' && url.length > 0 ? url : null;
    } catch {
      // Logged, not thrown: the payment row is still correct without a receipt, and a
      // 500 here would make Stripe redeliver a settlement that already happened.
      this.logger.warn(`[payments] could not read the receipt for intent ${intent.id}`);
      return null;
    }
  }

  async verifyWebhook(rawBody: string | Buffer, signature: string): Promise<Stripe.Event> {
    const secret = this.config.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!secret) {
      throw new ApiError(
        HttpStatus.SERVICE_UNAVAILABLE,
        'STRIPE_NOT_CONFIGURED',
        'Webhooks are not configured on this deployment',
      );
    }
    try {
      // No network: `constructEvent` is HMAC verification plus JSON parsing, which is
      // exactly why the raw bytes (not the parsed body) are its input.
      return new Stripe(secret).webhooks.constructEvent(rawBody, signature, secret);
    } catch {
      // Never include the secret, the signature, or Stripe's detail: the first two
      // are credentials and the third is an oracle for forging.
      this.logger.warn('[payments] rejected webhook with invalid signature');
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        'INVALID_SIGNATURE',
        'The webhook signature is invalid',
      );
    }
  }
}

/**
 * Stripe's refund lifecycle onto the three states this ledger can hold. The SDK types
 * `status` as a plain string, so the mapping is exhaustive over the values Stripe
 * documents and anything unrecognised reads as `pending` — the webhook decides it.
 */
function mapRefundStatus(status: string | null): CreatedRefund['status'] {
  switch (status) {
    case 'succeeded':
      return 'succeeded';
    case 'failed':
    case 'canceled':
      return 'failed';
    default:
      return 'pending';
  }
}
/** Stripe's lifecycle collapses onto the three states this ticket can produce. */
function mapStatus(status: Stripe.PaymentIntent.Status): CreatedIntent['status'] {
  switch (status) {
    case 'succeeded':
      return 'succeeded';
    case 'canceled':
      return 'failed';
    default:
      return 'requires_payment';
  }
}

export interface StripeFailure {
  status: HttpStatus;
  code: ErrorCode;
  message: string;
}

/**
 * Stripe's SDK error classes, translated into the only two answers this API can give.
 *
 *   - Bad credentials, or a key without permission on the resource, are a misconfigured
 *     deployment — the same class of problem as a key that is missing, so they get the
 *     same 503 `STRIPE_NOT_CONFIGURED`. The caller learns to come back later instead of
 *     being shown a payment failure no retry will fix.
 *   - Everything else the SDK raises (API error, unreachable host, rate limit, invalid
 *     request) is the provider refusing or failing the call: 502 `PAYMENT_FAILED`, which
 *     names the upstream that failed instead of reporting our own 500.
 *
 * Pure and exhaustive, so nothing reaches the filter as an unmapped error. Pinned
 * without a network in `stripe.client.spec.ts`.
 */
export function stripeFailure(error: unknown): StripeFailure {
  if (
    error instanceof Stripe.errors.StripeAuthenticationError ||
    error instanceof Stripe.errors.StripePermissionError
  ) {
    return {
      status: HttpStatus.SERVICE_UNAVAILABLE,
      code: 'STRIPE_NOT_CONFIGURED',
      message: 'Payments are not configured on this deployment',
    };
  }

  if (error instanceof Stripe.errors.StripeRateLimitError) {
    // The one failure a retry fixes, so it must not read as a settled 502: the client
    // branches on the status to back off rather than tell the guest the payment failed.
    return {
      status: HttpStatus.TOO_MANY_REQUESTS,
      code: 'RATE_LIMITED',
      message: 'The payment provider is busy. Try again in a moment',
    };
  }

  if (error instanceof Stripe.errors.StripeInvalidRequestError) {
    // Stripe refused the request on its own terms — an amount under the currency minimum,
    // an unknown currency. That is this booking's problem, not the server's.
    return {
      status: HttpStatus.BAD_REQUEST,
      code: 'BAD_REQUEST',
      message: 'The payment provider rejected this amount',
    };
  }

  return {
    status: HttpStatus.BAD_GATEWAY,
    code: 'PAYMENT_FAILED',
    message: 'The payment provider could not create the payment',
  };
}

/**
 * The class name for the log line. The message is not logged: Stripe quotes the key it
 * rejected in an authentication error, and a secret never reaches a log.
 */
function stripeErrorLabel(error: unknown): string {
  return error instanceof Stripe.errors.StripeError ? error.type : 'UnknownError';
}
