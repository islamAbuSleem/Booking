import { describe, expect, it } from 'vitest';
import { HostService } from './host.service.js';
import type { HostHotelDetail, HostRepository } from './host.repository.js';

/**
 * T22/T28 — the two blackout rules the route documents as a 400 and the repository never
 * enforced. No database: the repository is a stub, which is the point — the rules are the
 * service's, and a green suite that never exercised them is how they went missing.
 */

const HOST_ID = '33333333-3333-4333-8333-333333333333';
const HOTEL_ID = '11111111-1111-4111-8111-111111111111';

const HOTEL: HostHotelDetail = {
  id: HOTEL_ID,
  slug: 'the-larkspur-hotel',
  name: 'Larkspur House',
  description: 'A blue house.',
  addressLine: 'Rua Azul 1',
  city: 'Lisbon',
  country: 'Portugal',
  lat: 38.7,
  lng: -9.1,
  starRating: 4,
  status: 'PENDING',
  checkInTime: '15:00',
  checkOutTime: '11:00',
  coverImageUrl: null,
  images: [],
  amenityIds: [],
  rooms: [],
  host: { id: HOST_ID, name: 'host-a@example.com' },
};

interface World {
  /** The span the repository reports as already taken, if any. */
  existing: { roomId: string | null; startsOn: string; endsOn: string } | null;
}

function setup(world: Partial<World> = {}) {
  const created: Array<{ startsOn: Date; endsOn: Date }> = [];
  const repo = {
    findByIdAndHost: () => Promise.resolve(HOTEL),
    findRoomHost: () => Promise.resolve(HOST_ID),
    findBlackoutHost: () => Promise.resolve(HOST_ID),
    hasBlackoutOverlap: (
      _hotelId: string,
      _roomId: string | null,
      startsOn: Date,
      endsOn: Date,
    ) => {
      const existing = world.existing ?? null;
      if (!existing) return Promise.resolve(false);
      const clash = existing.startsOn <= endsOn.toISOString().slice(0, 10)
        && startsOn.toISOString().slice(0, 10) <= existing.endsOn;
      return Promise.resolve(clash);
    },
    createBlackout: (data: { startsOn: Date; endsOn: Date }) => {
      created.push({ startsOn: data.startsOn, endsOn: data.endsOn });
      return Promise.resolve({
        id: 'blackout-1',
        roomId: null,
        hotelId: HOTEL_ID,
        startsOn: data.startsOn,
        endsOn: data.endsOn,
        reason: null,
      });
    },
  } as unknown as HostRepository;

  return { service: new HostService(repo), created };
}

const VALID = { roomId: null, startsOn: '2026-06-01', endsOn: '2026-06-05', reason: null };

describe('HostService.createBlackout', () => {
  it('rejects a range that ends before it starts', async () => {
    const { service, created } = setup();

    await expect(
      service.createBlackout(HOTEL_ID, HOST_ID, { ...VALID, startsOn: '2026-06-05', endsOn: '2026-06-01' }),
    ).rejects.toMatchObject({ status: 400, response: { code: 'BAD_REQUEST' } });
    expect(created).toHaveLength(0);
  });

  it('rejects a range that overlaps an existing blackout', async () => {
    const { service, created } = setup({
      existing: { roomId: null, startsOn: '2026-06-01', endsOn: '2026-06-10' },
    });

    await expect(service.createBlackout(HOTEL_ID, HOST_ID, VALID)).rejects.toMatchObject({
      status: 400,
      response: { code: 'BAD_REQUEST' },
    });
    expect(created).toHaveLength(0);
  });

  it('rejects a range that touches an existing one on either end', async () => {
    const { service } = setup({ existing: { roomId: null, startsOn: '2026-06-10', endsOn: '2026-06-20' } });

    await expect(
      service.createBlackout(HOTEL_ID, HOST_ID, { ...VALID, startsOn: '2026-06-05', endsOn: '2026-06-10' }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('accepts a range that clears the existing one', async () => {
    const { service, created } = setup({
      existing: { roomId: null, startsOn: '2026-07-01', endsOn: '2026-07-10' },
    });

    const created_blackout = await service.createBlackout(HOTEL_ID, HOST_ID, VALID);

    expect(created_blackout.startsOn).toBe('2026-06-01');
    expect(created_blackout.endsOn).toBe('2026-06-05');
    expect(created).toHaveLength(1);
  });

  it('checks ownership before the range, so a foreign id is still a 403', async () => {
    const { service } = {
      service: new HostService({
        findByIdAndHost: () => Promise.resolve(null),
      } as unknown as HostRepository),
    };

    await expect(service.createBlackout(HOTEL_ID, 'someone-else', VALID)).rejects.toMatchObject({
      status: 403,
      response: { code: 'NOT_HOTEL_OWNER' },
    });
  });
});