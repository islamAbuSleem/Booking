import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles, RolesCode } from '../../common/decorators/roles.decorator.js';
import { zodPipe } from '../../common/pipes/zod-validation.pipe.js';
import { contractRef } from '../hotels/dto/hotel-search.api.js';
import { AdminService } from './admin.service.js';
import {
  adminListingStatusSchema,
  adminListingsQuerySchema,
  adminReviewsQuerySchema,
  adminReviewStatusSchema,
  adminUsersQuerySchema,
  adminUserStatusSchema,
  type AdminHotelDto,
  type AdminListingsQuery,
  type AdminListingStatus,
  type AdminReviewsQuery,
  type AdminReviewStatus,
  type AdminReviewDto,
  type AdminStatsDto,
  type AdminUsersQuery,
  type AdminUserDto,
  type AdminUserStatus,
} from './dto/admin.dto.js';

/**
 * T25 — the moderation console API. Thin on purpose: parse, delegate, log.
 *
 * `@Roles('ADMIN')` admits admins only, and `@RolesCode('ADMIN_REQUIRED')` names the
 * 403 so the client tells "sign in" apart from "signed in as the wrong role". The
 * frontend middleware is UX; this guard is the boundary — a forged request from a
 * host still 403s here.
 */
@ApiTags('Admin')
@Controller('admin')
@Roles('ADMIN')
@RolesCode('ADMIN_REQUIRED')
export class AdminController {
  // Explicit `@Inject`: tsx/esbuild never emits `design:paramtypes`
  // (see PrismaService), so inference would break the OpenAPI preview.
  constructor(
    @Inject(AdminService) private readonly admin: AdminService,
  ) {}

