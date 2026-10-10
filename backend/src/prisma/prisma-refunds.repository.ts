import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import type {
  CreateRefundInput,
  RefundRecord,
  RefundsRepository,
  SettleRefundInput,
} from './refunds.repository.js';
import { PrismaService } from './prisma.service.js';

const REFUND_SELECT = {
  id: true,
  bookingId: true,
  paymentId: true,
  stripeRefundId: true,
  amountCents: true,
  currency: true,
  percent: true,
  reason: true,
  status: true,
  attempts: true,
  createdAt: true,
} satisfies Prisma.RefundSelect;

type RefundRow = Prisma.RefundGetPayload<{ select: typeof REFUND_SELECT }>;

/** A `pending` row is the only state a settle may move; the ledger is never rewritten. */
const SETTABLE_STATUSES: Array<'pending'> = ['pending'];

/** T38 — Prisma implementation of `RefundsRepository`. */
@Injectable()
export class PrismaRefundsRepository implements RefundsRepository {
  // Explicit `@Inject`: tsx/esbuild never emits `design:paramtypes`, so an
  // inferred token would be undefined in the OpenAPI preview (see PrismaService).
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async createAttempt(input: CreateRefundInput): Promise<RefundRecord> {
    const row = await this.prisma.refund.create({
      data: {
        bookingId: input.bookingId,
        paymentId: input.paymentId,
        amountCents: input.amountCents,
        currency: input.currency,
        percent: input.percent,
        reason: input.reason ?? null,
        attempts: input.attempts,
        status: 'pending',
      },
      select: REFUND_SELECT,
    });
    return toRecord(row);
  }

  async settle(refundId: string, input: SettleRefundInput): Promise<RefundRecord | null> {
    const data: Prisma.RefundUpdateManyMutationInput = {
      status: input.status,
      ...(input.stripeRefundId !== undefined && input.stripeRefundId !== null
        ? { stripeRefundId: input.stripeRefundId }
        : {}),
    };

    // The `where` carries the state guard, so a redelivered webhook — or a slow retry
    // overlapping it — finds nothing to move and leaves the settled row alone. A
    // check-then-act would let the second delivery stamp its own id over the first's.
    const moved = await this.prisma.refund.updateMany({
      where: { id: refundId, status: { in: SETTABLE_STATUSES } },
      data,
    });
    if (moved.count === 0) {
      // Nothing moved: either the row settled already (return what it says) or the id
      // was never ours. Both are answers, not errors.
      const row = await this.prisma.refund.findUnique({
        where: { id: refundId },
        select: REFUND_SELECT,
      });
      return row ? toRecord(row) : null;
    }

    const row = await this.prisma.refund.findUnique({
      where: { id: refundId },
      select: REFUND_SELECT,
    });
    return row ? toRecord(row) : null;
  }

  async findLatestByBooking(bookingId: string): Promise<RefundRecord | null> {
    const row = await this.prisma.refund.findFirst({
      where: { bookingId },
      orderBy: { createdAt: 'desc' },
      select: REFUND_SELECT,
    });
    return row ? toRecord(row) : null;
  }

  async findByBooking(bookingId: string): Promise<RefundRecord[]> {
    const rows = await this.prisma.refund.findMany({
      where: { bookingId },
      orderBy: { createdAt: 'desc' },
      select: REFUND_SELECT,
    });
    return rows.map(toRecord);
  }

  async findByStripeRefundId(stripeRefundId: string): Promise<RefundRecord | null> {
    const row = await this.prisma.refund.findUnique({
      where: { stripeRefundId },
      select: REFUND_SELECT,
    });
    return row ? toRecord(row) : null;
  }

  async hasSucceeded(bookingId: string): Promise<boolean> {
    const found = await this.prisma.refund.count({
      where: { bookingId, status: 'succeeded' },
    });
    return found > 0;
  }
}

function toRecord(row: RefundRow): RefundRecord {
  return {
    id: row.id,
    bookingId: row.bookingId,
    paymentId: row.paymentId,
    stripeRefundId: row.stripeRefundId,
    amountCents: row.amountCents,
    currency: row.currency,
    percent: row.percent,
    reason: row.reason,
    status: row.status,
    attempts: row.attempts,
    createdAt: row.createdAt,
  };
}
