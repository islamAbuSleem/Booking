import { ApiError } from '../../common/errors/api-error.js';
import {
  DEFAULT_CURRENCY,
  type HotelCard,
  type HotelDetail,
  type HotelListPage,
  type HotelSearchCriteria,
  type HotelsRepository,
} from '../../prisma/hotels.repository.js';
import {
  hotelSearchQuery,
  type HotelSearchQuery,
} from './dto/hotel-search-query.js';
import { HotelsService } from './hotels.service.js';

function card(
  overrides: Partial<HotelCard> & Pick<HotelCard, 'id' | 'slug' | 'name'>,
): HotelCard {
  return {
    city: 'Lisbon',
    country: 'Portugal',
    starRating: 4,
    coverImage: null,
    amenityIds: ['wifi'],
    rating: { average: 9, totalReviews: 10 },
    priceFrom: { amountCents: 20_000, currency: 'USD' },
    currency: 'USD',
    ...overrides,
  };
}

/**
 * Stands in for Prisma. The service talks to `HotelsRepository`, not `PrismaService`, so
 * the sort, pagination and 404 rules are all testable here with no database and no Nest
 * container.
 */
class FakeHotelsRepository implements HotelsRepository {
  readonly criteriaSeen: HotelSearchCriteria[] = [];
  private readonly rows: HotelCard[];

  constructor(
    rows: HotelCard[] = [],
    private readonly details = new Map<string, HotelDetail>(),
  ) {
    this.rows = rows;
  }

  async findPublished(criteria: HotelSearchCriteria): Promise<HotelListPage> {
    this.criteriaSeen.push(criteria);
    return { items: this.rows, total: this.rows.length };
  }

  async findById(id: string): Promise<HotelDetail | null> {
    return this.details.get(id) ?? null;
  }
}

function detail(overrides: Partial<HotelDetail> = {}): HotelDetail {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    slug: 'the-larkspur-hotel',
    name: 'The Larkspur Hotel',
    description: 'A palazzo.',
    addressLine: 'Rua das Flores 41',
    city: 'Lisbon',
    country: 'Portugal',
    lat: 38.7101,
    lng: -9.1425,
    starRating: 4,
    status: 'PUBLISHED',
    checkInTime: '15:00',
    checkOutTime: '11:00',
    currency: 'USD',
    coverImage: null,
    images: [],
    amenityIds: ['wifi'],
    rating: { average: 4.6, totalReviews: 2 },
    rooms: [],
    host: { id: 'host-1', name: 'Beatriz Salgueiro' },
    ...overrides,
  };
}

function query(overrides: Record<string, unknown> = {}): HotelSearchQuery {
  return hotelSearchQuery.parse(overrides);
}

