import {
  type BookingRecord,
  type BookingRepository,
} from '../../prisma/bookings.repository.js';
import {
  PAYMENTS_REPOSITORY,
  type PaymentRecord,
  type PaymentsRepository,
} from '../../prisma/payments.repository.js';
import {
  REFUNDS_REPOSITORY,
  type CreateRefundInput,
  type RefundRecord,
  type RefundsRepository,
  type SettleRefundInput,
} from '../../prisma/refunds.repository.js';
import {
  STRIPE_CLIENT,
  type CreatedRefund,
  type CreateRefundInput as StripeRefundInput,
  type StripeClient,
} from '../payments/stripe.client.js';
import { CancellationService } from '../cancellations/cancellations.service.js';
import { RefundsService } from './refunds.service.js';

const GUEST_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';
const HOTEL_ID = '33333333-3333-4333-8333-333333333333';
const BOOKING_ID = '44444444-4444-4444-8444-444444444444';
const PAYMENT_ID = '55555555-5555-4555-8555-555555555555';
const CREATED_AT = new Date('2026-05-20T10:00:00.000Z');

function booking(overrides: Partial<BookingRecord> = {}): BookingRecord {
  return {
    id: BOOKING_ID,
    reference: 'GB-4821',
    status: 'CONFIRMED',
    guestId: GUEST_ID,
    roomId: 'room-1',
    hotelId: HOTEL_ID,
    roomName: 'Courtyard King',
    checkIn: '2026-06-01',
    checkOut: '2026-06-04',
    guestsCount: 2,
    nights: 3,
    subtotalCents: 30000,
    feesCents: 500,
    totalCents: 30500,
    currency: 'USD',
    holdExpiresAt: null,
    createdAt: CREATED_AT,
    ...overrides,
  };
}

function payment(status: PaymentRecord['status'] = 'succeeded'): PaymentRecord {
  return {
    id: PAYMENT_ID,
    bookingId: BOOKING_ID,
    stripePaymentIntentId: 'pi_4821',
    amountCents: 30500,
    currency: 'USD',
    status,
    receiptUrl: null,
    createdAt: CREATED_AT,
  };
}

function refund(overrides: Partial<RefundRecord> = {}): RefundRecord {
  return {
    id: 'refund-1',
    bookingId: BOOKING_ID,
    paymentId: PAYMENT_ID,
    stripeRefundId: null,
    amountCents: 30500,
    currency: 'USD',
    percent: 100,
    reason: 'guest_cancellation',
    status: 'pending',
    attempts: 1,
    createdAt: CREATED_AT,
    ...overrides,
  };
}

class FakeBookings implements BookingRepository {
  readonly rows = new Map<string, BookingRecord>();
  readonly transitions: Array<[string, string, string]> = [];
  /** When set, the next `transitionStatus` answers null — the row moved. */
  failNextTransition = false;

  constructor(rows: Map<string, BookingRecord>) {
    this.rows = rows;
  }

  async createPending(): Promise<BookingRecord> {
    throw new Error('unused');
  }

  async findById(bookingId: string): Promise<BookingRecord | null> {
    return this.rows.get(bookingId) ?? null;
  }

  async findForOwner(): Promise<BookingRecord[]> {
    throw new Error('unused');
  }

  async findHotelSnapshot(): Promise<null> {
    return null;
  }

  async findHotelSnapshots(): Promise<[]> {
    return [];
  }

  async findRoomPriceCurrency(): Promise<null> {
    return null;
  }

  async updateStatus(): Promise<null> {
    return null;
  }

  async transitionStatus(
    bookingId: string,
    from: BookingRecord['status'],
    to: BookingRecord['status'],
  ): Promise<BookingRecord | null> {
    this.transitions.push([bookingId, from, to]);
    if (this.failNextTransition) {
      this.failNextTransition = false;
      return null;
    }
    const row = this.rows.get(bookingId);
    if (!row || row.status !== from) return null;
    row.status = to;
    return row;
  }
}

class FakePayments implements PaymentsRepository {
  constructor(private readonly row: PaymentRecord | null = payment()) {}

  async findByBooking(): Promise<PaymentRecord | null> {
    return this.row;
  }

  async findByIntent(): Promise<PaymentRecord | null> {
    throw new Error('unused');
  }

  async upsert(): Promise<PaymentRecord> {
    throw new Error('unused');
  }
}

class FakeRefunds implements RefundsRepository {
  readonly rows: RefundRecord[] = [];
  readonly attempts: CreateRefundInput[] = [];
  readonly settles: Array<[string, SettleRefundInput]> = [];
  private seq = 0;

  async createAttempt(input: CreateRefundInput): Promise<RefundRecord> {
    this.attempts.push(input);
    this.seq += 1;
    const record = refund({
      id: `refund-${this.seq}`,
      bookingId: input.bookingId,
      paymentId: input.paymentId,
      amountCents: input.amountCents,
      currency: input.currency,
      percent: input.percent,
      reason: input.reason ?? null,
      attempts: input.attempts,
      status: 'pending',
    });
    this.rows.push(record);
    return record;
  }

