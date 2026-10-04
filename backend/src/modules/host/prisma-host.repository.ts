import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  type CreateBlackoutData,
  type CreateHotelData,
  type CreateRoomData,
  type HostBookingListItem,
  type HostBookingListPage,
  type HostHotelDetail,
  type HostHotelListItem,
  type HostHotelListPage,
  type HostRepository,
  type RoomDetail,
  type UpdateHotelData,
  type UpdateRoomData,
} from './host.repository.js';

const HOTEL_LIST_SELECT = {
  id: true,
  slug: true,
  name: true,
  city: true,
  country: true,
  starRating: true,
  status: true,
  createdAt: true,
  images: {
    where: { roomId: null, isCover: true },
    take: 1,
    select: { url: true },
  },
  _count: { select: { rooms: true } },
} satisfies Prisma.HotelSelect;

const HOTEL_DETAIL_SELECT = {
  id: true,
  slug: true,
  name: true,
  description: true,
  addressLine: true,
  city: true,
  country: true,
  lat: true,
  lng: true,
  starRating: true,
  status: true,
  checkInTime: true,
  checkOutTime: true,
  amenities: { select: { amenityId: true } },
  images: {
    where: { roomId: null },
    orderBy: [{ isCover: 'desc' }, { sortOrder: 'asc' }],
    select: {
      id: true,
      url: true,
      altText: true,
      aspect: true,
      width: true,
      height: true,
      sortOrder: true,
      isCover: true,
    },
  },
  rooms: {
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      name: true,
      description: true,
      bedType: true,
      maxGuests: true,
      totalInventory: true,
      sortOrder: true,
      prices: { select: { currency: true, priceCents: true } },
      images: {
        orderBy: [{ isCover: 'desc' }, { sortOrder: 'asc' }],
        select: {
          id: true,
          url: true,
          altText: true,
          aspect: true,
          width: true,
          height: true,
          sortOrder: true,
          isCover: true,
        },
      },
      blackoutDates: { select: { id: true, startsOn: true, endsOn: true, reason: true } },
    },
  },
  host: { select: { id: true, name: true } },
} satisfies Prisma.HotelSelect;

const BOOKING_LIST_SELECT = {
  id: true,
  reference: true,
  room: { select: { id: true, name: true, hotel: { select: { id: true, name: true, slug: true } } } },
  guest: { select: { id: true, name: true, email: true } },
  checkIn: true,
  checkOut: true,
  guestsCount: true,
  nights: true,
  totalCents: true,
  currency: true,
  status: true,
  createdAt: true,
} satisfies Prisma.BookingSelect;

type HotelDetailRow = Prisma.HotelGetPayload<{ select: typeof HOTEL_DETAIL_SELECT }>;

