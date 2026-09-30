import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import {
  type HotelCard,
  type HotelDetail,
  type HotelListPage,
  type HotelSearchCriteria,
  type HotelsRepository,
  type ImageSummary,
  type Money,
  type RatingSummary,
} from './hotels.repository.js';
import { PrismaService } from './prisma.service.js';

/** The columns a hotel card needs. Nothing else is read on a list endpoint. */
const CARD_SELECT = {
  id: true,
  slug: true,
  name: true,
  city: true,
  country: true,
  starRating: true,
  amenities: { select: { amenityId: true } },
  images: {
    where: { roomId: null },
    orderBy: [{ isCover: 'desc' }, { sortOrder: 'asc' }],
    take: 1,
    select: {
      url: true,
      altText: true,
      aspect: true,
      width: true,
      height: true,
    },
  },
  rooms: {
    // `currency` has to come along: the minimum is only meaningful within the currency
    // that was asked for, and T39 adds more rows to this table without touching the
    // select.
    select: {
      maxGuests: true,
      prices: { select: { currency: true, priceCents: true } },
    },
  },
} satisfies Prisma.HotelSelect;

const DETAIL_SELECT = {
  id: true,
  slug: true,
  name: true,
  description: true,
  addressLine: true,
  city: true,
  country: true,
  lat: true,
  lng: true,
  starRating: true,
  status: true,
  checkInTime: true,
  checkOutTime: true,
  amenities: { select: { amenityId: true } },
  images: {
    where: { roomId: null },
    orderBy: [{ isCover: 'desc' }, { sortOrder: 'asc' }],
    select: {
      url: true,
      altText: true,
      aspect: true,
      width: true,
      height: true,
    },
  },
  rooms: {
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      name: true,
      description: true,
      bedType: true,
      maxGuests: true,
      totalInventory: true,
      prices: { select: { currency: true, priceCents: true } },
      images: {
        orderBy: [{ isCover: 'desc' }, { sortOrder: 'asc' }],
        select: {
          url: true,
          altText: true,
          aspect: true,
          width: true,
          height: true,
        },
      },
    },
  },
  host: { select: { id: true, name: true } },
} satisfies Prisma.HotelSelect;

/**
 * The SQL filter for a public search. Only PUBLISHED is ever visible, and that is part
 * of the `where` clause rather than a filter applied afterwards — a non-published row
 * must not be able to leak through a page boundary.
 *
 * Exported (and pure) so the rule can be unit-tested with no database.
 */
export function buildPublishedWhere(
  criteria: HotelSearchCriteria,
): Prisma.HotelWhereInput {
  // Built as one filter object, not two spreads: a second spread of `priceCents` would
  // replace the first and silently drop the `gte` bound.
  const priceCents: Prisma.IntFilter | undefined =
    criteria.minPriceCents !== undefined || criteria.maxPriceCents !== undefined
      ? {
          ...(criteria.minPriceCents !== undefined
            ? { gte: criteria.minPriceCents }
            : {}),
          ...(criteria.maxPriceCents !== undefined
            ? { lte: criteria.maxPriceCents }
            : {}),
        }
      : undefined;

  return {
    status: 'PUBLISHED',
    ...(criteria.city
      ? { city: { equals: criteria.city, mode: 'insensitive' } }
      : {}),
    ...(criteria.amenities.length > 0
      ? {
          AND: criteria.amenities.map((amenityId) => ({
            amenities: { some: { amenityId } },
          })),
        }
      : {}),
    rooms: {
      some: {
        maxGuests: { gte: criteria.guests },
        // A room with no price row in this currency does not qualify, and a hotel with no
        // qualifying room is not returned. A missing price is never treated as free.
        prices: {
          some: {
            currency: criteria.currency,
            ...(priceCents ? { priceCents } : {}),
          },
        },
      },
    },
  };
}

type CardRow = Prisma.HotelGetPayload<{ select: typeof CARD_SELECT }>;
type DetailRow = Prisma.HotelGetPayload<{ select: typeof DETAIL_SELECT }>;

interface ReviewAggregate {
  count: number;
  /** Null when the hotel has no VISIBLE reviews. Never coerced to zero. */
  average: number | null;
}

const EMPTY: ReviewAggregate = { count: 0, average: null };

function toRatingSummary(reviews: ReviewAggregate): RatingSummary {
  return {
    average:
      reviews.average === null ? null : Math.round(reviews.average * 100) / 100,
    totalReviews: reviews.count,
  };
}

/**
 * T16 — Prisma implementation of `HotelsRepository`.
 *
 * Two known costs, both documented rather than hidden:
 *
 *   * Sorting and pagination happen in the service, over the rows this method returns,
 *     because "cheapest room that fits N guests" and "average review score" are derived
 *     values and not columns on `hotels`. That means this method reads every matching
 *     row before the page is cut. It is correct and narrow (a `select`, no relation
 *     graph) but it will need a SQL view or a denormalised price column before it will
 *     survive a large inventory. The seam is this method plus `findPublished`'s
 *     signature; nothing above it changes.
 *
 *   * A hotel with no `room_prices` row in the requested currency has no price. That is
 *     reported as `null`, never as zero (context/architecture.md, "Pricing").
 */
