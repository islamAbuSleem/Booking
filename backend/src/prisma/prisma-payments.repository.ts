import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import {
  type PaymentRecord,
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
    const row = await this.prisma.payment.upsert({
      where: { bookingId: data.bookingId },
      create: { ...data, receiptUrl: data.receiptUrl ?? null },
      update: {
        stripePaymentIntentId: data.stripePaymentIntentId,
        amountCents: data.amountCents,
        currency: data.currency,
        status: data.status,
        ...(data.receiptUrl !== undefined ? { receiptUrl: data.receiptUrl } : {}),
      },
      select: PAYMENT_SELECT,
    });
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
