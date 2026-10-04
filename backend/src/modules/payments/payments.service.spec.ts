import { describe, expect, it, vi } from 'vitest';
import type {
  BookingRecord,
  BookingRepository,
} from '../../prisma/bookings.repository.js';
import type {
  PaymentsRepository,
  UpsertPaymentData,
} from '../../prisma/payments.repository.js';
import { PaymentsService } from './payments.service.js';
import type { CreatedIntent, StripeClient } from './stripe.client.js';
/**
 * T26 — the intent rules with no database and no network. The wire codes are pinned
 * over HTTP in `test/payments.e2e-spec.ts`; this file pins the two decisions money
 * depends on: the amount comes from the booking snapshot (never the request), and the
 * idempotency key derives from the reference (stable across retries).
 */

const ADA_ID = '33333333-3333-4333-8333-333333333333';
const BOOKING_ID = '55555555-5555-4555-8555-555555555555';

function booking(overrides: Partial<BookingRecord> = {}): BookingRecord {
  return {
    id: BOOKING_ID,
    reference: 'GB-4821',
    status: 'PENDING',
    guestId: ADA_ID,
    roomId: '66666666-6666-4666-8666-666666666666',
    hotelId: '11111111-1111-4111-8111-111111111111',
    roomName: 'Deluxe King',
    checkIn: '2026-06-01',
    checkOut: '2026-06-04',
    guestsCount: 2,
    nights: 3,
    subtotalCents: 60_000,
    feesCents: 0,
    totalCents: 60_000,
    currency: 'USD',
    createdAt: new Date('2026-05-01T10:00:00.000Z'),
    ...overrides,
  };
}

function setup(options: { bookings?: Map<string, BookingRecord> } = {}) {
  const intents: CreatedIntent[] = [];
  const keys: string[] = [];
  const upserts: UpsertPaymentData[] = [];
  const bookings: BookingRepository = {
    createPending: () => { throw new Error('unused'); },
    findById: (id: string) => Promise.resolve(options.bookings?.get(id) ?? null),
    findForOwner: () => Promise.resolve([]),
    findHotelSnapshot: () => Promise.resolve(null),
    findHotelSnapshots: () => Promise.resolve([]),
    findRoomPriceCurrency: () => Promise.resolve(null),
    updateStatus: () => Promise.resolve(null),
    transitionStatus: () => Promise.resolve(null),
  };
  const payments: PaymentsRepository = {
    findByBooking: () => Promise.resolve(null),
    findByIntent: () => Promise.resolve(null),
    upsert: (data: UpsertPaymentData) => {
      upserts.push(data);
      return Promise.resolve({
        id: 'pay-1',
        receiptUrl: null,
        createdAt: new Date(),
        ...data,
      });
    },
  };
  const stripe: StripeClient = {
    createIntent: (input) => {
      keys.push(input.idempotencyKey);
      const intent: CreatedIntent = {
        paymentIntentId: `pi_${input.idempotencyKey}`,
        clientSecret: `secret_${input.idempotencyKey}`,
        status: 'requires_payment',
      };
      intents.push(intent);
      return Promise.resolve(intent);
    },
    verifyWebhook: () => { throw new Error('unused'); },
    receiptUrl: () => Promise.resolve(null),
  };
  const service = new PaymentsService(bookings, payments, stripe);
  return { service, keys, upserts };
}

describe('PaymentsService', () => {
  it('creates the intent for the booking\u2019s total with a reference-derived key', async () => {
    const { service, keys, upserts } = setup({
      bookings: new Map([[BOOKING_ID, booking()]]),
    });

    const intent = await service.createIntent(ADA_ID, { bookingId: BOOKING_ID });

    expect(intent).toEqual({
      clientSecret: 'secret_payments-intent:GB-4821',
      paymentIntentId: 'pi_payments-intent:GB-4821',
      amountCents: 60_000,
      currency: 'USD',
    });
    expect(keys).toEqual(['payments-intent:GB-4821']);
    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({ bookingId: BOOKING_ID, amountCents: 60_000 });
  });

  it('repeats the same key on retry, so Stripe dedupes rather than double-charging', async () => {
    const { service, keys } = setup({
      bookings: new Map([[BOOKING_ID, booking()]]),
    });

    await service.createIntent(ADA_ID, { bookingId: BOOKING_ID });
    await service.createIntent(ADA_ID, { bookingId: BOOKING_ID });

    expect(keys).toEqual(['payments-intent:GB-4821', 'payments-intent:GB-4821']);
  });

  it('400s a booking that is no longer pending', async () => {
    const { service } = setup({
      bookings: new Map([[BOOKING_ID, booking({ status: 'CONFIRMED' })]]),
    });

    await expect(service.createIntent(ADA_ID, { bookingId: BOOKING_ID })).rejects.toMatchObject({
      response: { code: 'INVALID_PAYMENT_STATE' },
    });
  });

  it('404s a missing payment row on read', async () => {
    const { service } = setup({
      bookings: new Map([[BOOKING_ID, booking()]]),
    });

    await expect(service.getPayment(ADA_ID, BOOKING_ID)).rejects.toMatchObject({
      response: { code: 'PAYMENT_NOT_FOUND' },
    });
  });
});
