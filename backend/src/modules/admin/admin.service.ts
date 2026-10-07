import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ApiError } from '../../common/errors/api-error.js';
import {
  ADMIN_REPOSITORY,
  type AdminHotelItem,
  type AdminHotelStatus,
  type AdminListPage,
  type AdminRepository,
  type AdminReviewItem,
  type AdminReviewStatus,
  type AdminStats,
  type AdminUserItem,
  type AdminUserStatus,
} from '../../prisma/admin.repository.js';

/**
 * T25 — moderation. Every action is audit-logged with the acting admin's id: the log
 * line names who did what to which row, because a moderation queue without an audit
 * trail is a liability the moment two admins disagree.
 *
 * One hard rule lives here rather than in the repository: an admin cannot suspend
 * their own account. The repository would obey blindly — it has no notion of a caller —
 * so the service refuses before delegating. Reactivating oneself is allowed; only the
 * suspend direction strands the actor.
 */
@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @Inject(ADMIN_REPOSITORY) private readonly admin: AdminRepository,
  ) {}

  stats(adminId: string): Promise<AdminStats> {
    this.logger.log(`[admin] ${adminId} read stats`);
    return this.admin.stats();
  }

  async listings(
    adminId: string,
    status?: AdminHotelStatus,
    page = 1,
    pageSize = 20,
  ): Promise<AdminListPage<AdminHotelItem>> {
    this.logger.log(`[admin] ${adminId} listed hotels status=${status ?? 'any'} page=${page}`);
    return this.admin.listHotels(status, page, pageSize);
  }

  async setListingStatus(
    adminId: string,
    id: string,
    status: AdminHotelStatus,
  ): Promise<AdminHotelItem> {
    const hotel = await this.admin.updateHotelStatus(id, status);
    this.logger.log(`[admin] ${adminId} set hotel ${id} to ${status}`);
    return hotel;
  }

  async users(
    adminId: string,
    query?: string,
    role?: 'GUEST' | 'HOST' | 'ADMIN',
    page = 1,
    pageSize = 20,
  ): Promise<AdminListPage<AdminUserItem>> {
    this.logger.log(`[admin] ${adminId} listed users query=${query ?? ''} role=${role ?? 'any'} page=${page}`);
    return this.admin.listUsers(query, role, page, pageSize);
  }

  async setUserStatus(
    adminId: string,
    id: string,
    status: AdminUserStatus,
  ): Promise<AdminUserItem> {
    if (id === adminId && status === 'SUSPENDED') {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        'ADMIN_SELF_SUSPEND',
        'Admins cannot suspend their own account',
      );
    }
    const user = await this.admin.updateUserStatus(id, status);
    this.logger.log(`[admin] ${adminId} set user ${id} to ${status}`);
    return user;
  }

  async reviews(
    adminId: string,
    status?: AdminReviewStatus,
    page = 1,
    pageSize = 20,
  ): Promise<AdminListPage<AdminReviewItem>> {
    this.logger.log(`[admin] ${adminId} listed reviews status=${status ?? 'any'} page=${page}`);
    return this.admin.listReviews(status, page, pageSize);
  }

  async setReviewStatus(
    adminId: string,
    id: string,
    status: AdminReviewStatus,
  ): Promise<AdminReviewItem> {
    const review = await this.admin.updateReviewStatus(id, status);
    this.logger.log(`[admin] ${adminId} set review ${id} to ${status}`);
    return review;
  }
}