@Injectable()
export class PrismaHotelsRepository implements HotelsRepository {
  // Explicit `@Inject`: tsx/esbuild never emits `design:paramtypes`, so an
  // inferred token would be undefined in the OpenAPI preview (see PrismaService).
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findPublished(criteria: HotelSearchCriteria): Promise<HotelListPage> {
    const where = buildPublishedWhere(criteria);

    // Independent queries, so they run concurrently rather than as a waterfall.
    const [rows, total] = await Promise.all([
      this.prisma.hotel.findMany({ where, select: CARD_SELECT }),
      this.prisma.hotel.count({ where }),
    ]);

    const aggregates = await this.reviewAggregates(rows.map((row) => row.id));

    const items = rows.map((row) =>
      this.toCard(row, criteria, aggregates.get(row.id) ?? EMPTY),
    );
    return { items, total };
  }

  async findById(id: string, currency: string): Promise<HotelDetail | null> {
    const row = await this.prisma.hotel.findFirst({
      where: { OR: [{ id }, { slug: id }] },
      select: DETAIL_SELECT,
    });
    if (!row) return null;

    // One aggregate, not two: `_avg` and `_count` are the same scan, and a second query
    // for the count was a whole extra round trip per detail page view.
    const reviews = await this.prisma.review.aggregate({
      where: { hotelId: row.id, status: 'VISIBLE' },
      _avg: { rating: true },
      _count: { _all: true },
    });
    return this.toDetail(row, currency, {
      count: reviews._count._all,
      average: reviews._avg.rating,
    });
  }

  private async reviewAggregates(
    hotelIds: string[],
  ): Promise<Map<string, ReviewAggregate>> {
    if (hotelIds.length === 0) return new Map();
    const grouped = await this.prisma.review.groupBy({
      by: ['hotelId'],
      where: { hotelId: { in: hotelIds }, status: 'VISIBLE' },
      _avg: { rating: true },
      _count: { _all: true },
    });
    return new Map(
      grouped.map((row) => [
        row.hotelId,
        { count: row._count._all, average: row._avg.rating },
      ]),
    );
  }

  private toCard(
    row: CardRow,
    criteria: HotelSearchCriteria,
    reviews: ReviewAggregate,
  ): HotelCard {
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      city: row.city,
      country: row.country,
      starRating: row.starRating,
      coverImage: row.images[0] ? toImageSummary(row.images[0]) : null,
      amenityIds: row.amenities.map((link) => link.amenityId),
      rating: toRatingSummary(reviews),
      priceFrom: this.cheapestFitting(row, criteria),
      currency: criteria.currency,
    };
  }

  private cheapestFitting(
    row: CardRow,
    criteria: HotelSearchCriteria,
  ): Money | null {
    let best: number | null = null;
    for (const room of row.rooms) {
      if (room.maxGuests < criteria.guests) continue;
      for (const price of room.prices) {
        if (price.currency !== criteria.currency) continue;
        if (best === null || price.priceCents < best) best = price.priceCents;
      }
    }
    return best === null
      ? null
      : { amountCents: best, currency: criteria.currency };
  }

  private toDetail(
    row: DetailRow,
    currency: string,
    reviews: ReviewAggregate,
  ): HotelDetail {
    const images = row.images.map(toImageSummary);
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      addressLine: row.addressLine,
      city: row.city,
      country: row.country,
      lat: row.lat,
      lng: row.lng,
      starRating: row.starRating,
      status: row.status,
      checkInTime: row.checkInTime,
      checkOutTime: row.checkOutTime,
      currency,
      coverImage: images[0] ?? null,
      images,
      amenityIds: row.amenities.map((link) => link.amenityId),
      rating: toRatingSummary(reviews),
      rooms: row.rooms.map((room) => {
        const price = room.prices.find(
          (candidate) => candidate.currency === currency,
        );
        return {
          id: room.id,
          name: room.name,
          description: room.description,
          bedType: room.bedType,
          maxGuests: room.maxGuests,
          totalInventory: room.totalInventory,
          price:
            price === undefined
              ? null
              : { amountCents: price.priceCents, currency: price.currency },
          images: room.images.map(toImageSummary),
        };
      }),
      host: row.host,
    };
  }
}

function toImageSummary(image: {
  url: string;
  altText: string | null;
  aspect: string;
  width: number;
  height: number;
}): ImageSummary {
  return {
    url: image.url,
    altText: image.altText,
    aspect: image.aspect,
    width: image.width,
    height: image.height,
  };
}
