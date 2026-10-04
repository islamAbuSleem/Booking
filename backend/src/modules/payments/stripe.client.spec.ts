import { HttpStatus } from '@nestjs/common';
import Stripe from 'stripe';
import { describe, expect, it } from 'vitest';
import { stripeFailure } from './stripe.client.js';

/**
 * T26 — how a Stripe SDK error leaves this module. No network: the classes are
 * constructed directly, which is the only way to prove a provider outage is not reported
 * as an opaque 500 (context/code-standards.md, "Every thrown error is an HttpException").
 */

/** `ApiError` keeps the code in its response body, which is what the client receives. */
function answer(error: unknown): { status: number; code: string } {
  const thrown = stripeFailure(error) as unknown as {
    getStatus(): number;
    getResponse(): { code: string };
  };
  return { status: thrown.getStatus(), code: thrown.getResponse().code };
}

describe('stripeFailure', () => {
  it('answers a rejected key with the same 503 as a missing one', () => {
    expect(answer(new Stripe.errors.StripeAuthenticationError())).toEqual({
      status: HttpStatus.SERVICE_UNAVAILABLE,
      code: 'STRIPE_NOT_CONFIGURED',
    });
    expect(answer(new Stripe.errors.StripePermissionError())).toEqual({
      status: HttpStatus.SERVICE_UNAVAILABLE,
      code: 'STRIPE_NOT_CONFIGURED',
    });
  });

  it('429s a throttled call, which is the one a retry can fix', () => {
    expect(answer(new Stripe.errors.StripeRateLimitError())).toEqual({
      status: HttpStatus.TOO_MANY_REQUESTS,
      code: 'RATE_LIMITED',
    });
  });

  it('400s a request Stripe refuses on its own terms', () => {
    expect(answer(new Stripe.errors.StripeInvalidRequestError())).toEqual({
      status: HttpStatus.BAD_REQUEST,
      code: 'BAD_REQUEST',
    });
  });

  it('502s the provider failing the call, whatever shape the failure takes', () => {
    for (const error of [
      new Stripe.errors.StripeConnectionError(),
      new Stripe.errors.StripeAPIError(),
      new Stripe.errors.StripeIdempotencyError(),
      new Error('socket hang up'),
    ]) {
      expect(answer(error)).toEqual({
        status: HttpStatus.BAD_GATEWAY,
        code: 'PAYMENT_FAILED',
      });
    }
  });

  it('never carries the provider detail, which quotes the rejected key', () => {
    // Stripe's own message for a bad key repeats the key. That is a credential and must
    // not reach the client or the log.
    const raw: Stripe.errors.StripeRawError = {
      type: 'invalid_request_error',
      message: 'Invalid API Key provided: sk_test_rejected',
    };
    const thrown = stripeFailure(new Stripe.errors.StripeAuthenticationError(raw));

    expect(thrown.message).not.toContain('sk_test_rejected');
  });

  it('passes an ApiError through untouched, so a deliberate 503 stays a 503', () => {
    const thrown = stripeFailure(new Stripe.errors.StripeAuthenticationError());
    expect(stripeFailure(thrown)).toBe(thrown);
  });
});