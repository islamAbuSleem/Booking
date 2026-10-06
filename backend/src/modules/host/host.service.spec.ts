import { describe, expect, it } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { HostService } from './host.service.js';
import type { CreateBlackoutData, CreateHotelData, HostHotelDetail, HostRepository } from './host.repository.js';

const HOST_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

/** Only the upload path the folder-prefix rule reads. */
const CONFIG = { get: (key: string): string | undefined => (key === 'CLOUDINARY_UPLOAD_PATH' ? 'booking/hotels/' : undefined) };

function makeService(repo: HostRepository): HostService {
  return new HostService(repo, new ConfigService(CONFIG));
}

const CREATE: Omit<CreateHotelData, 'slug'> = {
  hostId: HOST_ID,
  name: 'Casa Azul',
  description: 'A blue house.',
  addressLine: 'Rua Azul 1',
  city: 'Lisbon',
  country: 'Portugal',
  lat: 38.7,
  lng: -9.1,
  starRating: 4,
  checkInTime: '15:00',
  checkOutTime: '11:00',
};

/** Records what the service asked the repository, so the slug rule is observable. */
class RecordingRepo implements HostRepository {
  readonly slugProbes: string[] = [];
  readonly hostScopedProbes: string[] = [];
  createArgs: CreateHotelData | null = null;

  constructor(private readonly taken: Set<string>) {}

  async slugExists(slug: string): Promise<boolean> {
    this.slugProbes.push(slug);
    return this.taken.has(slug);
  }

  async create(data: CreateHotelData): Promise<HostHotelDetail> {
    this.createArgs = data;
    return { id: 'hotel-1', ...data, images: [], amenityIds: [], rooms: [], host: { id: HOST_ID, name: 'host' } } as unknown as HostHotelDetail;
  }

  async findByIdAndHost(id: string, hostId: string): Promise<null> {
    this.hostScopedProbes.push(`${id}@${hostId}`);
    return null;
  }
  async findByHost() {
    return { items: [], total: 0 };
  }
  async update(): Promise<never> {
    throw new Error('unused');
  }
  async delete(): Promise<void> {
    throw new Error('unused');
  }
  async countBookingsForHotel(): Promise<number> {
    return 0;
  }
  async countBookingsForRoom(): Promise<number> {
    return 0;
  }
  async hasOverlappingBlackout(): Promise<boolean> {
    return false;
  }
  async createRoom(): Promise<never> {
    throw new Error('unused');
  }
  async updateRoom(): Promise<never> {
    throw new Error('unused');
  }
  async deleteRoom(): Promise<void> {
    throw new Error('unused');
  }
  async createBlackout(): Promise<never> {
    throw new Error('unused') as never;
  }
  async deleteBlackout(): Promise<void> {
    throw new Error('unused');
  }
  async findBookingsByHost() {
    return { items: [], total: 0 };
  }
  async findRoomHost(): Promise<null> {
    return null;
  }
  async findBlackoutHost(): Promise<null> {
    return null;
  }
}

describe('HostService.createHotel slug', () => {
  it('uses the plain slug when nothing has taken it', async () => {
    const repo = new RecordingRepo(new Set());
    await makeService(repo).createHotel(HOST_ID, { ...CREATE } as CreateHotelData);

    expect(repo.slugProbes).toEqual(['casa-azul']);
    expect(repo.createArgs?.slug).toBe('casa-azul');
  });

  it('suffixes past a slug another host already owns', async () => {
    // `hotels.slug` is `@unique` platform-wide, so the collision is another host's row —
    // the case a host-scoped probe could never see.
    const repo = new RecordingRepo(new Set(['casa-azul']));
    await makeService(repo).createHotel(HOST_ID, { ...CREATE } as CreateHotelData);

    expect(repo.slugProbes).toEqual(['casa-azul', 'casa-azul-1']);
    expect(repo.createArgs?.slug).toBe('casa-azul-1');
  });

  it('keeps counting until it finds a free slug', async () => {
    const repo = new RecordingRepo(new Set(['casa-azul', 'casa-azul-1', 'casa-azul-2']));
    await makeService(repo).createHotel(HOST_ID, { ...CREATE } as CreateHotelData);

    expect(repo.createArgs?.slug).toBe('casa-azul-3');
  });

  it('probes host-agnostically: the uuid host_id filter is never asked a slug question', async () => {
    const repo = new RecordingRepo(new Set());
    await makeService(repo).createHotel(HOST_ID, { ...CREATE } as CreateHotelData);

    // `findByIdAndHost` filters on `Hotel.hostId @db.Uuid`, so probing a slug through it needs
    // a sentinel id that Postgres rejects with 22P02. The slug check goes through its own
    // lookup instead.
    expect(repo.hostScopedProbes).toEqual([]);
    expect(repo.createArgs?.hostId).toBe(HOST_ID);
  });
});
/**
 * The blackout rules the route documents as a 400. The schema can order the two dates but
 * cannot see the hotel's other ranges, so this half is the service's — and the edit form's
 * client-side check is not a substitute, because any direct API caller bypasses it.
 */
