import { describe, expect, it } from 'vitest';
import type { Prisma } from '../../generated/prisma/client.js';
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
function fakePrisma(
  grouped: Array<{ roomId: string; _count: number }>,
  seen: Prisma.BookingWhereInput[] = [],
) {
  const calls: string[] = [];
  return {
    calls,
    seen,
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
        groupBy: (args: { where: Prisma.BookingWhereInput }) => {
          calls.push('booking.groupBy');
          seen.push(args.where);
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

/**
 * "Upcoming" is shown to the host as such, so the predicate has to mean it: a stay that
 * checked out last month is not upcoming, and neither is a `PENDING` hold whose window has
 * passed. Both used to count, because the filter was a status list and nothing else.
 */
describe('PrismaHostRepository.findByHost upcoming predicate', () => {
  const NOW = new Date('2026-06-15T12:00:00.000Z');

  async function seenWhere(): Promise<Prisma.BookingWhereInput> {
    const { prisma, seen } = fakePrisma([]);
    await new PrismaHostRepository(prisma).findByHost(HOST_ID, NOW);
    const where = seen[0];
    if (!where) throw new Error('groupBy was never called');
    return where;
  }

  it('asks only about the caller\'s own rooms', async () => {
    expect(await seenWhere()).toMatchObject({
      roomId: { in: [ROOM_A1, ROOM_A2, ROOM_B1] },
    });
  });

  it('excludes stays that have already finished', async () => {
    const where = await seenWhere();
    const branches = (where.OR ?? []) as Array<Record<string, unknown>>;

    // The window is [today, tomorrow): a stay whose checkout is today or earlier is over.
    expect(where.checkIn).toEqual({ lt: new Date('2026-06-16T00:00:00.000Z') });
    expect(where.checkOut).toEqual({ gt: new Date('2026-06-15T00:00:00.000Z') });
    expect(branches).toContainEqual({ status: 'CONFIRMED' });
  });

  it('counts a PENDING hold only while it is still live', async () => {
    const branches = ((await seenWhere()).OR ?? []) as Array<Record<string, unknown>>;

    expect(branches).toContainEqual({ status: 'PENDING', holdExpiresAt: { gt: NOW } });
    // A bare `status: { in: [...] }` is the bug: it would count the lapsed hold too.
    expect(branches.some((b) => b.status === undefined)).toBe(false);
  });
});