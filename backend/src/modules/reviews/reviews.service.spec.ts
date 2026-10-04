import { describe, expect, it, vi } from 'vitest';
import type {
  BookingRecord,
  BookingRepository,
} from '../../prisma/bookings.repository.js';
import type {
  ReviewRecord,
  ReviewsRepository,
} from '../../prisma/reviews.repository.js';
import { ReviewsService } from './reviews.service.js';

/**
 * T24 — the review rules with no database: who may write, when, and how often.
 * The wire codes (404/403/400/409) are pinned over HTTP in `test/reviews.e2e-spec.ts`;
 * this file pins the decisions that produce them.
 */

const HOTEL_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_HOTEL_ID = '22222222-2222-4222-8222-222222222222';
const ADA_ID = '33333333-3333-4333-8333-333333333333';
const BO_ID = '44444444-4444-4444-8444-444444444444';
const BOOKING_ID = '55555555-5555-4555-8555-555555555555';

function booking(overrides: Partial<BookingRecord> = {}): BookingRecord {
  return {
    id: BOOKING_ID,
    reference: 'GB-0001',
    status: 'COMPLETED',
    guestId: ADA_ID,
    roomId: '66666666-6666-4666-8666-666666666666',
    hotelId: HOTEL_ID,
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

function review(overrides: Partial<ReviewRecord> = {}): ReviewRecord {
  return {
    id: '77777777-7777-4777-8777-777777777777',
    bookingId: BOOKING_ID,
    authorId: ADA_ID,
    authorName: 'Ada',
    hotelId: HOTEL_ID,
    rating: 5,
    title: 'Loved it',
    body: 'The courtyard was quiet.',
    status: 'VISIBLE',
    createdAt: new Date('2026-06-05T10:00:00.000Z'),
    ...overrides,
  };
}

interface World {
  bookings: Map<string, BookingRecord>;
  reviews: Map<string, ReviewRecord>;
  hotels: Set<string>;
}

function setup(world: Partial<World> = {}) {
  const bookingsRepo: BookingRepository = {
    createPending: () => { throw new Error('unused'); },
    findById: (id: string) => Promise.resolve(world.bookings?.get(id) ?? null),
    findForOwner: () => Promise.resolve([]),
    findHotelSnapshot: () => Promise.resolve(null),
    findHotelSnapshots: () => Promise.resolve([]),
    findRoomPriceCurrency: () => Promise.resolve(null),
    updateStatus: () => Promise.resolve(null),
    transitionStatus: () => Promise.resolve(null),
  };
  const reviewsRepo: ReviewsRepository = {
    resolveHotelId: (idOrSlug: string) => Promise.resolve(world.hotels?.has(idOrSlug) ? idOrSlug : null),
    findByBooking: (id: string) => Promise.resolve(world.reviews?.get(id) ?? null),
    create: (data) => Promise.resolve(review({ ...data, authorName: 'Ada' })),
    listByHotel: () => Promise.resolve({ items: [], total: 0, average: null }),
  };
  return new ReviewsService(bookingsRepo, reviewsRepo);
}

const INPUT = { bookingId: BOOKING_ID, rating: 5, title: 'Loved it', body: 'The courtyard was quiet.' };

describe('ReviewsService', () => {
  it('writes the review for a completed stay owned by the caller', async () => {
    const service = setup({ bookings: new Map([[BOOKING_ID, booking()]]), reviews: new Map(), hotels: new Set([HOTEL_ID]) });

    const created = await service.create(ADA_ID, HOTEL_ID, INPUT);

    expect(created).toMatchObject({ bookingId: BOOKING_ID, rating: 5, status: 'VISIBLE' });
    expect(created.author).toEqual({ id: ADA_ID, name: 'Ada' });
  });

  it('404s a booking that does not exist', async () => {
    const service = setup({ bookings: new Map(), reviews: new Map(), hotels: new Set([HOTEL_ID]) });

    await expect(service.create(ADA_ID, HOTEL_ID, INPUT)).rejects.toMatchObject({
      response: { code: 'BOOKING_NOT_FOUND' },
    });
  });

  it('403s a booking owned by someone else', async () => {
    const service = setup({ bookings: new Map([[BOOKING_ID, booking()]]), reviews: new Map(), hotels: new Set([HOTEL_ID]) });

    await expect(service.create(BO_ID, HOTEL_ID, INPUT)).rejects.toMatchObject({
      response: { code: 'NOT_BOOKING_OWNER' },
    });
  });

  it('400s a stay that is confirmed but not completed', async () => {
    const service = setup({
      bookings: new Map([[BOOKING_ID, booking({ status: 'CONFIRMED' })]]),
      reviews: new Map(),
      hotels: new Set([HOTEL_ID]),
    });

    await expect(service.create(ADA_ID, HOTEL_ID, INPUT)).rejects.toMatchObject({
      response: { code: 'INVALID_REVIEW_STATE' },
    });
  });

  it('409s a second review for the same stay', async () => {
    const service = setup({
      bookings: new Map([[BOOKING_ID, booking()]]),
      reviews: new Map([[BOOKING_ID, review()]]),
      hotels: new Set([HOTEL_ID]),
    });

    await expect(service.create(ADA_ID, HOTEL_ID, INPUT)).rejects.toMatchObject({
      response: { code: 'ALREADY_REVIEWED' },
    });
  });

  it('404s a booking posted under the wrong hotel', async () => {
    const service = setup({
      bookings: new Map([[BOOKING_ID, booking({ hotelId: OTHER_HOTEL_ID })]]),
      reviews: new Map(),
      hotels: new Set([HOTEL_ID, OTHER_HOTEL_ID]),
    });

    await expect(service.create(ADA_ID, HOTEL_ID, INPUT)).rejects.toMatchObject({
      response: { code: 'BOOKING_NOT_FOUND' },
    });
  });

  describe('reviewable', () => {
    it('answers true for a reviewable stay', async () => {
      const service = setup({ bookings: new Map([[BOOKING_ID, booking()]]), reviews: new Map() });

      await expect(service.reviewable(ADA_ID, BOOKING_ID)).resolves.toEqual({ canReview: true });
    });

    it('answers NOT_COMPLETED rather than erroring', async () => {
      const service = setup({
        bookings: new Map([[BOOKING_ID, booking({ status: 'CONFIRMED' })]]),
        reviews: new Map(),
      });

      await expect(service.reviewable(ADA_ID, BOOKING_ID)).resolves.toEqual({
        canReview: false,
        reason: 'NOT_COMPLETED',
      });
    });

    it('answers ALREADY_REVIEWED rather than erroring', async () => {
      const service = setup({
        bookings: new Map([[BOOKING_ID, booking()]]),
        reviews: new Map([[BOOKING_ID, review()]]),
      });

      await expect(service.reviewable(ADA_ID, BOOKING_ID)).resolves.toEqual({
        canReview: false,
        reason: 'ALREADY_REVIEWED',
      });
    });
  });
});
