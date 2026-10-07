import { ConfigService } from '@nestjs/config';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { badRequest, conflict, forbidden } from '../../common/errors/api-error.js';
import {
  type CreateBlackoutData,
  type CreateHotelData,
  type CreateRoomData,
  type HotelStatus,
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
import { hostFolderPrefix } from '../uploads/cloudinary.signature.js';

/**
 * The moderation state machine, in one allow-list. A host owns exactly one transition:
 * suspend their own listing. Everything else — `PENDING` (re-queueing a rejected listing for
 * re-approval with no admin involved), `PUBLISHED` (putting it back on the public shelf),
 * `REJECTED` (self-rejecting into a state only an admin should set) — belongs to the T25
 * moderation endpoints.
 *
 * Denying one value instead would leave `SUSPENDED -> PENDING` and `PUBLISHED -> PENDING`
 * open, which is how a host unpublishes their own live listing. There is deliberately no
 * admin bypass: an admin publishes through moderation, so this route has one rule for every
 * caller.
 */
const HOST_SETTABLE_STATUS: HotelStatus = 'SUSPENDED';

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
    @Inject(ConfigService) private readonly config: ConfigService,
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
    if (data.status !== undefined && data.status !== HOST_SETTABLE_STATUS) {
      throw forbidden(
        'FORBIDDEN',
        'Hosts can only suspend their own listing',
      );
    }

    return this.repo.update(id, hostId, data);
  }

  async deleteHotel(id: string, hostId: string): Promise<void> {
    const hotel = await this.repo.findByIdAndHost(id, hostId);
    if (!hotel) this.notOwner();

    // Checked here rather than left to the FK: `Booking.room` is `onDelete: Restrict`, so the
    // delete would otherwise fail as a P2003 that the translator renders as a 400 "Referenced
    // record does not exist" — the wrong status for "this listing has guests in it", and one
    // the controller documents as a 409. Any booking counts, cancelled or completed: the row
    // is the record of a real stay and the schema will not let it be deleted.
    if ((await this.repo.countBookingsForHotel(hotel.id)) > 0) {
      throw conflict('HOTEL_HAS_BOOKINGS', 'This listing has bookings and cannot be deleted');
    }

    await this.repo.delete(id, hostId);
  }

  async createRoom(hotelId: string, hostId: string, data: Omit<CreateRoomData, 'hotelId'>): Promise<RoomDetail> {
    const hotel = await this.repo.findByIdAndHost(hotelId, hostId);
    if (!hotel) this.notOwner();

    // T21's folder-prefix rule applies here too: a room image is the same `hotel_images` row,
    // so without this a host could point their own room at another host's Cloudinary asset and
    // inherit its url. The check is a DB-free string comparison against the caller's own
    // `booking/hotels/{hostId}/` folder, and it runs before the write, so a foreign id never
    // gets as far as a partially-created room.
    const prefix = hostFolderPrefix(this.uploadPath(), hostId);
    for (const image of data.images) {
      if (!image.publicId.startsWith(prefix)) {
        throw forbidden('UPLOAD_FOREIGN', 'This asset is not in your upload folder');
      }
    }

    return this.repo.createRoom({ ...data, hotelId });
  }

  async updateRoom(roomId: string, hostId: string, data: UpdateRoomData): Promise<RoomDetail> {
    await this.assertRoomOwner(roomId, hostId);
    return this.repo.updateRoom(roomId, hostId, data);
  }

  async deleteRoom(roomId: string, hostId: string): Promise<void> {
    await this.assertRoomOwner(roomId, hostId);

    // Same rule as the hotel delete, one level down: the FK would answer a misleading 400.
    if ((await this.repo.countBookingsForRoom(roomId)) > 0) {
      throw conflict('ROOM_HAS_BOOKINGS', 'This room has bookings and cannot be deleted');
    }

    await this.repo.deleteRoom(roomId, hostId);
  }

  async createBlackout(hotelId: string, hostId: string, data: Omit<CreateBlackoutData, 'hotelId'>): Promise<{ id: string; roomId: string | null; hotelId: string; startsOn: string; endsOn: string; reason: string | null }> {
    const hotel = await this.repo.findByIdAndHost(hotelId, hostId);
    if (!hotel) this.notOwner();

    if (data.roomId) {
      const room = hotel.rooms.find((r) => r.id === data.roomId);
      if (!room) this.notOwner();
    }

    const startsOn = new Date(data.startsOn);
    const endsOn = new Date(data.endsOn);

    // Ordering is the schema's (it can see both fields); overlap needs the hotel's existing
    // rows, so it is the service's. The controller documents this as a 400 and the client-side
    // check in the edit form is not a substitute: any direct API caller bypasses it.
    if (endsOn.getTime() < startsOn.getTime()) {
      throw badRequest('Blackout dates must not end before they start');
    }
    if (await this.repo.hasOverlappingBlackout(hotelId, startsOn, endsOn)) {
      throw badRequest('Blackout dates must not overlap an existing blackout');
    }

    const result = await this.repo.createBlackout({
      ...data,
      hotelId,
      startsOn,
      endsOn,
    });

    return {
      ...result,
      startsOn: result.startsOn.toISOString().split('T')[0],
      endsOn: result.endsOn.toISOString().split('T')[0],
    };
  }

  /** The platform-wide folder; each host appends their own id. */
  private uploadPath(): string {
    return this.config.get<string>('CLOUDINARY_UPLOAD_PATH') ?? 'booking/hotels/';
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
    // Platform-wide uniqueness, checked host-agnostically: `hotels.slug` is `@unique`, so a
    // probe scoped to this host would only ever find the host's *own* slug and hand back a
    // value the write then rejects with a 409 instead of the suffixed slug this produces.
    while (await this.repo.slugExists(slug)) {
      suffix++;
      slug = `${base}-${suffix}`;
    }
    return slug;
  }
}