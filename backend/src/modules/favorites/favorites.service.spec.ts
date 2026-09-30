import { ApiError } from '../../common/errors/api-error.js';
import {
  type FavoriteRecord,
  type FavoritesRepository,
} from '../../prisma/favorites.repository.js';
import { FavoritesService } from './favorites.service.js';

const USER_ID = '44444444-4444-4444-8444-444444444444';
const OTHER_USER_ID = '55555555-5555-4555-8555-555555555555';
const HOTEL_ID = '11111111-1111-4111-8111-111111111111';
const MISSING_HOTEL_ID = '99999999-9999-4999-8999-999999999999';
const CREATED_AT = new Date('2026-05-20T10:00:00.000Z');

/**
 * Stands in for Prisma. The service talks to `FavoritesRepository`, not `PrismaService`, so
 * every rule in this file runs with no database and no Nest container.
 *
 * `rows` is keyed by the pair, which is what the `@@id([userId, hotelId])` composite primary
 * key does: a duplicate insert can only be refused, never merged, and one guest's row can
 * never be read as another's.
 */
class FakeFavoritesRepository implements FavoritesRepository {
  readonly rows = new Map<string, FavoriteRecord>();
  readonly inserts: Array<[string, string]> = [];
  readonly removals: Array<[string, string]> = [];

  constructor(private readonly knownHotels: string[] = [HOTEL_ID]) {}

  private static key(userId: string, hotelId: string): string {
    return `${userId}:${hotelId}`;
  }

  async hotelExists(hotelId: string): Promise<boolean> {
    return this.knownHotels.includes(hotelId);
  }

  async create(
    userId: string,
    hotelId: string,
  ): Promise<FavoriteRecord | null> {
    this.inserts.push([userId, hotelId]);
    const key = FakeFavoritesRepository.key(userId, hotelId);
    if (this.rows.has(key)) return null;
    const record: FavoriteRecord = { userId, hotelId, createdAt: CREATED_AT };
    this.rows.set(key, record);
    return record;
  }

  async remove(userId: string, hotelId: string): Promise<void> {
    this.removals.push([userId, hotelId]);
    this.rows.delete(FakeFavoritesRepository.key(userId, hotelId));
  }
}

function service(repository = new FakeFavoritesRepository()): {
  favorites: FavoritesService;
  repository: FakeFavoritesRepository;
} {
  return { favorites: new FavoritesService(repository), repository };
}

describe('FavoritesService.add', () => {
  it('creates the row and returns it, with createdAt as an ISO 8601 instant', async () => {
    const { favorites } = service();

    const created = await favorites.add(USER_ID, HOTEL_ID);

    expect(created).toEqual({
      userId: USER_ID,
      hotelId: HOTEL_ID,
      createdAt: CREATED_AT.toISOString(),
    });
  });

  it('409s FAVORITE_EXISTS on the second POST of the same hotel, not a bare CONFLICT', async () => {
    // The client branches on this code: a 409 for "already on" means keep the filled heart
    // instead of rolling an optimistic update back.
    const { favorites, repository } = service();
    await favorites.add(USER_ID, HOTEL_ID);

    await expect(favorites.add(USER_ID, HOTEL_ID)).rejects.toMatchObject({
      status: 409,
      response: { code: 'FAVORITE_EXISTS' },
    });
    // The refused insert left one row, not two: the pair is the key.
    expect(repository.rows.size).toBe(1);
  });

  it('404s HOTEL_NOT_FOUND for a hotel that does not exist, and writes nothing', async () => {
    const { favorites, repository } = service();

    await expect(
      favorites.add(USER_ID, MISSING_HOTEL_ID),
    ).rejects.toMatchObject({
      status: 404,
      response: { code: 'HOTEL_NOT_FOUND' },
    });
    expect(repository.inserts).toEqual([]);
  });

  it('looks the hotel up before inserting, so a bad id is a 404 and never a constraint error', async () => {
    // Checked after the fact this would be a 400 about a dangling reference from the
    // foreign key, which tells the client nothing it can act on.
    const { favorites, repository } = service();

    await favorites.add(USER_ID, MISSING_HOTEL_ID).catch(() => undefined);

    expect(repository.inserts).toEqual([]);
  });

  it('writes the user id it was given, which is the JWT subject at the edge', async () => {
    // The service takes the id as an argument and has no other source for it, so the only
    // user id that can reach a row is the one the controller read off the token.
    const { favorites, repository } = service();

    await favorites.add(USER_ID, HOTEL_ID);

    expect(repository.inserts).toEqual([[USER_ID, HOTEL_ID]]);
    expect([...repository.rows.values()]).toEqual([
      { userId: USER_ID, hotelId: HOTEL_ID, createdAt: CREATED_AT },
    ]);
  });

  it('lets two guests favourite the same hotel without colliding', async () => {
    // The key is the pair, not the hotel: a shared favourites list is not a thing.
    const { favorites, repository } = service();

    await favorites.add(USER_ID, HOTEL_ID);
    await favorites.add(OTHER_USER_ID, HOTEL_ID);

    expect(repository.rows.size).toBe(2);
  });
});

