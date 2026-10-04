/**
 * The hotels read contract, expressed in domain terms.
 *
 * T16 depends on this interface, not on `PrismaService` (context/code-standards.md,
 * "Dependency inversion"): the search, sort and pagination logic is then testable with no
 * Nest container, no database and no network. `PrismaHotelsRepository` is the one
 * implementation, and it is the only place a Prisma type appears.
 *
 * The shapes below are already projections. A list row carries a cover image, an amenity
 * id list and a "from" price — never the room inventory, never the full image set, never
 * review bodies.
 */

export const HOTELS_REPOSITORY = Symbol('HOTELS_REPOSITORY');

export const DEFAULT_CURRENCY = 'USD';

/** Mirrors the `hotels.status` enum without importing a Prisma type into the contract. */
export type HotelVisibility =
  'PENDING' | 'PUBLISHED' | 'REJECTED' | 'SUSPENDED';

export interface ImageSummary {
  url: string;
  altText: string | null;
  aspect: string;
  width: number;
  height: number;
}

export interface Money {
  amountCents: number;
  currency: string;
}

export interface RatingSummary {
  /** 1-5, matching `reviews.rating` in the schema. Null when there are no reviews. */
  average: number | null;
  totalReviews: number;
}

export interface HotelCard {
  id: string;
  slug: string;
  name: string;
  city: string;
  country: string;
  starRating: number;
  coverImage: ImageSummary | null;
  amenityIds: string[];
  rating: RatingSummary;
  /** Cheapest room that fits the requested party. Null when the hotel has no rooms. */
  priceFrom: Money | null;
  currency: string;
}

export interface HotelRoomDetail {
  id: string;
  name: string;
  description: string;
  bedType: string;
  maxGuests: number;
  totalInventory: number;
  price: Money | null;
  images: ImageSummary[];
}

export interface HotelDetail {
  id: string;
  slug: string;
  name: string;
  description: string;
  addressLine: string;
  city: string;
  country: string;
  lat: number;
  lng: number;
  starRating: number;
  status: HotelVisibility;
  checkInTime: string;
  checkOutTime: string;
  currency: string;
  coverImage: ImageSummary | null;
  images: ImageSummary[];
  amenityIds: string[];
  rating: RatingSummary;
  rooms: HotelRoomDetail[];
  host: { id: string; name: string } | null;
}

/** The subset of the search query the repository needs. Dates arrive validated. */
export interface HotelSearchCriteria {
  city?: string;
  amenities: string[];
  /** Every listed hotel must have at least one room that fits this many guests. */
  guests: number;
  /** Major currency units, e.g. 150 means 150.00. Already converted to cents below. */
  minPriceCents?: number;
  maxPriceCents?: number;
  currency: string;
}

export interface HotelListPage {
  items: HotelCard[];
  total: number;
}

export interface HotelsRepository {
  findPublished(criteria: HotelSearchCriteria): Promise<HotelListPage>;
  /** Returns null when no hotel has that id. Visibility is the service's decision. */
  findById(id: string, currency: string): Promise<HotelDetail | null>;
  /**
   * Every PUBLISHED hotel's slug for the sitemap. Slugs only — the sitemap needs
   * locs, not payloads, and a second field would be a second thing to keep fresh.
   * `updatedAt` rides along as the sitemap `lastmod`.
   */
  listPublishedSlugs(): Promise<{ slug: string; updatedAt: string }[]>;
}
