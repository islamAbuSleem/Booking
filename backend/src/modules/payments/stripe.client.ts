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

export interface StripeClient {
  createIntent(input: CreateIntentInput): Promise<CreatedIntent>;
  /**
   * Verifies a webhook's signature against the raw request bytes and parses the event.
   * Pure HMAC — no network — so tests sign fixtures with the real algorithm instead of
   * mocking the verifier.
   */
  verifyWebhook(rawBody: string | Buffer, signature: string): Promise<Stripe.Event>;
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

  async createIntent(input: CreateIntentInput): Promise<CreatedIntent> {
    const secret = this.config.get<string>('STRIPE_SECRET_KEY');
    if (!secret) {
      throw new ApiError(
        HttpStatus.SERVICE_UNAVAILABLE,
        'STRIPE_NOT_CONFIGURED',
        'Payments are not configured on this deployment',
      );
    }

    const stripe = new Stripe(secret);
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
