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
    const intent = await stripe.paymentIntents.create(
      {
        amount: input.amountCents,
        currency: input.currency.toLowerCase(),
        metadata: { bookingId: input.bookingId, reference: input.reference },
        // Test mode only (D7). The browser confirms with the test card; the API never
        // sees card data, and no live key may ever be deployed.
      },
      { idempotencyKey: input.idempotencyKey },
    );

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
