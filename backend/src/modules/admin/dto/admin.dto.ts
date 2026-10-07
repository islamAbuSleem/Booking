import { z } from 'zod';
import { envelopeSchema } from '../../../common/envelope.js';

/**
 * T25 — the admin contract, as Zod schemas.
 *
 * The backend owns the API shape. `openapi.json` is generated from these schemas, and
 * the frontend's types are generated from that document — never hand-written to match.
 */

export const adminListingsQuerySchema = z.object({
  status: z.enum(['PENDING', 'PUBLISHED', 'REJECTED', 'SUSPENDED']).optional(),
  page: z.coerce.number().int().positive().default(1).optional(),
  pageSize: z.coerce.number().int().positive().max(100).default(20).optional(),
});

export const adminListingStatusSchema = z.object({
  status: z.enum(['PENDING', 'PUBLISHED', 'REJECTED', 'SUSPENDED']),
});

export const adminUsersQuerySchema = z.object({
  query: z.string().max(200).optional(),
  role: z.enum(['GUEST', 'HOST', 'ADMIN']).optional(),
  page: z.coerce.number().int().positive().default(1).optional(),
  pageSize: z.coerce.number().int().positive().max(100).default(20).optional(),
});

export const adminUserStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED']),
});

export const adminReviewsQuerySchema = z.object({
  status: z.enum(['VISIBLE', 'HIDDEN']).optional(),
  page: z.coerce.number().int().positive().default(1).optional(),
  pageSize: z.coerce.number().int().positive().max(100).default(20).optional(),
});

export const adminReviewStatusSchema = z.object({
  status: z.enum(['VISIBLE', 'HIDDEN']),
});

const adminHotelSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  city: z.string(),
  country: z.string(),
  status: z.enum(['PENDING', 'PUBLISHED', 'REJECTED', 'SUSPENDED']),
  host: z.object({ id: z.uuid(), name: z.string(), email: z.string() }),
  roomsCount: z.int(),
  createdAt: z.string(),
});

const adminUserSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  name: z.string(),
  role: z.enum(['GUEST', 'HOST', 'ADMIN']),
  status: z.enum(['ACTIVE', 'SUSPENDED']),
  createdAt: z.string(),
});

const adminReviewSchema = z.object({
  id: z.uuid(),
  hotel: z.object({ id: z.uuid(), name: z.string() }),
  author: z.object({ id: z.uuid(), name: z.string() }),
  rating: z.int(),
  title: z.string(),
  body: z.string(),
  status: z.enum(['VISIBLE', 'HIDDEN']),
  createdAt: z.string(),
});

const adminStatsSchema = z.object({
  usersTotal: z.int(),
  usersByRole: z.object({ GUEST: z.int(), HOST: z.int(), ADMIN: z.int() }),
  hotelsTotal: z.int(),
  hotelsByStatus: z.object({
    PENDING: z.int(),
    PUBLISHED: z.int(),
    REJECTED: z.int(),
    SUSPENDED: z.int(),
  }),
  bookingsTotal: z.int(),
  bookingsByStatus: z.object({
    PENDING: z.int(),
    CONFIRMED: z.int(),
    COMPLETED: z.int(),
    CANCELLED: z.int(),
  }),
  reviewsTotal: z.int(),
  reviewsHidden: z.int(),
});

const adminHotelListDataSchema = z.object({
  items: z.array(adminHotelSchema),
  total: z.int(),
});
const adminUserListDataSchema = z.object({
  items: z.array(adminUserSchema),
  total: z.int(),
});
const adminReviewListDataSchema = z.object({
  items: z.array(adminReviewSchema),
  total: z.int(),
});

export const DTO_SCHEMAS = {
  AdminListingsQuery: adminListingsQuerySchema,
  AdminListingStatus: adminListingStatusSchema,
  AdminUsersQuery: adminUsersQuerySchema,
  AdminUserStatus: adminUserStatusSchema,
  AdminReviewsQuery: adminReviewsQuerySchema,
  AdminReviewStatus: adminReviewStatusSchema,
  AdminHotel: adminHotelSchema,
  AdminUser: adminUserSchema,
  AdminReview: adminReviewSchema,
  AdminStats: adminStatsSchema,
  AdminStatsData: adminStatsSchema,
  AdminStatsEnvelope: envelopeSchema(adminStatsSchema),
  AdminHotelListData: adminHotelListDataSchema,
  AdminHotelListEnvelope: envelopeSchema(adminHotelListDataSchema),
  AdminHotelEnvelope: envelopeSchema(adminHotelSchema),
  AdminUserListData: adminUserListDataSchema,
  AdminUserListEnvelope: envelopeSchema(adminUserListDataSchema),
  AdminUserEnvelope: envelopeSchema(adminUserSchema),
  AdminReviewListData: adminReviewListDataSchema,
  AdminReviewListEnvelope: envelopeSchema(adminReviewListDataSchema),
  AdminReviewEnvelope: envelopeSchema(adminReviewSchema),
} as const satisfies Record<string, z.ZodType>;

export type AdminListingsQuery = z.infer<typeof adminListingsQuerySchema>;
export type AdminListingStatus = z.infer<typeof adminListingStatusSchema>;
export type AdminUsersQuery = z.infer<typeof adminUsersQuerySchema>;
export type AdminUserStatus = z.infer<typeof adminUserStatusSchema>;
export type AdminReviewsQuery = z.infer<typeof adminReviewsQuerySchema>;
export type AdminReviewStatus = z.infer<typeof adminReviewStatusSchema>;
export type AdminHotelDto = z.infer<typeof adminHotelSchema>;
export type AdminUserDto = z.infer<typeof adminUserSchema>;
export type AdminReviewDto = z.infer<typeof adminReviewSchema>;
export type AdminStatsDto = z.infer<typeof adminStatsSchema>;