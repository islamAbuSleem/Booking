import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ApiError, forbidden, notFound } from '../../common/errors/api-error.js';
import {
  BOOKINGS_REPOSITORY,
  type BookingRecord,
  type BookingRepository,
} from '../../prisma/bookings.repository.js';
import {
  REVIEWS_REPOSITORY,
  DuplicateReviewError,
  type ReviewsRepository,
} from '../../prisma/reviews.repository.js';
import type {
  CreateReviewDto,
  ReviewableData,
  ReviewDto,
  ReviewListData,
} from './dto/review.dto.js';

/**
 * T24 — reviews. One review per completed stay, written only by the guest who stayed.
 *
 * The rules, in the order they are checked — each is a different answer and the order
 * is the cheapest-first rejection:
 *
 *   1. No such booking → 404 `BOOKING_NOT_FOUND`.
 *   2. Not the caller's booking → 403 `NOT_BOOKING_OWNER` (the T20 code, same shape).
 *   3. Booking is for a different hotel than the route → 404 `BOOKING_NOT_FOUND`: the
 *      review is posted *under* a hotel, so a booking from another listing is "not
 *      found here" rather than a 400 about the body.
 *   4. Stay not COMPLETED → 400 `INVALID_REVIEW_STATE`. A CONFIRMED booking cannot be
 *      reviewed early, and a CANCELLED one never happened.
 *   5. Already reviewed → 409 `ALREADY_REVIEWED`. The unique `bookingId` is the
 *      authority; a read-then-write would race, so the repository reports the
 *      duplicate and this layer names it.
 *
 * Depends on repository tokens, never on `PrismaService`, so every rule below is
 * testable with stubs and no database.
 */
@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(
    @Inject(BOOKINGS_REPOSITORY) private readonly bookings: BookingRepository,
    @Inject(REVIEWS_REPOSITORY) private readonly reviews: ReviewsRepository,
  ) {}

  async create(
    callerId: string,
    hotelId: string,
    input: CreateReviewDto,
  ): Promise<ReviewDto> {
    const booking = await this.requireOwnedBooking(callerId, input.bookingId);
    if (booking.hotelId !== hotelId) {
      throw notFound('BOOKING_NOT_FOUND', 'No such booking for this hotel');
    }
    if (booking.status !== 'COMPLETED') {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        'INVALID_REVIEW_STATE',
        'Only completed stays can be reviewed',
      );
    }
    if (await this.reviews.findByBooking(booking.id)) {
      this.alreadyReviewed();
    }

    let created;
    try {
      created = await this.reviews.create({
        bookingId: booking.id,
        authorId: callerId,
        hotelId,
        rating: input.rating,
        title: input.title.trim(),
        body: input.body.trim(),
      });
    } catch (error: unknown) {
      // The unique `bookingId` is the authority, and two concurrent POSTs both clear the
      // check above. The repository reports the duplicate; this layer names it, so the
      // client gets `ALREADY_REVIEWED` rather than a generic CONFLICT either way.
      if (error instanceof DuplicateReviewError) this.alreadyReviewed();
      throw error;
    }
    this.logger.log(`[reviews] review ${created.id} for booking ${booking.id}`);
    return toDto(created);
  }

  /** One answer for both the check-then-write miss and the race that beats it. */
  private alreadyReviewed(): never {
    throw new ApiError(
      HttpStatus.CONFLICT,
      'ALREADY_REVIEWED',
      'This stay already has a review',
    );
  }

  async list(idOrSlug: string, page: number, pageSize: number): Promise<ReviewListData> {
    const hotelId = await this.reviews.resolveHotelId(idOrSlug);
    if (!hotelId) {
      throw notFound('HOTEL_NOT_FOUND', 'Hotel not found');
    }
    const { items, total, average } = await this.reviews.listByHotel(hotelId, page, pageSize);
    return { items: items.map(toDto), total, average };
  }

  /**
   * Whether the caller may review this booking right now. 404/403 for the same
   * reasons as `create` — but a non-completed stay or an existing review is data
   * (`{ canReview: false, reason }`), not an error, because the form branches on it.
   */
  async reviewable(callerId: string, bookingId: string): Promise<ReviewableData> {
    const booking = await this.requireOwnedBooking(callerId, bookingId);
    if (booking.status !== 'COMPLETED') {
      return { canReview: false, reason: 'NOT_COMPLETED' };
    }
    if (await this.reviews.findByBooking(booking.id)) {
      return { canReview: false, reason: 'ALREADY_REVIEWED' };
    }
    return { canReview: true };
  }

  private async requireOwnedBooking(callerId: string, bookingId: string): Promise<BookingRecord> {
    const booking = await this.bookings.findById(bookingId);
    if (!booking) throw notFound('BOOKING_NOT_FOUND', 'Booking not found');
    // 403, not 404: the T20 convention — a caller probing another guest's id learns
    // the row exists but not its contents.
    if (booking.guestId !== callerId) {
      throw forbidden('NOT_BOOKING_OWNER', 'This booking belongs to another guest');
    }
    return booking;
  }
}

function toDto(record: {
  id: string;
  bookingId: string;
  authorId: string;
  authorName: string;
  hotelId: string;
  rating: number;
  title: string;
  body: string;
  status: 'VISIBLE' | 'HIDDEN';
  createdAt: Date;
}): ReviewDto {
  return {
    id: record.id,
    bookingId: record.bookingId,
    author: { id: record.authorId, name: record.authorName },
    hotelId: record.hotelId,
    rating: record.rating,
    title: record.title,
    body: record.body,
    status: record.status,
    createdAt: record.createdAt.toISOString(),
  };
}
