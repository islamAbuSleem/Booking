import { describe, expect, it } from 'vitest';
import { HostService } from './host.service.js';
import type { CreateHotelData, HostHotelDetail, HostRepository } from './host.repository.js';

const HOST_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

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
    await new HostService(repo).createHotel(HOST_ID, { ...CREATE } as CreateHotelData);

    expect(repo.slugProbes).toEqual(['casa-azul']);
    expect(repo.createArgs?.slug).toBe('casa-azul');
  });

  it('suffixes past a slug another host already owns', async () => {
    // `hotels.slug` is `@unique` platform-wide, so the collision is another host's row —
    // the case a host-scoped probe could never see.
    const repo = new RecordingRepo(new Set(['casa-azul']));
    await new HostService(repo).createHotel(HOST_ID, { ...CREATE } as CreateHotelData);

    expect(repo.slugProbes).toEqual(['casa-azul', 'casa-azul-1']);
    expect(repo.createArgs?.slug).toBe('casa-azul-1');
  });

  it('keeps counting until it finds a free slug', async () => {
    const repo = new RecordingRepo(new Set(['casa-azul', 'casa-azul-1', 'casa-azul-2']));
    await new HostService(repo).createHotel(HOST_ID, { ...CREATE } as CreateHotelData);

    expect(repo.createArgs?.slug).toBe('casa-azul-3');
  });

  it('probes host-agnostically: the uuid host_id filter is never asked a slug question', async () => {
    const repo = new RecordingRepo(new Set());
    await new HostService(repo).createHotel(HOST_ID, { ...CREATE } as CreateHotelData);

    // `findByIdAndHost` filters on `Hotel.hostId @db.Uuid`, so probing a slug through it needs
    // a sentinel id that Postgres rejects with 22P02. The slug check goes through its own
    // lookup instead.
    expect(repo.hostScopedProbes).toEqual([]);
    expect(repo.createArgs?.hostId).toBe(HOST_ID);
  });
});