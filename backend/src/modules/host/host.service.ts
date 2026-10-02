import { Inject, Injectable, Logger } from '@nestjs/common';
import { forbidden } from '../../common/errors/api-error.js';
import {
  type CreateBlackoutData,
  type CreateHotelData,
  type CreateRoomData,
  type HostBookingListPage,
  type HostHotelDetail,
  type HostHotelListPage,
  type HostRepository,
  type RoomDetail,
  type UpdateHotelData,
  type UpdateRoomData,
  HOST_REPOSITORY,
} from './host.repository.js';
import { slugify } from '../../common/utils/slugify.js';

/**
 * T22 — host listing management service.
 *
 * Thin: parse, authorize by hostId, delegate. Business rules here, not in the
 * repository. The hostId comes from the authenticated user (JwtAuthGuard +
 * RolesGuard with HOST role), so ownership is enforced by the query filter,
 * never by trusting the request body.
 *
 * Every ownership failure is a 403 `NOT_HOTEL_OWNER` via `ApiError` — never a bare
 * `Error`, which the exception filter would render as a 500, and never the P2025
 * 404 the write itself would produce, which would let host B probe host A's ids by
 * status code.
 */
@Injectable()
export class HostService {
  private readonly logger = new Logger(HostService.name);

  constructor(
    @Inject(HOST_REPOSITORY) private readonly repo: HostRepository,
  ) {}

  /** A hotel that is not this host's — or no hotel at all — is the caller's 403. */
  private notOwner(): never {
    throw forbidden(
      'NOT_HOTEL_OWNER',
      'This listing belongs to another host',
    );
  }

  async listMyHotels(hostId: string): Promise<HostHotelListPage> {
    return this.repo.findByHost(hostId);
  }

  async getMyHotel(id: string, hostId: string): Promise<HostHotelDetail> {
    const hotel = await this.repo.findByIdAndHost(id, hostId);
    if (!hotel) this.notOwner();
    return hotel;
  }

  async createHotel(hostId: string, data: CreateHotelData): Promise<HostHotelDetail> {
    const baseSlug = slugify(data.name);
    const uniqueSlug = await this.generateUniqueSlug(baseSlug);

    return this.repo.create({
      ...data,
      hostId,
      slug: uniqueSlug,
    });
  }

  async updateHotel(
    id: string,
    hostId: string,
    data: UpdateHotelData,
  ): Promise<HostHotelDetail> {
    const hotel = await this.repo.findByIdAndHost(id, hostId);
    if (!hotel) this.notOwner();

    // Publishing is the admin's moderation decision (T25), never a host write: a host can
    // suspend their own listing but cannot put it back on the public shelf from here.
    // There is deliberately no admin bypass — an admin publishes through the moderation
    // endpoints, so this route has exactly one rule for every caller.
    if (data.status === 'PUBLISHED') {
      throw forbidden('FORBIDDEN', 'Only admins can publish listings');
    }

    return this.repo.update(id, hostId, data);
  }

  async deleteHotel(id: string, hostId: string): Promise<void> {
    const hotel = await this.repo.findByIdAndHost(id, hostId);
    if (!hotel) this.notOwner();

    await this.repo.delete(id, hostId);
  }

  async createRoom(hotelId: string, hostId: string, data: Omit<CreateRoomData, 'hotelId'>): Promise<RoomDetail> {
    const hotel = await this.repo.findByIdAndHost(hotelId, hostId);
    if (!hotel) this.notOwner();

    return this.repo.createRoom({ ...data, hotelId });
  }

  async updateRoom(roomId: string, hostId: string, data: UpdateRoomData): Promise<RoomDetail> {
    await this.assertRoomOwner(roomId, hostId);
    return this.repo.updateRoom(roomId, hostId, data);
  }

  async deleteRoom(roomId: string, hostId: string): Promise<void> {
    await this.assertRoomOwner(roomId, hostId);
    await this.repo.deleteRoom(roomId, hostId);
  }

  async createBlackout(hotelId: string, hostId: string, data: Omit<CreateBlackoutData, 'hotelId'>): Promise<{ id: string; roomId: string | null; hotelId: string; startsOn: string; endsOn: string; reason: string | null }> {
    const hotel = await this.repo.findByIdAndHost(hotelId, hostId);
    if (!hotel) this.notOwner();

    if (data.roomId) {
      const room = hotel.rooms.find((r) => r.id === data.roomId);
      if (!room) this.notOwner();
    }

    const result = await this.repo.createBlackout({
      ...data,
      hotelId,
      startsOn: new Date(data.startsOn),
      endsOn: new Date(data.endsOn),
    });

    return {
      ...result,
      startsOn: result.startsOn.toISOString().split('T')[0],
      endsOn: result.endsOn.toISOString().split('T')[0],
    };
  }

  async deleteBlackout(id: string, hostId: string): Promise<void> {
    const owner = await this.repo.findBlackoutHost(id);
    if (owner === null || owner !== hostId) this.notOwner();
    await this.repo.deleteBlackout(id, hostId);
  }

  /** Room-scoped ownership probe, so the write never answers the probe for us. */
  private async assertRoomOwner(roomId: string, hostId: string): Promise<void> {
    const owner = await this.repo.findRoomHost(roomId);
    if (owner === null || owner !== hostId) this.notOwner();
  }

  async listMyBookings(hostId: string): Promise<HostBookingListPage> {
    return this.repo.findBookingsByHost(hostId);
  }

  private async generateUniqueSlug(base: string): Promise<string> {
    let slug = base;
    let suffix = 0;
    while (true) {
      const exists = await this.repo.findByIdAndHost(slug, 'dummy-host-id-for-slug-check');
      if (!exists) return slug;
      suffix++;
      slug = `${base}-${suffix}`;
    }
  }
}