  async settle(refundId: string, input: SettleRefundInput): Promise<RefundRecord | null> {
    this.settles.push([refundId, input]);
    const row = this.rows.find((candidate) => candidate.id === refundId);
    if (!row) return null;
    if (row.status !== 'pending') return row;
    row.status = input.status;
    if (input.stripeRefundId) row.stripeRefundId = input.stripeRefundId;
    return row;
  }

  async findLatestByBooking(bookingId: string): Promise<RefundRecord | null> {
    const rows = this.rows.filter((row) => row.bookingId === bookingId);
    return rows.length > 0 ? rows[rows.length - 1] : null;
  }

  async findByBooking(bookingId: string): Promise<RefundRecord[]> {
    return this.rows
      .filter((row) => row.bookingId === bookingId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async findByStripeRefundId(stripeRefundId: string): Promise<RefundRecord | null> {
    return this.rows.find((row) => row.stripeRefundId === stripeRefundId) ?? null;
  }

  async hasSucceeded(bookingId: string): Promise<boolean> {
    return this.rows.some((row) => row.bookingId === bookingId && row.status === 'succeeded');
  }
}

/** The T37 quote, from the API's own arithmetic. 60+ days out, so 100%. */
class StubCancellations {
  async quote(): Promise<{
    refundPercent: number;
    refundCents: number;
    currency: string;
    policyVersion: number;
  }> {
    return { refundPercent: 100, refundCents: 30500, currency: 'USD', policyVersion: 0 };
  }
}

interface Harness {
  refunds: RefundsService;
  ledger: FakeRefunds;
  bookings: FakeBookings;
  payments: FakePayments;
  stripe: { calls: StripeRefundInput[]; next: number; result: CreatedRefund | Error };
}

function harness(options: {
  booking?: Partial<BookingRecord>;
  payment?: PaymentRecord | null;
  /** One entry per Stripe call, in order. A single entry is reused for every call. */
  stripe?: Array<CreatedRefund | Error> | CreatedRefund | Error;
} = {}): Harness {
  const ledger = new FakeRefunds();
  const bookings = new FakeBookings(new Map([[BOOKING_ID, booking(options.booking)]]));
  const payments = new FakePayments(options.payment === undefined ? payment() : options.payment);
  const script = Array.isArray(options.stripe)
    ? options.stripe
    : [options.stripe ?? { refundId: 're_4821', status: 'succeeded' }];
  const stripe = {
    calls: [] as StripeRefundInput[],
    next: 0,
    result: script[0] as CreatedRefund | Error,
  };
  const stripeClient: StripeClient = {
    createIntent: async () => {
      throw new Error('unused');
    },
    createRefund: async (input: StripeRefundInput) => {
      stripe.calls.push(input);
      // Advance the script per call, so a failing first attempt and a succeeding retry
      // are two different answers from the same fake.
      const entry = script[Math.min(stripe.next, script.length - 1)];
      stripe.next += 1;
      stripe.result = entry;
      if (entry instanceof Error) throw entry;
      return entry;
    },
    verifyWebhook: async () => {
      throw new Error('unused');
    },
    receiptUrl: async () => null,
  };
  const refunds = new RefundsService(
    bookings,
    payments,
    ledger,
    stripeClient,
    new StubCancellations() as unknown as CancellationService,
  );
  return { refunds, ledger, bookings, payments, stripe };
}

describe('RefundsService.cancel', () => {
  it('flips the booking, appends one attempt, and settles it from Stripe', async () => {
    const { refunds, ledger, bookings, stripe } = harness();

    const outcome = await refunds.cancel(GUEST_ID, BOOKING_ID);

    expect(outcome.booking.status).toBe('CANCELLED');
    expect(outcome.refund).toMatchObject({
      bookingId: BOOKING_ID,
      amountCents: 30500,
      currency: 'USD',
      percent: 100,
      status: 'succeeded',
      attempts: 1,
    });
    expect(ledger.attempts).toHaveLength(1);
    expect(bookings.transitions).toEqual([[BOOKING_ID, 'CONFIRMED', 'CANCELLED']]);
    expect(stripe.calls).toHaveLength(1);
    expect(stripe.calls[0]).toMatchObject({
      paymentIntentId: 'pi_4821',
      amountCents: 30500,
      currency: 'USD',
    });
  });

  it('keys the Stripe call per attempt, so a retry is a new call and a redelivery is not', async () => {
    const { refunds, stripe } = harness({
      stripe: [new Error('stripe unreachable'), { refundId: 're_4821', status: 'succeeded' }],
    });

    await refunds.cancel(GUEST_ID, BOOKING_ID);
    await refunds.retry(GUEST_ID, BOOKING_ID);

    expect(stripe.calls.map((call) => call.idempotencyKey)).toEqual([
      'refunds:GB-4821:1',
      'refunds:GB-4821:2',
    ]);
  });

  it('leaves the booking cancelled and the row failed when Stripe fails, with a way back', async () => {
    // The ticket's verify line: a failed Stripe call must never strand the guest's money.
    const { refunds, ledger, bookings } = harness({
      stripe: new Error('stripe unreachable'),
    });

    const outcome = await refunds.cancel(GUEST_ID, BOOKING_ID);

    expect(outcome.booking.status).toBe('CANCELLED');
    expect(outcome.refund?.status).toBe('failed');
    expect(ledger.rows).toHaveLength(1);
    // The retry is the way back, and it appends rather than overwriting.
    await refunds.retry(GUEST_ID, BOOKING_ID);
    expect(ledger.rows).toHaveLength(2);
    expect(bookings.transitions).toEqual([[BOOKING_ID, 'CONFIRMED', 'CANCELLED']]);
  });

  it('reads instead of 409ing on a duplicate cancel, and never charges twice', async () => {
    const { refunds, ledger, stripe } = harness();
    await refunds.cancel(GUEST_ID, BOOKING_ID);

    const again = await refunds.cancel(GUEST_ID, BOOKING_ID);

    expect(again.refund?.status).toBe('succeeded');
    expect(again.booking.status).toBe('CANCELLED');
    expect(ledger.attempts).toHaveLength(1);
    expect(stripe.calls).toHaveLength(1);
  });

  it('400s NO_CAPTURED_PAYMENT for a booking that never took money, cancelling nothing', async () => {
    const { refunds, ledger, bookings } = harness({ payment: null });

    await expect(refunds.cancel(GUEST_ID, BOOKING_ID)).rejects.toMatchObject({
      status: 400,
      response: { code: 'NO_CAPTURED_PAYMENT' },
    });
    expect(bookings.transitions).toEqual([]);
    expect(ledger.attempts).toHaveLength(0);
  });

  it('409s INVALID_CANCEL_STATE for a PENDING hold, writing nothing', async () => {
    const { refunds, ledger, bookings } = harness({ booking: { status: 'PENDING' } });

    await expect(refunds.cancel(GUEST_ID, BOOKING_ID)).rejects.toMatchObject({
      status: 409,
      response: { code: 'INVALID_CANCEL_STATE' },
    });
    expect(bookings.transitions).toEqual([]);
    expect(ledger.attempts).toHaveLength(0);
  });

  it('403s NOT_BOOKING_OWNER for a booking that belongs to a different guest', async () => {
    const { refunds } = harness();

    await expect(refunds.cancel(OTHER_ID, BOOKING_ID)).rejects.toMatchObject({
      status: 403,
      response: { code: 'NOT_BOOKING_OWNER' },
    });
  });

  it('404s BOOKING_NOT_FOUND for a booking that does not exist', async () => {
    const { refunds } = harness();

    await expect(refunds.cancel(GUEST_ID, 'no-such-booking')).rejects.toMatchObject({
      status: 404,
      response: { code: 'BOOKING_NOT_FOUND' },
    });
  });

  it('answers the read path when a concurrent cancel won the transition', async () => {
    const { refunds, bookings } = harness();
    bookings.rows.set(BOOKING_ID, booking({ status: 'CANCELLED' }));
    bookings.failNextTransition = true;

    const outcome = await refunds.cancel(GUEST_ID, BOOKING_ID);

    expect(outcome.booking.status).toBe('CANCELLED');
    expect(outcome.refund).toBeNull();
  });
});

describe('RefundsService.retry', () => {
  it('appends a second row that succeeds, with the same amount and percent', async () => {
    const { refunds, ledger } = harness({
      stripe: [new Error('stripe unreachable'), { refundId: 're_4821', status: 'succeeded' }],
    });
    await refunds.cancel(GUEST_ID, BOOKING_ID);

    const retried = await refunds.retry(GUEST_ID, BOOKING_ID);

    expect(retried).toMatchObject({
      status: 'succeeded',
      attempts: 2,
      amountCents: 30500,
      percent: 100,
    });
    expect(ledger.rows.map((row) => row.attempts)).toEqual([1, 2]);
  });

  it('409s ALREADY_REFUNDED once a refund has succeeded — no path double-refunds', async () => {
    const { refunds } = harness();
    await refunds.cancel(GUEST_ID, BOOKING_ID);

    await expect(refunds.retry(GUEST_ID, BOOKING_ID)).rejects.toMatchObject({
      status: 409,
      response: { code: 'ALREADY_REFUNDED' },
    });
  });

  it('403s NOT_BOOKING_OWNER for a booking that belongs to a different guest', async () => {
    const { refunds } = harness();
    await refunds.cancel(GUEST_ID, BOOKING_ID);

    await expect(refunds.retry(OTHER_ID, BOOKING_ID)).rejects.toMatchObject({
      status: 403,
      response: { code: 'NOT_BOOKING_OWNER' },
    });
  });
});

describe('RefundsService.list', () => {
  it("returns the caller's ledger newest first, and 403s another guest's", async () => {
    const { refunds } = harness();
    await refunds.cancel(GUEST_ID, BOOKING_ID);

    const page = await refunds.list(GUEST_ID, BOOKING_ID);

    expect(page.total).toBe(1);
    expect(page.items[0]?.attempts).toBe(1);
    await expect(refunds.list(OTHER_ID, BOOKING_ID)).rejects.toMatchObject({
      status: 403,
      response: { code: 'NOT_BOOKING_OWNER' },
    });
  });
});
