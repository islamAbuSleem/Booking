import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import {
  ApiError,
  notFound,
} from '../../common/errors/api-error.js';
import {
  BOOKINGS_REPOSITORY,
  type BookingRepository,
} from '../../prisma/bookings.repository.js';
import {
  CANCELLATION_REPOSITORY,
  type CancellationRepository,
} from '../../prisma/cancellation.repository.js';
import {
  DEFAULT_POLICY,
  DEFAULT_POLICY_VERSION,
  quoteRefundPercent,
  refundCents,
  type PolicyTier,
} from './cancellation-policy.js';
import {
  type PolicyDto,
  type QuoteDto,
  type UpdatePolicy,
} from './dto/cancellation.dto.js';

/**
 * T37 — the cancellation-policy rules. The refund for a cancellation is computed once,
 * here, from the whole elapsed time between now and check-in: the pure function in
 * `cancellation-policy.ts` takes the timestamp as an argument, so the arithmetic is
 * fully testable and the service only wires rows to it.
 *
 * A hotel with no stored row gets the API default, never "no policy". Ownership of the
 * PUT is enforced by the host controller (which asserts the listing first); this
 * service never sees a host id.
 *
 * Depends on repository interfaces, never on `PrismaService` (context/code-standards.md,
 * "Dependency inversion"), so every rule below is testable with fakes and no database.
 */
@Injectable()
export class CancellationService {
  private readonly logger = new Logger(CancellationService.name);

  constructor(
    @Inject(CANCELLATION_REPOSITORY)
    private readonly policies: CancellationRepository,
    @Inject(BOOKINGS_REPOSITORY)
    private readonly bookings: BookingRepository,
  ) {}

  /** `GET /api/hotels/:id/cancellation-policy` — stored row, else the default. */
  async getPolicy(hotelId: string): Promise<PolicyDto> {
    if (!(await this.policies.hotelExists(hotelId))) {
      throw notFound('HOTEL_NOT_FOUND', 'Hotel not found');
    }
    const stored = await this.policies.findPolicyByHotel(hotelId);
    if (!stored) {
      return {
        hotelId,
        tiers: DEFAULT_POLICY.tiers,
        noRefundWithinHours: DEFAULT_POLICY.noRefundWithinHours,
        version: DEFAULT_POLICY_VERSION,
      };
    }
    return {
      hotelId: stored.hotelId,
      tiers: stored.tiers,
      noRefundWithinHours: stored.noRefundWithinHours,
      version: stored.version,
    };
  }

  /** `PUT /api/host/hotels/:id/cancellation-policy` — ownership asserted upstream. */
  async setPolicy(hotelId: string, request: UpdatePolicy): Promise<PolicyDto> {
    const tiers: PolicyTier[] = [...request.tiers].sort(
      (a, b) => b.daysBefore - a.daysBefore,
    );
    const stored = await this.policies.upsertPolicy(
      hotelId,
      tiers,
      request.noRefundWithinHours,
    );
    this.logger.log(`[cancellations] policy v${stored.version} for ${hotelId}`);
    return {
      hotelId: stored.hotelId,
      tiers: stored.tiers,
      noRefundWithinHours: stored.noRefundWithinHours,
      version: stored.version,
    };
  }

  /**
   * `POST /api/bookings/:id/cancellation-quote` — the one computation, from the
   * booking's own total and the policy in force. Only CONFIRMED bookings quote:
   * anything else is a 400 with the reason, mirroring the cancel guard.
   */
  async quote(callerId: string, bookingId: string, nowMs: number): Promise<QuoteDto> {
    const record = await this.bookings.findById(bookingId);
    if (!record) throw notFound('BOOKING_NOT_FOUND', 'Booking not found');
    if (record.guestId !== callerId) {
      throw new ApiError(
        HttpStatus.FORBIDDEN,
        'NOT_BOOKING_OWNER',
        'This booking belongs to a different guest',
      );
    }
    if (record.status !== 'CONFIRMED') {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        'INVALID_CANCEL_STATE',
        'Only a confirmed booking can be cancelled',
      );
    }

    const stored = await this.policies.findPolicyByHotel(record.hotelId);
    const policy = stored ?? DEFAULT_POLICY;
    const version = stored ? stored.version : DEFAULT_POLICY_VERSION;
    const percent = quoteRefundPercent({
      nowMs,
      checkInMs: Date.parse(`${record.checkIn}T00:00:00Z`),
      policy,
    });
    return {
      refundPercent: percent,
      refundCents: refundCents(record.totalCents, percent),
      currency: record.currency,
      policyVersion: version,
    };
  }
}