  @Get('stats')
  @ApiOperation({ summary: 'Platform totals for the moderation console' })
  @ApiResponse({
    status: 200,
    description: 'User, hotel, booking, and review totals with breakdowns.',
    schema: { $ref: contractRef('AdminStatsEnvelope') },
  })
  @ApiResponse({
    status: 401,
    description: 'No valid session.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 403,
    description: 'Signed in, but not an admin.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  stats(@CurrentUser('id') adminId: string): Promise<AdminStatsDto> {
    return this.admin.stats(adminId);
  }

  @Get('listings')
  @ApiOperation({
    summary: 'Listings for moderation, optionally filtered by status',
    description:
      'Every status, not just PUBLISHED: the pending queue is the point of this route.',
  })
  @ApiResponse({
    status: 200,
    description: 'Matching hotels, newest first, with their hosts.',
    schema: { $ref: contractRef('AdminHotelListEnvelope') },
  })
  @ApiResponse({
    status: 400,
    description: 'The query string failed validation.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 401,
    description: 'No valid session.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 403,
    description: 'Signed in, but not an admin.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  listings(
    @CurrentUser('id') adminId: string,
    @Query(zodPipe(adminListingsQuerySchema)) query: AdminListingsQuery,
  ): Promise<{ items: AdminHotelDto[] }> {
    return this.admin.listings(adminId, query.status).then((items) => ({ items }));
  }

  @Patch('listings/:id/status')
  @ApiOperation({
    summary: 'Approve, reject, or suspend a listing',
    description: 'PUBLISHED approves, REJECTED refuses, SUSPENDED pulls a live listing.',
  })
  @ApiParam({
    name: 'id',
    required: true,
    type: String,
    format: 'uuid',
    description: 'The hotel, by uuid.',
  })
  @ApiResponse({
    status: 200,
    description: 'The hotel with its new status.',
    schema: { $ref: contractRef('AdminHotelEnvelope') },
  })
  @ApiResponse({
    status: 400,
    description: 'The body failed validation.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 401,
    description: 'No valid session.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 403,
    description: 'Signed in, but not an admin.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 404,
    description: 'No such hotel.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  setListingStatus(
    @CurrentUser('id') adminId: string,
    @Param('id') id: string,
    @Body(zodPipe(adminListingStatusSchema)) body: AdminListingStatus,
  ): Promise<AdminHotelDto> {
    return this.admin.setListingStatus(adminId, id, body.status);
  }

  @Get('users')
  @ApiOperation({
    summary: 'Search users, optionally filtered by query and role',
    description: 'The query matches name or email, case-insensitive.',
  })
  @ApiResponse({
    status: 200,
    description: 'Matching users, newest first.',
    schema: { $ref: contractRef('AdminUserListEnvelope') },
  })
  @ApiResponse({
    status: 400,
    description: 'The query string failed validation.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 401,
    description: 'No valid session.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 403,
    description: 'Signed in, but not an admin.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  users(
    @CurrentUser('id') adminId: string,
    @Query(zodPipe(adminUsersQuerySchema)) query: AdminUsersQuery,
  ): Promise<{ items: AdminUserDto[] }> {
    return this.admin.users(adminId, query.query, query.role).then((items) => ({ items }));
  }

  @Patch('users/:id/status')
  @ApiOperation({
    summary: 'Suspend or reactivate a user',
    description:
      'SUSPENDED stops login and every JWT-authenticated route for the account; ACTIVE ' +
      'restores it. An admin cannot suspend their own account (400 `ADMIN_SELF_SUSPEND`).',
  })
  @ApiParam({
    name: 'id',
    required: true,
    type: String,
    format: 'uuid',
    description: 'The user, by uuid.',
  })
  @ApiResponse({
    status: 200,
    description: 'The user with their new status.',
    schema: { $ref: contractRef('AdminUserEnvelope') },
  })
  @ApiResponse({
    status: 400,
    description: 'The body failed validation, or the admin targeted themselves.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 401,
    description: 'No valid session.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 403,
    description: 'Signed in, but not an admin.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 404,
    description: 'No such user.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  setUserStatus(
    @CurrentUser('id') adminId: string,
    @Param('id') id: string,
    @Body(zodPipe(adminUserStatusSchema)) body: AdminUserStatus,
  ): Promise<AdminUserDto> {
    return this.admin.setUserStatus(adminId, id, body.status);
  }

  @Get('reviews')
  @ApiOperation({
    summary: 'Reviews for moderation, optionally filtered by status',
    description: 'Both VISIBLE and HIDDEN — hiding is reversible, so both directions list.',
  })
  @ApiResponse({
    status: 200,
    description: 'Matching reviews, newest first.',
    schema: { $ref: contractRef('AdminReviewListEnvelope') },
  })
  @ApiResponse({
    status: 400,
    description: 'The query string failed validation.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 401,
    description: 'No valid session.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 403,
    description: 'Signed in, but not an admin.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  reviews(
    @CurrentUser('id') adminId: string,
    @Query(zodPipe(adminReviewsQuerySchema)) query: AdminReviewsQuery,
  ): Promise<{ items: AdminReviewDto[] }> {
    return this.admin.reviews(adminId, query.status).then((items) => ({ items }));
  }

  @Patch('reviews/:id/status')
  @ApiOperation({
    summary: 'Hide or re-show a review',
    description: 'HIDDEN removes it from every public list; VISIBLE restores it.',
  })
  @ApiParam({
    name: 'id',
    required: true,
    type: String,
    format: 'uuid',
    description: 'The review, by uuid.',
  })
  @ApiResponse({
    status: 200,
    description: 'The review with its new status.',
    schema: { $ref: contractRef('AdminReviewEnvelope') },
  })
  @ApiResponse({
    status: 400,
    description: 'The body failed validation.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 401,
    description: 'No valid session.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 403,
    description: 'Signed in, but not an admin.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 404,
    description: 'No such review.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  setReviewStatus(
    @CurrentUser('id') adminId: string,
    @Param('id') id: string,
    @Body(zodPipe(adminReviewStatusSchema)) body: AdminReviewStatus,
  ): Promise<AdminReviewDto> {
    return this.admin.setReviewStatus(adminId, id, body.status);
  }
}
