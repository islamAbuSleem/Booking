import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import type {
  PolicyRecord,
  PolicyTierRow,
} from './cancellation.repository.js';
import type { CancellationRepository } from './cancellation.repository.js';
import { PrismaService } from './prisma.service.js';

const POLICY_SELECT = {
  hotelId: true,
  tiers: true,
  noRefundWithinHours: true,
  version: true,
} satisfies Prisma.CancellationPolicySelect;

/**
 * T37 — Prisma implementation of `CancellationRepository`.
 *
 * `tiers` travels as JSONB: the column carries no shape, so the rows are validated on
 * the way out — a row the database holds but the contract cannot describe is a server
 * state error, never a malformed quote.
 */
function toTiers(value: unknown): PolicyTierRow[] {
  if (!Array.isArray(value)) {
    throw new Error('CANCELLATION_POLICY_TIERS_INVALID');
  }
  return value.map((entry) => {
    if (
      typeof entry !== 'object' ||
      entry === null ||
      !Number.isInteger((entry as { daysBefore?: unknown }).daysBefore) ||
      !Number.isInteger((entry as { refundPercent?: unknown }).refundPercent)
    ) {
      throw new Error('CANCELLATION_POLICY_TIERS_INVALID');
    }
    const tier = entry as { daysBefore: number; refundPercent: number };
    return { daysBefore: tier.daysBefore, refundPercent: tier.refundPercent };
  });
}

function toRecord(row: {
  hotelId: string;
  tiers: unknown;
  noRefundWithinHours: number;
  version: number;
}): PolicyRecord {
  return {
    hotelId: row.hotelId,
    tiers: toTiers(row.tiers),
    noRefundWithinHours: row.noRefundWithinHours,
    version: row.version,
  };
}

@Injectable()
export class PrismaCancellationRepository implements CancellationRepository {
  // Explicit `@Inject`: tsx/esbuild never emits `design:paramtypes`, so an
  // inferred token would be undefined in the OpenAPI preview (see PrismaService).
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findPolicyByHotel(hotelId: string): Promise<PolicyRecord | null> {
    const row = await this.prisma.cancellationPolicy.findUnique({
      where: { hotelId },
      select: POLICY_SELECT,
    });
    if (!row) return null;
    return toRecord(row);
  }

  async hotelExists(hotelId: string): Promise<boolean> {
    const found = await this.prisma.hotel.count({ where: { id: hotelId } });
    return found > 0;
  }

  async upsertPolicy(
    hotelId: string,
    tiers: PolicyTierRow[],
    noRefundWithinHours: number,
  ): Promise<PolicyRecord> {
    const sorted = [...tiers].sort((a, b) => b.daysBefore - a.daysBefore);
    const existing = await this.prisma.cancellationPolicy.findUnique({
      where: { hotelId },
      select: { version: true },
    });
    const row = await this.prisma.cancellationPolicy.upsert({
      where: { hotelId },
      create: {
        hotelId,
        tiers: sorted as unknown as Prisma.InputJsonValue,
        noRefundWithinHours,
        version: 1,
      },
      update: {
        tiers: sorted as unknown as Prisma.InputJsonValue,
        noRefundWithinHours,
        version: (existing?.version ?? 0) + 1,
      },
      select: POLICY_SELECT,
    });
    return toRecord(row);
  }
}