describe('FavoritesService.remove', () => {
  it('removes the caller’s own row and reports nothing', async () => {
    const { favorites, repository } = service();
    await favorites.add(USER_ID, HOTEL_ID);

    await expect(favorites.remove(USER_ID, HOTEL_ID)).resolves.toBeUndefined();
    expect(repository.rows.size).toBe(0);
  });

  it('is a no-op for a row that was never there, rather than a 404', async () => {
    // The second click of a toggle. Failing here would show the guest an error for a state
    // they caused on purpose.
    const { favorites, repository } = service();

    await expect(favorites.remove(USER_ID, HOTEL_ID)).resolves.toBeUndefined();
    expect(repository.removals).toEqual([[USER_ID, HOTEL_ID]]);
    expect(repository.rows.size).toBe(0);
  });

  it('is a no-op for a hotel id that does not exist at all', async () => {
    const { favorites, repository } = service();

    await expect(
      favorites.remove(USER_ID, MISSING_HOTEL_ID),
    ).resolves.toBeUndefined();
    expect(repository.removals).toEqual([[USER_ID, MISSING_HOTEL_ID]]);
  });

  it('leaves another guest’s favourite of the same hotel alone', async () => {
    // The reason the endpoint needs no ownership check: the row is keyed by the pair, so
    // "my favourite of this hotel" can only ever reach my row.
    const { favorites, repository } = service();
    await favorites.add(USER_ID, HOTEL_ID);
    await favorites.add(OTHER_USER_ID, HOTEL_ID);

    await favorites.remove(USER_ID, HOTEL_ID);

    expect([...repository.rows.keys()]).toEqual([
      `${OTHER_USER_ID}:${HOTEL_ID}`,
    ]);
  });
});

/**
 * The ticket's own verify line: "toggling twice returns to the original state". Written as
 * the whole sequence, because the promise only means anything once the statuses in the
 * middle of it are pinned too.
 */
describe('the favourite toggle', () => {
  it('add → remove → add returns to the original state', async () => {
    const { favorites, repository } = service();

    const first = await favorites.add(USER_ID, HOTEL_ID);
    await favorites.remove(USER_ID, HOTEL_ID);
    const afterRemove = [...repository.rows.keys()];
    const again = await favorites.add(USER_ID, HOTEL_ID);

    expect(afterRemove).toEqual([]);
    expect(again).toEqual(first);
    expect([...repository.rows.keys()]).toEqual([`${USER_ID}:${HOTEL_ID}`]);
  });

  it('runs POST → 201, POST → 409, DELETE → 204, DELETE → 204, POST → 201', async () => {
    const { favorites } = service();
    const statuses: number[] = [];

    /** Records the status a call produced: the success status, or the thrown one. */
    const record = async (
      successStatus: number,
      call: () => Promise<unknown>,
    ): Promise<void> => {
      try {
        await call();
        statuses.push(successStatus);
      } catch (error) {
        statuses.push(error instanceof ApiError ? error.getStatus() : 500);
      }
    };

    await record(201, () => favorites.add(USER_ID, HOTEL_ID));
    await record(201, () => favorites.add(USER_ID, HOTEL_ID));
    await record(204, () => favorites.remove(USER_ID, HOTEL_ID));
    await record(204, () => favorites.remove(USER_ID, HOTEL_ID));
    await record(201, () => favorites.add(USER_ID, HOTEL_ID));

    expect(statuses).toEqual([201, 409, 204, 204, 201]);
  });
});
