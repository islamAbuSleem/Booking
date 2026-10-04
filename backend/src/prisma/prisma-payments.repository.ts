import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import {
  type PaymentRecord,
  type PaymentStatus,
  type PaymentsRepository,
  type UpsertPaymentData,
} from './payments.repository.js';
import { PrismaService } from './prisma.service.js';

const PAYMENT_SELECT = {
  id: true,
  bookingId: true,
  stripePaymentIntentId: true,
  amountCents: true,
  currency: true,
  status: true,
  receiptUrl: true,
  createdAt: true,
} satisfies Prisma.PaymentSelect;

type PaymentRow = Prisma.PaymentGetPayload<{ select: typeof PAYMENT_SELECT }>;

/**
 * Statuses Stripe has already settled on. A row in one of these is never written to a
 * *different* status — see `upsert`.
 */
const TERMINAL_STATUSES: PaymentStatus[] = ['succeeded', 'refunded', 'failed'];

/** T26 — Prisma implementation of `PaymentsRepository`. */
@Injectable()
export class PrismaPaymentsRepository implements PaymentsRepository {
  // Explicit `@Inject`: tsx/esbuild never emits `design:paramtypes`, so an
  // inferred token would be undefined in the OpenAPI preview (see PrismaService).
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findByBooking(bookingId: string): Promise<PaymentRecord | null> {
    const row = await this.prisma.payment.findUnique({
      where: { bookingId },
      select: PAYMENT_SELECT,
    });
    return row ? toRecord(row) : null;
  }

  async findByIntent(stripePaymentIntentId: string): Promise<PaymentRecord | null> {
    const row = await this.prisma.payment.findUnique({
      where: { stripePaymentIntentId },
      select: PAYMENT_SELECT,
    });
    return row ? toRecord(row) : null;
  }

  async upsert(data: UpsertPaymentData): Promise<PaymentRecord> {
    const fields = {
      stripePaymentIntentId: data.stripePaymentIntentId,
      amountCents: data.amountCents,
      currency: data.currency,
      status: data.status,
      ...(data.receiptUrl !== undefined ? { receiptUrl: data.receiptUrl } : {}),
    };

    // A settled payment is never walked backwards. `createIntent` reads the booking, then
    // calls Stripe, then writes here, so a slow request that overlaps the webhook would
    // otherwise reset `succeeded` to `requires_payment` and report a paid stay as unpaid.
    //
    // A row already carrying THIS status is still writable, so a redelivery can land the
    // receipt on a `succeeded` row that was written without one.
    const guarded = await this.prisma.payment.updateMany({
      where: {
        bookingId: data.bookingId,
        OR: [{ status: { notIn: TERMINAL_STATUSES } }, { status: data.status }],
      },
      data: fields,
    });

    if (guarded.count === 0) {
      // Either the row is already settled on a different outcome — leave it, the unique
      // `bookingId` rules out a second row — or there is no row and this is a create.
      const existing = await this.findByBooking(data.bookingId);
      if (existing) return existing;
      return toRecord(await this.prisma.payment.create({
        data: { ...data, receiptUrl: data.receiptUrl ?? null },
        select: PAYMENT_SELECT,
      }));
    }

    const row = await this.prisma.payment.findUnique({
      where: { bookingId: data.bookingId },
      select: PAYMENT_SELECT,
    });
    if (!row) {
      throw new Error(`[payments] row ${data.bookingId} vanished between the update and the read`);
    }
    return toRecord(row);
  }
}

function toRecord(row: PaymentRow): PaymentRecord {
  return {
    id: row.id,
    bookingId: row.bookingId,
    stripePaymentIntentId: row.stripePaymentIntentId,
    amountCents: row.amountCents,
    currency: row.currency,
    status: row.status,
    receiptUrl: row.receiptUrl,
    createdAt: row.createdAt,
  };
}
