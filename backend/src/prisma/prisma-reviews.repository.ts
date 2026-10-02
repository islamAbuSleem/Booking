import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import {
  type CreateReviewData,
  type ReviewListPage,
  type ReviewRecord,
  type ReviewsRepository,
} from './reviews.repository.js';
import { PrismaService } from './prisma.service.js';

const REVIEW_SELECT = {
  id: true,
  bookingId: true,
  authorId: true,
  author: { select: { name: true } },
  hotelId: true,
  rating: true,
  title: true,
  body: true,
  status: true,
  createdAt: true,
} satisfies Prisma.ReviewSelect;

type ReviewRow = Prisma.ReviewGetPayload<{ select: typeof REVIEW_SELECT }>;

/**
 * T24 — Prisma implementation of `ReviewsRepository`.
 *
 * No aggregate column is maintained on `hotels`: the average is derived here at read
 * time from the same VISIBLE rows the list returns, so there is no second number to
 * drift. "Recalculate the aggregate on write" is therefore a no-op by construction —
 * the next read already reflects the new row.
 */
@Injectable()
export class PrismaReviewsRepository implements ReviewsRepository {
  // Explicit `@Inject`: tsx/esbuild never emits `design:paramtypes`, so an
  // inferred token would be undefined in the OpenAPI preview (see PrismaService).
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async resolveHotelId(idOrSlug: string): Promise<string | null> {
    const row = await this.prisma.hotel.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  async findByBooking(bookingId: string): Promise<ReviewRecord | null> {
    const row = await this.prisma.review.findUnique({
      where: { bookingId },
      select: REVIEW_SELECT,
    });
    return row ? toRecord(row) : null;
  }

  async create(data: CreateReviewData): Promise<ReviewRecord> {
    const row = await this.prisma.review.create({
      data: { ...data, status: 'VISIBLE' },
      select: REVIEW_SELECT,
    });
    return toRecord(row);
  }

  async listByHotel(hotelId: string, page: number, pageSize: number): Promise<ReviewListPage> {
    const where = { hotelId, status: 'VISIBLE' as const };
    const [rows, total, aggregate] = await Promise.all([
      this.prisma.review.findMany({
        where,
        select: REVIEW_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.review.count({ where }),
      this.prisma.review.aggregate({
        where,
        _avg: { rating: true },
      }),
    ]);
    const average = aggregate._avg.rating;
    return {
      items: rows.map(toRecord),
      total,
      average: average === null ? null : Math.round(average * 100) / 100,
    };
  }
}

function toRecord(row: ReviewRow): ReviewRecord {
  return {
    id: row.id,
    bookingId: row.bookingId,
    authorId: row.authorId,
    authorName: row.author.name,
    hotelId: row.hotelId,
    rating: row.rating,
    title: row.title,
    body: row.body,
    status: row.status,
    createdAt: row.createdAt,
  };
}
