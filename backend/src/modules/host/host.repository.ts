/**
 * T22 — host listing management contract.
 *
 * The host service talks to this interface, never to PrismaService directly.
 * PrismaHostRepository is the one implementation.
 */

export const HOST_REPOSITORY = Symbol('HOST_REPOSITORY');

export type HotelStatus = 'PENDING' | 'PUBLISHED' | 'REJECTED' | 'SUSPENDED';

export interface HostHotelListItem {
  id: string;
  slug: string;
  name: string;
  city: string;
  country: string;
  starRating: number;
  status: HotelStatus;
  coverImageUrl: string | null;
  roomsCount: number;
  upcomingBookingsCount: number;
  createdAt: string; // ISO 8601
}

export interface HostHotelListPage {
  items: HostHotelListItem[];
  total: number;
}

export interface RoomDetail {
  id: string;
  name: string;
  description: string;
  bedType: string;
  maxGuests: number;
  totalInventory: number;
  sortOrder: number;
  prices: Array<{ currency: string; priceCents: number }>;
  images: Array<{
    id: string;
    url: string;
    altText: string | null;
    aspect: string;
    width: number;
    height: number;
    sortOrder: number;
    isCover: boolean;
  }>;
  blackoutDates: Array<{ id: string; startsOn: string; endsOn: string; reason: string | null }>;
}

export interface HostHotelDetail {
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
  status: HotelStatus;
  checkInTime: string;
  checkOutTime: string;
  coverImageUrl: string | null;
  images: Array<{
    id: string;
    url: string;
    altText: string | null;
    aspect: string;
    width: number;
    height: number;
    sortOrder: number;
    isCover: boolean;
  }>;
  amenityIds: string[];
  rooms: RoomDetail[];
  host: { id: string; name: string };
}

export interface CreateHotelData {
  hostId: string;
  name: string;
  slug: string;
  description: string;
  addressLine: string;
  city: string;
  country: string;
  lat: number;
  lng: number;
  starRating: number;
  checkInTime: string;
  checkOutTime: string;
  amenityIds?: string[];
}

export interface UpdateHotelData {
  name?: string;
  description?: string;
  addressLine?: string;
  city?: string;
  country?: string;
  lat?: number;
  lng?: number;
  starRating?: number;
  checkInTime?: string;
  checkOutTime?: string;
  status?: HotelStatus;
  amenityIds?: string[];
}

export interface CreateRoomData {
  hotelId: string;
  name: string;
  description: string;
  bedType: string;
  maxGuests: number;
  totalInventory: number;
  sortOrder: number;
  prices: Array<{ currency: string; priceCents: number }>;
  images: Array<{
    url: string;
    publicId: string;
    altText: string | null;
    sortOrder: number;
    isCover: boolean;
  }>;
}

export interface UpdateRoomData {
  name?: string;
  description?: string;
  bedType?: string;
  maxGuests?: number;
  totalInventory?: number;
  sortOrder?: number;
}

export interface CreateBlackoutData {
  roomId: string | null;
  hotelId: string;
  startsOn: Date;
  endsOn: Date;
  reason: string | null;
}

export interface HostBookingListItem {
  id: string;
  reference: string;
  hotel: { id: string; name: string; slug: string };
  room: { id: string; name: string };
  guest: { id: string; name: string; email: string };
  checkIn: string; // YYYY-MM-DD
  checkOut: string; // YYYY-MM-DD
  guestsCount: number;
  nights: number;
  totalCents: number;
  currency: string;
  status: string;
  createdAt: string; // ISO 8601
}

export interface HostBookingListPage {
  items: HostBookingListItem[];
  total: number;
}

export interface HostRepository {
  findByHost(hostId: string): Promise<HostHotelListPage>;
  findByIdAndHost(id: string, hostId: string): Promise<HostHotelDetail | null>;
/**
   * Host-agnostic slug probe. Slugs are unique across the whole platform
   * (`hotels.slug @unique`), so the question "is this slug taken?" cannot be asked through
   * the host-scoped `findByIdAndHost`: that one filters on `hostId`, and a sentinel id is
   * both the wrong question and — against the `@db.Uuid` `host_id` column — a query the
   * database rejects outright. This is the only lookup that answers the real question.
   */
  slugExists(slug: string): Promise<boolean>;
  findBySlug(slug: string): Promise<HostHotelDetail | null>;
  create(data: CreateHotelData): Promise<HostHotelDetail>;
  update(id: string, hostId: string, data: UpdateHotelData): Promise<HostHotelDetail>;
  delete(id: string, hostId: string): Promise<void>;
  /**
   * How many bookings stand in the way of a delete. `Booking.room` is `onDelete: Restrict`,
   * so one booking row of *any* status — a cancelled or completed stay included, because its
   * history is still the record of a real stay — is enough to make the delete impossible.
   * Counting here turns the FK violation into the documented 409 instead of letting Prisma
   * raise P2003 and the error translator answer a misleading 400.
   */
  countBookingsForHotel(id: string): Promise<number>;
  countBookingsForRoom(roomId: string): Promise<number>;
  createRoom(data: CreateRoomData): Promise<RoomDetail>;
  updateRoom(roomId: string, hostId: string, data: UpdateRoomData): Promise<RoomDetail>;
  deleteRoom(roomId: string, hostId: string): Promise<void>;
  createBlackout(data: CreateBlackoutData): Promise<{ id: string; roomId: string | null; hotelId: string; startsOn: Date; endsOn: Date; reason: string | null }>;
  /**
   * Whether this hotel already has a blackout reaching the given range.
   *
   * Scoped to the hotel, not to one room, because that is exactly what
   * `buildOverlappingBlackoutsWhere` blocks a stay against: a `roomId: null` row closes the
   * whole property, so two ranges in the same hotel must not reach into each other whatever
   * room they name. The comparison is inclusive on both ends, like the blackout itself.
   */
  hasOverlappingBlackout(
    hotelId: string,
    startsOn: Date,
    endsOn: Date,
  ): Promise<boolean>;
  deleteBlackout(id: string, hostId: string): Promise<void>;
  findBookingsByHost(hostId: string): Promise<HostBookingListPage>;
  /**
   * Ownership probes for room- and blackout-scoped routes. The service checks these
   * *before* mutating so a foreign id is a 403 NOT_HOTEL_OWNER rather than the P2025
   * 404 the write itself would produce — a missing row and a foreign row must not
   * answer alike, or host B could probe host A's ids by status code.
   *
   * Returns the owning host's id, or null when no such row exists.
   */
  findRoomHost(roomId: string): Promise<string | null>;
  findBlackoutHost(id: string): Promise<string | null>;
}