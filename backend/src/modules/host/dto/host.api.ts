import { z } from 'zod';
import { envelopeSchema } from '../../../common/envelope.js';

/**
 * T22 — host API contract, as Zod schemas.
 *
 * The backend owns the API shape. `openapi.json` is generated from these schemas.
 */

// --- Input DTOs ---

export const createHotelSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().min(1).max(5000),
  addressLine: z.string().min(1).max(200),
  city: z.string().min(1).max(80),
  country: z.string().min(1).max(80),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  starRating: z.int().min(1).max(5),
  checkInTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
  checkOutTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
  /**
   * Amenity slugs (`wifi`, `pool`, …). Unknown slugs are a 400 via the FK, not a
   * silent drop: the wizard shows the global amenity list, so a mismatch is a real
   * bug the host must hear about rather than a quieter listing.
   */
  amenityIds: z.array(z.string().min(1).max(64)).optional(),
});

export const updateHotelSchema = createHotelSchema.partial().extend({
  status: z.enum(['PENDING', 'PUBLISHED', 'REJECTED', 'SUSPENDED']).optional(),
});

export const createRoomSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().min(1).max(5000),
  bedType: z.string().min(1).max(60),
  maxGuests: z.int().min(1).max(20),
  totalInventory: z.int().min(1).max(1000),
  sortOrder: z.int().min(0).default(0),
  prices: z.array(z.object({
    currency: z.string().length(3).toUpperCase(),
    priceCents: z.int().min(0),
  })).min(1),
  images: z.array(z.object({
    url: z.string().url(),
    publicId: z.string(),
    altText: z.string().nullable(),
    sortOrder: z.int().min(0),
    isCover: z.boolean(),
  })).default([]),
});

export const updateRoomSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().min(1).max(5000).optional(),
  bedType: z.string().min(1).max(60).optional(),
  maxGuests: z.int().min(1).max(20).optional(),
  totalInventory: z.int().min(1).max(1000).optional(),
  sortOrder: z.int().min(0).optional(),
});

export const createBlackoutSchema = z.object({
  roomId: z.uuid().nullable(),
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().max(200).nullable(),
});

// --- Output DTOs ---

const moneySchema = z.object({
  amountCents: z.int(),
  currency: z.string().describe('ISO 4217 code.'),
});

const imageSummarySchema = z.object({
  id: z.uuid(),
  url: z.string().url(),
  altText: z.string().nullable(),
  aspect: z.string(),
  width: z.int(),
  height: z.int(),
  sortOrder: z.int(),
  isCover: z.boolean(),
});

const roomPriceSchema = z.object({
  currency: z.string(),
  priceCents: z.int(),
});

const blackoutDateSchema = z.object({
  id: z.uuid(),
  startsOn: z.string(),
  endsOn: z.string(),
  reason: z.string().nullable(),
});

const roomDetailSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string(),
  bedType: z.string(),
  maxGuests: z.int(),
  totalInventory: z.int(),
  sortOrder: z.int(),
  prices: z.array(roomPriceSchema),
  images: z.array(imageSummarySchema),
  blackoutDates: z.array(blackoutDateSchema),
});

const hostHotelListItemSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  city: z.string(),
  country: z.string(),
  starRating: z.int(),
  status: z.enum(['PENDING', 'PUBLISHED', 'REJECTED', 'SUSPENDED']),
  coverImageUrl: z.string().url().nullable(),
  roomsCount: z.int(),
  upcomingBookingsCount: z.int(),
  createdAt: z.string(),
});

const hostHotelDetailSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  addressLine: z.string(),
  city: z.string(),
  country: z.string(),
  lat: z.number(),
  lng: z.number(),
  starRating: z.int(),
  status: z.enum(['PENDING', 'PUBLISHED', 'REJECTED', 'SUSPENDED']),
  checkInTime: z.string(),
  checkOutTime: z.string(),
  coverImageUrl: z.string().url().nullable(),
  images: z.array(imageSummarySchema),
  amenityIds: z.array(z.string()),
  rooms: z.array(roomDetailSchema),
  host: z.object({ id: z.uuid(), name: z.string() }),
});

const hostBookingListItemSchema = z.object({
  id: z.uuid(),
  reference: z.string(),
  hotel: z.object({ id: z.uuid(), name: z.string(), slug: z.string() }),
  room: z.object({ id: z.uuid(), name: z.string() }),
  guest: z.object({ id: z.uuid(), name: z.string(), email: z.string() }),
  checkIn: z.string(),
  checkOut: z.string(),
  guestsCount: z.int(),
  nights: z.int(),
  totalCents: z.int(),
  currency: z.string(),
  status: z.string(),
  createdAt: z.string(),
});

const hostHotelListDataSchema = z.object({
  items: z.array(hostHotelListItemSchema),
  total: z.int(),
});

const hostHotelEnvelopeSchema = envelopeSchema(hostHotelDetailSchema);
const hostHotelListEnvelopeSchema = envelopeSchema(hostHotelListDataSchema);

const hostBookingListDataSchema = z.object({
  items: z.array(hostBookingListItemSchema),
  total: z.int(),
});
const hostBookingListEnvelopeSchema = envelopeSchema(hostBookingListDataSchema);

const roomEnvelopeSchema = envelopeSchema(roomDetailSchema);
const blackoutEnvelopeSchema = envelopeSchema(blackoutDateSchema);

export const DTO_SCHEMAS = {
  CreateHotel: createHotelSchema,
  UpdateHotel: updateHotelSchema,
  CreateRoom: createRoomSchema,
  UpdateRoom: updateRoomSchema,
  CreateBlackout: createBlackoutSchema,
  Money: moneySchema,
  ImageSummary: imageSummarySchema,
  RoomPrice: roomPriceSchema,
  BlackoutDate: blackoutDateSchema,
  RoomDetail: roomDetailSchema,
  HostHotelListItem: hostHotelListItemSchema,
  HostHotelDetail: hostHotelDetailSchema,
  HostHotelListData: hostHotelListDataSchema,
  HostHotelEnvelope: hostHotelEnvelopeSchema,
  HostHotelListEnvelope: hostHotelListEnvelopeSchema,
  HostBookingListItem: hostBookingListItemSchema,
  HostBookingListData: hostBookingListDataSchema,
  HostBookingListEnvelope: hostBookingListEnvelopeSchema,
  RoomEnvelope: roomEnvelopeSchema,
  BlackoutEnvelope: blackoutEnvelopeSchema,
} as const satisfies Record<string, z.ZodType>;

export type CreateHotelDto = z.infer<typeof createHotelSchema>;
export type UpdateHotelDto = z.infer<typeof updateHotelSchema>;
export type CreateRoomDto = z.infer<typeof createRoomSchema>;
export type UpdateRoomDto = z.infer<typeof updateRoomSchema>;
export type CreateBlackoutDto = z.infer<typeof createBlackoutSchema>;
export type HostHotelListItemDto = z.infer<typeof hostHotelListItemSchema>;
export type HostHotelDetailDto = z.infer<typeof hostHotelDetailSchema>;
export type HostHotelListDataDto = z.infer<typeof hostHotelListDataSchema>;
export type HostBookingListItemDto = z.infer<typeof hostBookingListItemSchema>;
export type HostBookingListDataDto = z.infer<typeof hostBookingListDataSchema>;
export type RoomDetailDto = z.infer<typeof roomDetailSchema>;
export type BlackoutDateDto = z.infer<typeof blackoutDateSchema>;

// Internal types for service layer (includes hostId and slug which are not in the API)
export type CreateHotelData = CreateHotelDto & { hostId: string; slug: string };