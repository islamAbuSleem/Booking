import { HttpStatus } from '@nestjs/common';
import Stripe from 'stripe';
import { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StripePaymentClient, stripeFailure } from './stripe.client.js';

/**
 * T26 — how a Stripe SDK error leaves this module. No network: the classes are
 * constructed directly, which is the only way to prove a bad key is not reported as
 * an opaque 500 (code-standards.md, "Every thrown error is an `HttpException`").
 */

describe('stripeFailure', () => {
  it('answers a rejected key with the same 503 as a missing one', () => {
    expect(stripeFailure(new Stripe.errors.StripeAuthenticationError())).toEqual({
      status: HttpStatus.SERVICE_UNAVAILABLE,
      code: 'STRIPE_NOT_CONFIGURED',
      message: 'Payments are not configured on this deployment',
    });
  });

  it('answers a key without permission the same way', () => {
    expect(stripeFailure(new Stripe.errors.StripePermissionError())).toMatchObject({
      status: HttpStatus.SERVICE_UNAVAILABLE,
      code: 'STRIPE_NOT_CONFIGURED',
    });
  });

  it('502s the provider failing the call, whatever shape the failure takes', () => {
    const providerErrors = [
      new Stripe.errors.StripeAPIError(),
      new Stripe.errors.StripeConnectionError(),
      new Stripe.errors.StripeIdempotencyError(),
    ];

    for (const error of providerErrors) {
      expect(stripeFailure(error)).toMatchObject({
        status: HttpStatus.BAD_GATEWAY,
        code: 'PAYMENT_FAILED',
      });
    }
  });

  it('429s a throttle, the one failure a retry actually fixes', () => {
    // A settled 502 here would tell the guest their payment failed when the provider never
    // refused it — the client branches on this status to back off instead.
    expect(stripeFailure(new Stripe.errors.StripeRateLimitError())).toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
      code: 'RATE_LIMITED',
    });
  });

  it('400s a request Stripe refused on its own terms', () => {
    // An amount under the currency minimum, an unknown currency: this booking's problem,
    // not the server's, so it is not reported as an upstream failure.
    expect(stripeFailure(new Stripe.errors.StripeInvalidRequestError())).toMatchObject({
      status: HttpStatus.BAD_REQUEST,
      code: 'BAD_REQUEST',
    });
  });

  it('502s an error it does not recognise, rather than letting it reach the filter', () => {
    expect(stripeFailure(new Error('socket hang up'))).toMatchObject({
      status: HttpStatus.BAD_GATEWAY,
      code: 'PAYMENT_FAILED',
    });
  });
});
/**
 * The receipt lookup and the retry policy. The SDK is replaced wholesale — the real client
 * would need a network — while `errors` is carried over from the real module so the mapping
 * cases above still exercise the actual error classes.
 */
const charges = { retrieve: vi.fn() };
const constructed: Array<Record<string, unknown>> = [];

vi.mock('stripe', async (importOriginal) => {
  const actual = await importOriginal<typeof import('stripe')>();
  class FakeStripe {
    static errors = actual.default.errors;
    constructor(_key: string, options?: Record<string, unknown>) {
      constructed.push(options ?? {});
    }
    charges = charges;
  }
  return { ...actual, default: FakeStripe };
});

const KEY_CONFIG = new ConfigService({ STRIPE_SECRET_KEY: 'sk_test_placeholder' });
const client = new StripePaymentClient(KEY_CONFIG);

function intent(latestCharge: unknown): Stripe.PaymentIntent {
  return { id: 'pi_1', latest_charge: latestCharge } as unknown as Stripe.PaymentIntent;
}

beforeEach(() => {
  vi.clearAllMocks();
  constructed.length = 0;
});

describe('StripeClient.receiptUrl', () => {
  it('resolves a bare latest_charge id to the receipt link', async () => {
    charges.retrieve.mockResolvedValue({ id: 'ch_1', receipt_url: 'https://pay.stripe.com/r/1' });

    await expect(client.receiptUrl(intent('ch_1'))).resolves.toBe('https://pay.stripe.com/r/1');
  });

  it('reads an expanded latest_charge without a second call', async () => {
    await expect(
      client.receiptUrl(intent({ id: 'ch_1', receipt_url: 'https://pay.stripe.com/r/2' })),
    ).resolves.toBe('https://pay.stripe.com/r/2');
    expect(charges.retrieve).not.toHaveBeenCalled();
  });

  it('has no receipt when the intent never settled through a charge', async () => {
    // A payment method that settles without one (some bank debits) leaves this null.
    await expect(client.receiptUrl(intent(null))).resolves.toBeNull();
    expect(charges.retrieve).not.toHaveBeenCalled();
  });

  it('answers null rather than throwing when the charge cannot be read', async () => {
    // A 500 here would make Stripe redeliver a settlement that already happened, for a
    // receipt nobody needs.
    charges.retrieve.mockRejectedValue(new Error('no such charge'));

    await expect(client.receiptUrl(intent('ch_missing'))).resolves.toBeNull();
  });

  it('treats an empty receipt_url as no receipt', async () => {
    charges.retrieve.mockResolvedValue({ id: 'ch_1', receipt_url: '' });

    await expect(client.receiptUrl(intent('ch_1'))).resolves.toBeNull();
  });
});

describe('StripeClient retry policy', () => {
  it('lets the SDK retry a network blip instead of failing the payment', async () => {
    // context/library-docs.md: without this, one dropped connection fails a real payment.
    charges.retrieve.mockResolvedValue({ id: 'ch_1', receipt_url: 'https://pay.stripe.com/r/1' });
    await client.receiptUrl(intent('ch_1'));

    expect(constructed[0]).toMatchObject({ maxNetworkRetries: 2 });
  });
});