@Injectable()
export class PrismaHostRepository implements HostRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findByHost(hostId: string): Promise<HostHotelListPage> {
    const [rows, total] = await Promise.all([
      this.prisma.hotel.findMany({
        where: { hostId },
        select: HOTEL_LIST_SELECT,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.hotel.count({ where: { hostId } }),
    ]);

    const hotelIds = rows.map((r) => r.id);
    const upcomingBookings = await this.prisma.booking.groupBy({
      by: ['roomId'],
      where: {
        room: { hotelId: { in: hotelIds } },
        status: { in: ['PENDING', 'CONFIRMED'] },
      },
      _count: true,
    });

    const bookingCountByHotel = new Map<string, number>();
    for (const b of upcomingBookings) {
      const room = await this.prisma.room.findUnique({
        where: { id: b.roomId },
        select: { hotelId: true },
      });
      if (room) {
        bookingCountByHotel.set(room.hotelId, (bookingCountByHotel.get(room.hotelId) ?? 0) + b._count);
      }
    }

    const items: HostHotelListItem[] = rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      city: row.city,
      country: row.country,
      starRating: row.starRating,
      status: row.status,
      coverImageUrl: row.images[0]?.url ?? null,
      roomsCount: row._count.rooms,
      upcomingBookingsCount: bookingCountByHotel.get(row.id) ?? 0,
      createdAt: row.createdAt.toISOString(),
    }));

    return { items, total };
  }

  async slugExists(slug: string): Promise<boolean> {
    const row = await this.prisma.hotel.findUnique({
      where: { slug },
      select: { id: true },
    });
    return row !== null;
  }

  async findByIdAndHost(id: string, hostId: string): Promise<HostHotelDetail | null> {
    const row = await this.prisma.hotel.findFirst({
      where: { OR: [{ id }, { slug: id }], hostId },
      select: HOTEL_DETAIL_SELECT,
    });

    if (!row) return null;

    return this.toDetail(row);
  }

  async create(data: CreateHotelData): Promise<HostHotelDetail> {
    const { amenityIds, ...hotel } = data;
    const created = await this.prisma.hotel.create({
      data: {
        ...hotel,
        hostId: data.hostId,
        status: 'PENDING',
        amenities: {
          create: (amenityIds ?? []).map((amenityId) => ({
            amenity: { connect: { id: amenityId } },
          })),
        },
        images: { create: [] },
        rooms: { create: [] },
      },
      select: HOTEL_DETAIL_SELECT,
    });

    return this.toDetail(created);
  }

  async update(id: string, hostId: string, data: UpdateHotelData): Promise<HostHotelDetail> {
    const { amenityIds, ...hotel } = data;
    const updated = await this.prisma.hotel.update({
      where: { id, hostId },
      data: {
        ...hotel,
        // A full replace, not a merge: the edit form owns the whole amenity set, so
        // dropping one there must drop the row rather than orphan it selected.
        ...(amenityIds === undefined
          ? {}
          : {
              amenities: {
                deleteMany: {},
                create: amenityIds.map((amenityId) => ({
                  amenity: { connect: { id: amenityId } },
                })),
              },
            }),
      },
      select: HOTEL_DETAIL_SELECT,
    });

    return this.toDetail(updated);
  }

  async delete(id: string, hostId: string): Promise<void> {
    await this.prisma.hotel.delete({ where: { id, hostId } });
  }

  async countBookingsForHotel(id: string): Promise<number> {
    return this.prisma.booking.count({
      where: { room: { hotelId: id } },
    });
  }

  async countBookingsForRoom(roomId: string): Promise<number> {
    return this.prisma.booking.count({
      where: { roomId },
    });
  }

  async createRoom(data: CreateRoomData): Promise<RoomDetail> {
    const room = await this.prisma.room.create({
      data: {
        hotelId: data.hotelId,
        name: data.name,
        description: data.description,
        bedType: data.bedType,
        maxGuests: data.maxGuests,
        totalInventory: data.totalInventory,
        sortOrder: data.sortOrder,
        prices: { create: data.prices },
        images: { create: data.images.map((img) => ({ ...img, hotelId: data.hotelId })) },
        blackoutDates: { create: [] },
      },
      select: {
        id: true,
        name: true,
        description: true,
        bedType: true,
        maxGuests: true,
        totalInventory: true,
        sortOrder: true,
        prices: { select: { currency: true, priceCents: true } },
        images: {
          select: {
            id: true,
            url: true,
            altText: true,
            aspect: true,
            width: true,
            height: true,
            sortOrder: true,
            isCover: true,
          },
        },
        blackoutDates: { select: { id: true, startsOn: true, endsOn: true, reason: true } },
      },
    });

    return this.toRoomDetail(room);
  }

  async updateRoom(roomId: string, hostId: string, data: UpdateRoomData): Promise<RoomDetail> {
    const room = await this.prisma.room.update({
      where: { id: roomId, hotel: { hostId } },
      data,
      select: {
        id: true,
        name: true,
        description: true,
        bedType: true,
        maxGuests: true,
        totalInventory: true,
        sortOrder: true,
        prices: { select: { currency: true, priceCents: true } },
        images: {
          select: {
            id: true,
            url: true,
            altText: true,
            aspect: true,
            width: true,
            height: true,
            sortOrder: true,
            isCover: true,
          },
        },
        blackoutDates: { select: { id: true, startsOn: true, endsOn: true, reason: true } },
      },
    });

    return this.toRoomDetail(room);
  }

  async deleteRoom(roomId: string, hostId: string): Promise<void> {
    await this.prisma.room.delete({ where: { id: roomId, hotel: { hostId } } });
  }

  async createBlackout(data: CreateBlackoutData): Promise<{ id: string; roomId: string | null; hotelId: string; startsOn: Date; endsOn: Date; reason: string | null }> {
    const blackout = await this.prisma.blackoutDate.create({
      data: {
        roomId: data.roomId,
        hotelId: data.hotelId,
        startsOn: data.startsOn,
        endsOn: data.endsOn,
        reason: data.reason,
      },
      select: { id: true, roomId: true, hotelId: true, startsOn: true, endsOn: true, reason: true },
    });

    return blackout;
  }

  async deleteBlackout(id: string, hostId: string): Promise<void> {
    const hotelIds = await this.getHotelIdsByHost(hostId);
    await this.prisma.blackoutDate.delete({
      where: { id, OR: [{ room: { hotel: { hostId } } }, { hotelId: { in: hotelIds } }] },
    });
  }

  private async getHotelIdsByHost(hostId: string): Promise<string[]> {
    const hotels = await this.prisma.hotel.findMany({
      where: { hostId },
      select: { id: true },
    });
    return hotels.map((h) => h.id);
  }

  async findRoomHost(roomId: string): Promise<string | null> {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: { hotel: { select: { hostId: true } } },
    });
    return room?.hotel.hostId ?? null;
  }

  async findBlackoutHost(id: string): Promise<string | null> {
    const blackout = await this.prisma.blackoutDate.findUnique({
      where: { id },
      select: {
        hotel: { select: { hostId: true } },
        room: { select: { hotel: { select: { hostId: true } } } },
      },
    });
    if (!blackout) return null;
    // A room-scoped blackout is owned by the room's hotel; a hotel-scoped one by its own.
    return blackout.room?.hotel.hostId ?? blackout.hotel.hostId;
  }

  async findBookingsByHost(hostId: string): Promise<HostBookingListPage> {    const hotelIds = await this.getHotelIdsByHost(hostId);

    const [rows, total] = await Promise.all([
      this.prisma.booking.findMany({
        where: { room: { hotelId: { in: hotelIds } } },
        select: BOOKING_LIST_SELECT,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.booking.count({ where: { room: { hotelId: { in: hotelIds } } } }),
    ]);

    const items: HostBookingListItem[] = rows.map((row) => ({
      id: row.id,
      reference: row.reference,
      hotel: { id: row.room.hotel.id, name: row.room.hotel.name, slug: row.room.hotel.slug },
      room: { id: row.room.id, name: row.room.name },
      guest: { id: row.guest.id, name: row.guest.name, email: row.guest.email },
      checkIn: row.checkIn.toISOString().split('T')[0],
      checkOut: row.checkOut.toISOString().split('T')[0],
      guestsCount: row.guestsCount,
      nights: row.nights,
      totalCents: row.totalCents,
      currency: row.currency,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    }));

    return { items, total };
  }

  private toDetail(row: HotelDetailRow): HostHotelDetail {
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      addressLine: row.addressLine,
      city: row.city,
      country: row.country,
      lat: row.lat,
      lng: row.lng,
      starRating: row.starRating,
      status: row.status,
      checkInTime: row.checkInTime,
      checkOutTime: row.checkOutTime,
      coverImageUrl: row.images.find((img) => img.isCover)?.url ?? row.images[0]?.url ?? null,
      images: row.images.map((img) => ({
        id: img.id,
        url: img.url,
        altText: img.altText,
        aspect: img.aspect,
        width: img.width,
        height: img.height,
        sortOrder: img.sortOrder,
        isCover: img.isCover,
      })),
      amenityIds: row.amenities.map((a) => a.amenityId),
      rooms: row.rooms.map(this.toRoomDetail),
      host: row.host,
    };
  }

  private toRoomDetail = (room: HotelDetailRow['rooms'][0]): RoomDetail => {
    return {
      id: room.id,
      name: room.name,
      description: room.description,
      bedType: room.bedType,
      maxGuests: room.maxGuests,
      totalInventory: room.totalInventory,
      sortOrder: room.sortOrder,
      prices: room.prices.map((p) => ({ currency: p.currency, priceCents: p.priceCents })),
      images: room.images.map((img) => ({
        id: img.id,
        url: img.url,
        altText: img.altText,
        aspect: img.aspect,
        width: img.width,
        height: img.height,
        sortOrder: img.sortOrder,
        isCover: img.isCover,
      })),
      blackoutDates: room.blackoutDates.map((b) => ({
        id: b.id,
        startsOn: b.startsOn.toISOString().split('T')[0],
        endsOn: b.endsOn.toISOString().split('T')[0],
        reason: b.reason,
      })),
    };
  }
}