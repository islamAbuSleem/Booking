import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { ApiError } from '../../common/errors/api-error.js';

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
    } catch (error: unknown) {
      // The SDK raises its own classes, none of them an HttpException, so an outage, a 429
      // or a rejected amount would otherwise render as an opaque 500 INTERNAL_ERROR.
      throw stripeFailure(error);
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
 * Turns a Stripe SDK error into the `ApiError` the client contract declares.
 *
 * Each class gets the answer a caller can act on, and they are genuinely different
 * situations: a throttled call is worth retrying, a rejected amount is the guest's stay
 * that cannot be charged, and credentials are a misconfigured deployment. Collapsing
 * them all into one 500 makes a provider outage indistinguishable from a server bug.
 *
 * Anything unrecognised becomes a 502 rather than being allowed to reach the exception
 * filter, so no raw SDK error can render as `INTERNAL_ERROR`.
 *
 * The message never quotes the provider's detail: Stripe's messages carry the rejected
 * key, which is a credential.
 */
export function stripeFailure(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (error instanceof Stripe.errors.StripeAuthenticationError
    || error instanceof Stripe.errors.StripePermissionError) {
    // A key that exists but is refused is the same deployment fault as no key at all,
    // and no retry fixes either.
    return new ApiError(
      HttpStatus.SERVICE_UNAVAILABLE,
      'STRIPE_NOT_CONFIGURED',
      'Payments are not configured on this deployment',
    );
  }

  if (error instanceof Stripe.errors.StripeRateLimitError) {
    return new ApiError(
      HttpStatus.TOO_MANY_REQUESTS,
      'RATE_LIMITED',
      'The payment provider is busy. Try again in a moment',
    );
  }

  if (error instanceof Stripe.errors.StripeInvalidRequestError) {
    // Stripe refused the request itself — an amount under the currency minimum, an
    // unknown currency. That is this booking's problem to fix, not the server's.
    return new ApiError(
      HttpStatus.BAD_REQUEST,
      'BAD_REQUEST',
      'The payment provider rejected this amount',
    );
  }

  return new ApiError(
    HttpStatus.BAD_GATEWAY,
    'PAYMENT_FAILED',
    'The payment provider could not be reached',
  );
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
