import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import {
  type AdminHotelItem,
  type AdminHotelStatus,
  type AdminRepository,
  type AdminReviewItem,
  type AdminReviewStatus,
  type AdminStats,
  type AdminUserItem,
  type AdminUserStatus,
} from './admin.repository.js';
import { PrismaService } from './prisma.service.js';

const HOTEL_SELECT = {
  id: true,
  slug: true,
  name: true,
  city: true,
  country: true,
  status: true,
  createdAt: true,
  host: { select: { id: true, name: true, email: true } },
  _count: { select: { rooms: true } },
} satisfies Prisma.HotelSelect;

const REVIEW_SELECT = {
  id: true,
  hotel: { select: { id: true, name: true } },
  author: { select: { id: true, name: true } },
  rating: true,
  title: true,
  body: true,
  status: true,
  createdAt: true,
} satisfies Prisma.ReviewSelect;

/**
 * T25 — Prisma implementation of `AdminRepository`.
 *
 * Moderation reads are bounded rather than paginated: the console serves a team, not the
 * public, so there is no paging UI to drive — but "short queue" is not a guarantee, and an
 * unbounded `findMany` on `users` loads every row and every `contains` search compiles to
 * an `ILIKE '%term%'` no index can serve. The seam if they ever outgrow this cap is these
 * list methods — nothing above them changes.
 */

/**
 * Rows one console screen may pull. Generous enough that no realistic queue is truncated,
 * and bounded so a full-table load is never one refresh away.
 */
const MODERATION_ROW_CAP = 500;
@Injectable()
export class PrismaAdminRepository implements AdminRepository {
  // Explicit `@Inject`: tsx/esbuild never emits `design:paramtypes`, so an
  // inferred token would be undefined in the OpenAPI preview (see PrismaService).
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async stats(): Promise<AdminStats> {
    // Independent aggregates, so they run concurrently rather than as a waterfall.
    const [users, hotels, bookings, reviews, hidden] = await Promise.all([
      this.prisma.user.groupBy({ by: ['role'], _count: true }),
      this.prisma.hotel.groupBy({ by: ['status'], _count: true }),
      this.prisma.booking.groupBy({ by: ['status'], _count: true }),
      this.prisma.review.count(),
      this.prisma.review.count({ where: { status: 'HIDDEN' } }),
    ]);

    const roleCount = (role: 'GUEST' | 'HOST' | 'ADMIN') =>
      users.find((row) => row.role === role)?._count ?? 0;
    const hotelCount = (status: AdminHotelStatus) =>
      hotels.find((row) => row.status === status)?._count ?? 0;
    const bookingCount = (status: 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED') =>
      bookings.find((row) => row.status === status)?._count ?? 0;

    return {
      usersTotal: users.reduce((sum, row) => sum + row._count, 0),
      usersByRole: { GUEST: roleCount('GUEST'), HOST: roleCount('HOST'), ADMIN: roleCount('ADMIN') },
      hotelsTotal: hotels.reduce((sum, row) => sum + row._count, 0),
      hotelsByStatus: {
        PENDING: hotelCount('PENDING'),
        PUBLISHED: hotelCount('PUBLISHED'),
        REJECTED: hotelCount('REJECTED'),
        SUSPENDED: hotelCount('SUSPENDED'),
      },
      bookingsTotal: bookings.reduce((sum, row) => sum + row._count, 0),
      bookingsByStatus: {
        PENDING: bookingCount('PENDING'),
        CONFIRMED: bookingCount('CONFIRMED'),
        COMPLETED: bookingCount('COMPLETED'),
        CANCELLED: bookingCount('CANCELLED'),
      },
      reviewsTotal: reviews,
      reviewsHidden: hidden,
    };
  }

  async listHotels(status?: AdminHotelStatus): Promise<AdminHotelItem[]> {
    const rows = await this.prisma.hotel.findMany({
      where: status ? { status } : {},
      select: HOTEL_SELECT,
      orderBy: { createdAt: 'desc' },
      take: MODERATION_ROW_CAP,
    });
    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      city: row.city,
      country: row.country,
      status: row.status,
      host: row.host,
      roomsCount: row._count.rooms,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async updateHotelStatus(id: string, status: AdminHotelStatus): Promise<AdminHotelItem> {
    const row = await this.prisma.hotel.update({
      where: { id },
      data: { status },
      select: HOTEL_SELECT,
    });
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      city: row.city,
      country: row.country,
      status: row.status,
      host: row.host,
      roomsCount: row._count.rooms,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async listUsers(query?: string, role?: 'GUEST' | 'HOST' | 'ADMIN'): Promise<AdminUserItem[]> {
    const term = query?.trim();
    const rows = await this.prisma.user.findMany({
      where: {
        ...(role ? { role } : {}),
        ...(term
          ? {
              OR: [
                { email: { contains: term, mode: 'insensitive' } },
                { name: { contains: term, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: { id: true, email: true, name: true, role: true, status: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: MODERATION_ROW_CAP,
    });
    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async updateUserStatus(id: string, status: AdminUserStatus): Promise<AdminUserItem> {
    const row = await this.prisma.user.update({
      where: { id },
      data: { status },
      select: { id: true, email: true, name: true, role: true, status: true, createdAt: true },
    });
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async listReviews(status?: AdminReviewStatus): Promise<AdminReviewItem[]> {
    const rows = await this.prisma.review.findMany({
      where: status ? { status } : {},
      select: REVIEW_SELECT,
      orderBy: { createdAt: 'desc' },
      take: MODERATION_ROW_CAP,
    });
    return rows.map((row) => ({
      id: row.id,
      hotel: row.hotel,
      author: row.author,
      rating: row.rating,
      title: row.title,
      body: row.body,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async updateReviewStatus(id: string, status: AdminReviewStatus): Promise<AdminReviewItem> {
    const row = await this.prisma.review.update({
      where: { id },
      data: { status },
      select: REVIEW_SELECT,
    });
    return {
      id: row.id,
      hotel: row.hotel,
      author: row.author,
      rating: row.rating,
      title: row.title,
      body: row.body,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