class BlackoutRepo extends RecordingRepo {
  readonly overlapProbes: Array<{ startsOn: Date; endsOn: Date }> = [];
  createBlackoutArgs: CreateBlackoutData | null = null;

  constructor(
    taken: Set<string>,
    private readonly existing: { startsOn: string; endsOn: string } | null,
    private readonly hotel: HostHotelDetail | null,
  ) {
    super(taken);
  }

  override async findByIdAndHost(): Promise<HostHotelDetail | null> {
    return this.hotel;
  }

  override async hasOverlappingBlackout(
    _hotelId: string,
    startsOn: Date,
    endsOn: Date,
  ): Promise<boolean> {
    this.overlapProbes.push({ startsOn, endsOn });
    if (!this.existing) return false;
    const day = (d: Date): string => d.toISOString().slice(0, 10);
    // Inclusive on both ends, so ranges that merely touch still clash.
    return this.existing.startsOn <= day(endsOn) && day(startsOn) <= this.existing.endsOn;
  }

  override async createBlackout(data: CreateBlackoutData): Promise<never> {
    this.createBlackoutArgs = data;
    return { id: 'blackout-1', ...data } as never;
  }
}

const HOTEL: HostHotelDetail = {
  id: 'hotel-1',
  rooms: [],
} as unknown as HostHotelDetail;

const BLACKOUT = { roomId: null, startsOn: '2026-06-01', endsOn: '2026-06-05', reason: null };

describe('HostService.createBlackout', () => {
  it('rejects a range that ends before it starts', async () => {
    const repo = new BlackoutRepo(new Set(), null, HOTEL);

    await expect(
      makeService(repo).createBlackout('hotel-1', HOST_ID, {
        ...BLACKOUT,
        startsOn: '2026-06-05',
        endsOn: '2026-06-01',
      }),
    ).rejects.toMatchObject({ status: 400, response: { code: 'BAD_REQUEST' } });
    expect(repo.createBlackoutArgs).toBeNull();
  });

  it('rejects a range that overlaps an existing blackout', async () => {
    const repo = new BlackoutRepo(new Set(), { startsOn: '2026-06-01', endsOn: '2026-06-10' }, HOTEL);

    await expect(
      makeService(repo).createBlackout('hotel-1', HOST_ID, BLACKOUT),
    ).rejects.toMatchObject({ status: 400, response: { code: 'BAD_REQUEST' } });
    expect(repo.createBlackoutArgs).toBeNull();
  });

  it('rejects a range that only touches an existing one on the boundary', async () => {
    const repo = new BlackoutRepo(new Set(), { startsOn: '2026-06-10', endsOn: '2026-06-20' }, HOTEL);

    await expect(
      makeService(repo).createBlackout('hotel-1', HOST_ID, { ...BLACKOUT, endsOn: '2026-06-10' }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('accepts a range that clears the existing one', async () => {
    const repo = new BlackoutRepo(new Set(), { startsOn: '2026-07-01', endsOn: '2026-07-10' }, HOTEL);

    const created = await makeService(repo).createBlackout('hotel-1', HOST_ID, BLACKOUT);

    expect(created).toMatchObject({ startsOn: '2026-06-01', endsOn: '2026-06-05' });
    expect(repo.createBlackoutArgs).not.toBeNull();
  });

  it('checks ownership before the range, so a foreign id is still a 403', async () => {
    const repo = new BlackoutRepo(new Set(), { startsOn: '2026-06-01', endsOn: '2026-06-10' }, null);

    await expect(
      makeService(repo).createBlackout('hotel-1', 'someone-else', BLACKOUT),
    ).rejects.toMatchObject({ status: 403, response: { code: 'NOT_HOTEL_OWNER' } });
    expect(repo.overlapProbes).toHaveLength(0);
  });
});
