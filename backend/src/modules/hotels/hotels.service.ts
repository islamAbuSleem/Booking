import { Inject, Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { notFound } from '../../common/errors/api-error.js';
import {
  DEFAULT_CURRENCY,
  HOTELS_REPOSITORY,
  type HotelCard,
  type HotelDetail,
  type HotelsRepository,
} from '../../prisma/hotels.repository.js';
import type { HotelListDataDto } from './dto/hotel.dto.js';
import type { HotelSearchQuery } from './dto/hotel-search-query.js';

/**
 * T16 — hotels read. Thin on purpose: parse, delegate, slice.
 *
 * Depends on the `HOTELS_REPOSITORY` token, never on `PrismaService`, so the sort and
 * pagination rules below are testable with a stub and no database.
 *
 * Known scaling seam: the repository returns every row matching the filters, because
 * "cheapest room that fits N guests" and "average review score" are derived values rather
 * than columns. The sort and the page cut therefore happen in memory here. Correct and
 * narrow, but it will need a SQL view or a denormalised column before it handles a large
 * inventory. Nothing above this method changes when that happens.
 */
@Injectable()
export class HotelsService {
  private readonly logger = new Logger(HotelsService.name);

  constructor(
    @Inject(HOTELS_REPOSITORY) private readonly hotels: HotelsRepository,
  ) {}

  async findAll(query: HotelSearchQuery): Promise<HotelListDataDto> {
    const criteria = {
      ...(query.city ? { city: query.city } : {}),
      amenities: query.amenityIds,
      guests: query.guests,
      ...(query.minPrice !== undefined
        ? { minPriceCents: toCents(query.minPrice) }
        : {}),
      ...(query.maxPrice !== undefined
        ? { maxPriceCents: toCents(query.maxPrice) }
        : {}),
      currency: query.currency,
    };

    const { items, total } = await this.hotels.findPublished(criteria);
    this.logger.log(
      `[hotels] search matched ${total} of status=PUBLISHED (city=${query.city ?? 'any'} guests=${query.guests})`,
    );

    const start = (query.page - 1) * query.pageSize;
    return {
      items: sortHotels(items, query.sort).slice(start, start + query.pageSize),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /**
   * 404s on anything that is not visible to the caller. `viewerId` is the host whose own
   * draft may be read; it is `undefined` until the auth guard lands in T14, so today
   * every caller is a non-owner and every non-`PUBLISHED` hotel is a 404.
   *
   * Anything that is not a uuid is treated as no viewer rather than passed to the
   * comparison: a value reaching this method from a request must never be the thing that
   * decides ownership, and a malformed one can only ever match nothing.
   */
  async findOne(id: string, viewerId?: string): Promise<HotelDetail> {
    const viewer = parseViewerId(viewerId);
    const hotel = await this.hotels.findById(id, DEFAULT_CURRENCY);
    if (!hotel) throw notFound('HOTEL_NOT_FOUND', 'Hotel not found');
    if (hotel.status !== 'PUBLISHED' && hotel.host?.id !== viewer) {
      throw notFound('HOTEL_NOT_FOUND', 'Hotel not found');
    }
    return hotel;
  }
}

type Sort = HotelSearchQuery['sort'];

/** A copy — `sort` must not reorder the array the repository handed us. */
function sortHotels(items: readonly HotelCard[], sort: Sort): HotelCard[] {
  const sorted = [...items];
  switch (sort) {
    case 'price_asc':
      return sorted.sort(byPrice(1));
    case 'price_desc':
      return sorted.sort(byPrice(-1));
    case 'rating_desc':
      // A hotel with no reviews sorts last, not first: `null` is not the best rating.
      return sorted.sort((a, b) => ratingScore(b) - ratingScore(a));
    case 'name_asc':
      return sorted.sort((a, b) => a.name.localeCompare(b.name));
    case 'recommended':
    default:
      return sorted.sort(
        (a, b) => b.starRating - a.starRating || a.name.localeCompare(b.name),
      );
  }
}

/** Hotels with no price in this currency sort last in both directions. */
function byPrice(direction: 1 | -1) {
  return (a: HotelCard, b: HotelCard): number => {
    const left = a.priceFrom?.amountCents;
    const right = b.priceFrom?.amountCents;
    if (left === undefined && right === undefined) return 0;
    if (left === undefined) return 1;
    if (right === undefined) return -1;
    return (left - right) * direction;
  };
}

function ratingScore(card: HotelCard): number {
  return card.rating.average === null
    ? Number.NEGATIVE_INFINITY
    : card.rating.average;
}

/**
 * Decimal-safe, because `1.005 * 100` is `100.49999999999999` in IEEE 754 and a plain
 * `Math.round` turns 10.05 into 1004 cents instead of 1005. Scaling the epsilon by the
 * value fixes the half-step at any magnitude and keeps the sign, so the rounding is the
 * one a person doing the sum on paper would get.
 */
function toCents(amount: number): number {
  return Math.round((amount + Number.EPSILON * amount) * 100);
}

/** `users.id` is a uuid column, so anything else is not a viewer. */
function parseViewerId(viewerId: string | undefined): string | undefined {
  return viewerId !== undefined && z.uuid().safeParse(viewerId).success
    ? viewerId
    : undefined;
}
