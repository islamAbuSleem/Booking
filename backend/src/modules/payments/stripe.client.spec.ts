import { HttpStatus } from '@nestjs/common';
import Stripe from 'stripe';
import { describe, expect, it } from 'vitest';
import { stripeFailure } from './stripe.client.js';

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
      new Stripe.errors.StripeRateLimitError(),
      new Stripe.errors.StripeInvalidRequestError(),
      new Stripe.errors.StripeIdempotencyError(),
    ];

    for (const error of providerErrors) {
      expect(stripeFailure(error)).toMatchObject({
        status: HttpStatus.BAD_GATEWAY,
        code: 'PAYMENT_FAILED',
      });
    }
  });

  it('502s an error it does not recognise, rather than letting it reach the filter', () => {
    expect(stripeFailure(new Error('socket hang up'))).toMatchObject({
      status: HttpStatus.BAD_GATEWAY,
      code: 'PAYMENT_FAILED',
    });
  });
});