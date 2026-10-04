import { describe, expect, it } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { PrismaHostRepository } from './prisma-host.repository.js';

/**
 * The host list endpoint's query shape, pinned without a database.
 *
 * `findByHost` used to loop a `room.findUnique` per grouped booking row, so the list cost
 * `2 + R` round trips against Neon where `R` is the number of rooms holding bookings. The
 * room→hotel map is already available from the hotel select, so the assertion here is
 * stronger than "it still works": it fails if any per-row lookup comes back.
 */
const HOTEL_A = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const HOTEL_B = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ROOM_A1 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const ROOM_A2 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1';
const ROOM_B1 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2';
const HOST_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const HOTEL_ROWS = [
  {
    id: HOTEL_A,
    slug: 'casa-azul',
    name: 'Casa Azul',
    city: 'Lisbon',
    country: 'Portugal',
    starRating: 4,
    status: 'PUBLISHED',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    images: [{ url: 'https://res.cloudinary.com/x/cover.jpg' }],
    _count: { rooms: 2 },
    rooms: [
      { id: ROOM_A1, hotelId: HOTEL_A },
      { id: ROOM_A2, hotelId: HOTEL_A },
    ],
  },
  {
    id: HOTEL_B,
    slug: 'hotel-b',
    name: 'Hotel B',
    city: 'Porto',
    country: 'Portugal',
    starRating: 3,
    status: 'PENDING',
    createdAt: new Date('2026-02-01T00:00:00.000Z'),
    images: [],
    _count: { rooms: 1 },
    rooms: [{ id: ROOM_B1, hotelId: HOTEL_B }],
  },
];

/** Only the calls `findByHost` makes; every other model is absent on purpose. */
function fakePrisma(grouped: Array<{ roomId: string; _count: number }>) {
  const calls: string[] = [];
  return {
    calls,
    prisma: {
      hotel: {
        findMany: () => {
          calls.push('hotel.findMany');
          return Promise.resolve(HOTEL_ROWS);
        },
        count: () => {
          calls.push('hotel.count');
          return Promise.resolve(HOTEL_ROWS.length);
        },
      },
      booking: {
        groupBy: () => {
          calls.push('booking.groupBy');
          return Promise.resolve(grouped);
        },
      },
      room: {
        findUnique: () => {
          calls.push('room.findUnique');
          return Promise.resolve(null);
        },
      },
    } as unknown as PrismaService,
  };
}

describe('PrismaHostRepository.findByHost', () => {
  it('spends three queries however many rooms hold bookings', async () => {
    const { prisma, calls } = fakePrisma([
      { roomId: ROOM_A1, _count: 2 },
      { roomId: ROOM_A2, _count: 1 },
      { roomId: ROOM_B1, _count: 4 },
    ]);

    const page = await new PrismaHostRepository(prisma).findByHost(HOST_ID);

    expect(calls).toEqual(['hotel.findMany', 'hotel.count', 'booking.groupBy']);
    expect(page.total).toBe(2);
  });

  it('folds each grouped count into the hotel that owns the room', async () => {
    const { prisma } = fakePrisma([
      { roomId: ROOM_A1, _count: 2 },
      { roomId: ROOM_A2, _count: 1 },
      { roomId: ROOM_B1, _count: 4 },
    ]);

    const page = await new PrismaHostRepository(prisma).findByHost(HOST_ID);

    expect(page.items).toHaveLength(2);
    expect(page.items[0]).toMatchObject({
      id: HOTEL_A,
      roomsCount: 2,
      upcomingBookingsCount: 3,
      coverImageUrl: 'https://res.cloudinary.com/x/cover.jpg',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(page.items[1]).toMatchObject({
      id: HOTEL_B,
      roomsCount: 1,
      upcomingBookingsCount: 4,
      coverImageUrl: null,
    });
  });

  it('counts nothing for a hotel with no bookings, without a lookup per row', async () => {
    const { prisma, calls } = fakePrisma([]);

    const page = await new PrismaHostRepository(prisma).findByHost(HOST_ID);

    expect(page.items.every((item) => item.upcomingBookingsCount === 0)).toBe(true);
    expect(calls).not.toContain('room.findUnique');
  });
});