describe('HotelsService.findAll', () => {
  it('asks the repository for published hotels in the requested currency', async () => {
    const repository = new FakeHotelsRepository([
      card({ id: 'a', slug: 'a', name: 'A' }),
    ]);
    const service = new HotelsService(repository);

    const page = await service.findAll(
      query({ city: 'Lisbon', guests: '3', currency: 'usd' }),
    );

    expect(repository.criteriaSeen).toEqual([
      { city: 'Lisbon', amenities: [], guests: 3, currency: 'USD' },
    ]);
    expect(page.total).toBe(1);
    expect(page.page).toBe(1);
    expect(page.pageSize).toBe(12);
  });

  it('converts major-unit price filters to integer cents', async () => {
    const repository = new FakeHotelsRepository();
    const service = new HotelsService(repository);

    await service.findAll(query({ minPrice: '150.25', maxPrice: '500' }));

    expect(repository.criteriaSeen[0]).toMatchObject({
      minPriceCents: 15_025,
      maxPriceCents: 50_000,
    });
  });

  it('rounds a price whose cents sit on a float half-step', async () => {
    const repository = new FakeHotelsRepository();
    const service = new HotelsService(repository);

    // 1.005 * 100 is 100.49999999999999, so a plain Math.round loses the cent.
    await service.findAll(query({ minPrice: '1.005', maxPrice: '8.165' }));

    expect(repository.criteriaSeen[0]).toMatchObject({
      minPriceCents: 101,
      maxPriceCents: 817,
    });
  });

  it('passes the amenity slugs through', async () => {
    const repository = new FakeHotelsRepository();
    const service = new HotelsService(repository);

    await service.findAll(query({ amenities: 'pool,wifi' }));

    expect(repository.criteriaSeen[0]?.amenities).toEqual(['pool', 'wifi']);
  });

  it('paginates, and reports the unpaginated total', async () => {
    const rows = Array.from({ length: 5 }, (_, index) =>
      card({
        id: `h${index}`,
        slug: `h${index}`,
        name: `Hotel ${index}`,
        starRating: 5 - index,
      }),
    );
    const service = new HotelsService(new FakeHotelsRepository(rows));

    const page = await service.findAll(query({ page: '2', pageSize: '2' }));

    expect(page.items.map((item) => item.id)).toEqual(['h2', 'h3']);
    expect(page.total).toBe(5);
  });

  it('returns an empty page past the end rather than throwing', async () => {
    const service = new HotelsService(new FakeHotelsRepository([]));

    const page = await service.findAll(query({ page: '9' }));

    expect(page.items).toEqual([]);
    expect(page.total).toBe(0);
  });

  describe('sorting', () => {
    const rows = [
      card({
        id: 'cheap',
        slug: 'cheap',
        name: 'Cheap',
        starRating: 5,
        priceFrom: { amountCents: 9_000, currency: 'USD' },
      }),
      card({
        id: 'dear',
        slug: 'dear',
        name: 'Dear',
        starRating: 3,
        priceFrom: { amountCents: 90_000, currency: 'USD' },
      }),
      card({
        id: 'unrated',
        slug: 'unrated',
        name: 'Unrated',
        starRating: 1,
        rating: { average: null, totalReviews: 0 },
        priceFrom: null,
      }),
    ];

    it('orders by ascending price, ignoring the missing', async () => {
      const service = new HotelsService(new FakeHotelsRepository(rows));

      const page = await service.findAll(query({ sort: 'price_asc' }));

      expect(page.items.map((item) => item.id)).toEqual([
        'cheap',
        'dear',
        'unrated',
      ]);
    });

    it('orders by descending price, ignoring the missing', async () => {
      const service = new HotelsService(new FakeHotelsRepository(rows));

      const page = await service.findAll(query({ sort: 'price_desc' }));

      expect(page.items.map((item) => item.id)).toEqual([
        'dear',
        'cheap',
        'unrated',
      ]);
    });

    it('puts a hotel with no reviews last, because null is not the best rating', async () => {
      const service = new HotelsService(new FakeHotelsRepository(rows));

      const page = await service.findAll(query({ sort: 'rating_desc' }));

      expect(page.items.at(-1)?.id).toBe('unrated');
    });

    it('recommends by star rating then name', async () => {
      const service = new HotelsService(new FakeHotelsRepository(rows));

      const page = await service.findAll(query());

      expect(page.items.map((item) => item.id)).toEqual([
        'cheap',
        'dear',
        'unrated',
      ]);
    });
  });

  it('does not mutate the array the repository handed back', async () => {
    const rows = [
      card({
        id: 'a',
        slug: 'a',
        name: 'A',
        priceFrom: { amountCents: 50_000, currency: 'USD' },
      }),
      card({
        id: 'b',
        slug: 'b',
        name: 'B',
        priceFrom: { amountCents: 10_000, currency: 'USD' },
      }),
    ];
    const service = new HotelsService(new FakeHotelsRepository(rows));

    await service.findAll(query({ sort: 'price_asc' }));

    expect(rows.map((row) => row.id)).toEqual(['a', 'b']);
  });
});

describe('HotelsService.findOne', () => {
  it('returns a published hotel', async () => {
    const details = new Map([['the-larkspur-hotel', detail()]]);
    const service = new HotelsService(new FakeHotelsRepository([], details));

    const found = await service.findOne('the-larkspur-hotel');

    expect(found.slug).toBe('the-larkspur-hotel');
    expect(found.currency).toBe(DEFAULT_CURRENCY);
  });

  it('404s with HOTEL_NOT_FOUND for an unknown id', async () => {
    const service = new HotelsService(new FakeHotelsRepository());

    await expect(service.findOne('nope')).rejects.toMatchObject({
      status: 404,
      response: { code: 'HOTEL_NOT_FOUND', message: 'Hotel not found' },
    });
  });

  it('404s for a non-PUBLISHED hotel, so a draft cannot be probed', async () => {
    const details = new Map([
      ['the-barn-at-fen-end', detail({ status: 'PENDING' })],
    ]);
    const service = new HotelsService(new FakeHotelsRepository([], details));

    const error = await service
      .findOne('the-barn-at-fen-end')
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).getStatus()).toBe(404);
  });

  it('lets a host read their own draft', async () => {
    const details = new Map([
      [
        'the-barn-at-fen-end',
        detail({ status: 'PENDING', host: { id: 'host-1', name: 'Beatriz' } }),
      ],
    ]);
    const service = new HotelsService(new FakeHotelsRepository([], details));

    const found = await service.findOne('the-barn-at-fen-end', 'host-1');

    expect(found.status).toBe('PENDING');
  });

  it('still 404s a draft for a different host', async () => {
    const details = new Map([
      ['the-barn-at-fen-end', detail({ status: 'PENDING' })],
    ]);
    const service = new HotelsService(new FakeHotelsRepository([], details));

    await expect(
      service.findOne('the-barn-at-fen-end', 'some-other-host'),
    ).rejects.toMatchObject({
      status: 404,
    });
  });
});
