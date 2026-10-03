/**
 * T24 — the reviews read/write contract, expressed in domain terms.
 *
 * The reviews service depends on this interface, never on `PrismaService`
 * (context/code-standards.md, "Dependency inversion"): the one-review-per-booking rule
 * and the completed-stay gate are then testable with a stub and no database.
 * `PrismaReviewsRepository` is the one implementation, and it is the only place a
 * Prisma type appears.
 */

export const REVIEWS_REPOSITORY = Symbol('REVIEWS_REPOSITORY');

export type ReviewStatus = 'VISIBLE' | 'HIDDEN';

export interface ReviewRecord {
  id: string;
  bookingId: string;
  authorId: string;
  authorName: string;
  hotelId: string;
  rating: number;
  title: string;
  body: string;
  status: ReviewStatus;
  createdAt: Date;
}

export interface CreateReviewData {
  bookingId: string;
  authorId: string;
  hotelId: string;
  rating: number;
  title: string;
  body: string;
}

export interface ReviewListPage {
  items: ReviewRecord[];
  total: number;
  /** 1–5 average over VISIBLE reviews, null when the hotel has none. Never 0. */
  average: number | null;
}

export interface ReviewsRepository {
  /**
   * The hotel's id for a uuid *or* a slug — the frontend links `/hotels/{slug}`, so the
   * reviews list takes the same identifier the detail route does rather than forcing a
   * second round trip to resolve it. Null when no hotel answers to it.
   */
  resolveHotelId(idOrSlug: string): Promise<string | null>;
  /** The one review for a booking, or null. `bookingId` is unique, so at most one. */
  findByBooking(bookingId: string): Promise<ReviewRecord | null>;
  create(data: CreateReviewData): Promise<ReviewRecord>;
  /** Newest first. Only VISIBLE rows — hidden ones are T25's to show, not this list's. */
  listByHotel(hotelId: string, page: number, pageSize: number): Promise<ReviewListPage>;
}
