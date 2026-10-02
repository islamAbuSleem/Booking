/**
 * T25 — the admin read/write contract, expressed in domain terms.
 *
 * The admin service depends on this interface, never on `PrismaService`: moderation
 * rules (including "an admin cannot suspend themselves", which lives in the service,
 * not here) are then testable with a stub and no database. `PrismaAdminRepository` is
 * the one implementation, and it is the only place a Prisma type appears.
 *
 * Everything here is already scoped: the controller admits only ADMINs, so these
 * methods take no caller id — there is no per-row ownership to check, unlike the host
 * repository. The audit trail is the API log (actor id on every log line), not a table.
 */

export const ADMIN_REPOSITORY = Symbol('ADMIN_REPOSITORY');

export type AdminHotelStatus = 'PENDING' | 'PUBLISHED' | 'REJECTED' | 'SUSPENDED';
export type AdminUserStatus = 'ACTIVE' | 'SUSPENDED';
export type AdminReviewStatus = 'VISIBLE' | 'HIDDEN';

export interface AdminHotelItem {
  id: string;
  slug: string;
  name: string;
  city: string;
  country: string;
  status: AdminHotelStatus;
  host: { id: string; name: string; email: string };
  roomsCount: number;
  createdAt: string;
}

export interface AdminUserItem {
  id: string;
  email: string;
  name: string;
  role: 'GUEST' | 'HOST' | 'ADMIN';
  status: AdminUserStatus;
  createdAt: string;
}

export interface AdminReviewItem {
  id: string;
  hotel: { id: string; name: string };
  author: { id: string; name: string };
  rating: number;
  title: string;
  body: string;
  status: AdminReviewStatus;
  createdAt: string;
}

export interface AdminStats {
  usersTotal: number;
  usersByRole: { GUEST: number; HOST: number; ADMIN: number };
  hotelsTotal: number;
  hotelsByStatus: Record<AdminHotelStatus, number>;
  bookingsTotal: number;
  bookingsByStatus: { PENDING: number; CONFIRMED: number; COMPLETED: number; CANCELLED: number };
  reviewsTotal: number;
  reviewsHidden: number;
}

export interface AdminRepository {
  stats(): Promise<AdminStats>;
  listHotels(status?: AdminHotelStatus): Promise<AdminHotelItem[]>;
  updateHotelStatus(id: string, status: AdminHotelStatus): Promise<AdminHotelItem>;
  listUsers(query?: string, role?: 'GUEST' | 'HOST' | 'ADMIN'): Promise<AdminUserItem[]>;
  updateUserStatus(id: string, status: AdminUserStatus): Promise<AdminUserItem>;
  listReviews(status?: AdminReviewStatus): Promise<AdminReviewItem[]>;
  updateReviewStatus(id: string, status: AdminReviewStatus): Promise<AdminReviewItem>;
}
