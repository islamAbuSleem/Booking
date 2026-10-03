import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/bootstrap.js';
import {
  HOTELS_REPOSITORY,
  type HotelCard,
  type HotelDetail,
  type HotelListPage,
  type HotelSearchCriteria,
  type HotelsRepository,
} from '../src/prisma/hotels.repository.js';
import { HOST_REPOSITORY } from '../src/modules/host/host.repository.js';
import { StubHostRepository } from '../src/modules/host/host.stub.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * The assembled API over real HTTP, with only the database replaced.
 *
 * This is the test that the T13/T13a/T16 contract holds: the envelope on both sides, the
 * 404 body, validation, and the routes the frontend agent generates types from.
 */
class StubHotelsRepository implements HotelsRepository {
  readonly criteria: HotelSearchCriteria[] = [];

  constructor(
    private readonly cards: HotelCard[],
    private readonly details = new Map<string, HotelDetail>(),
  ) {}

  async findPublished(criteria: HotelSearchCriteria): Promise<HotelListPage> {
    this.criteria.push(criteria);
    return { items: this.cards, total: this.cards.length };
  }

  async findById(id: string): Promise<HotelDetail | null> {
    return this.details.get(id) ?? null;
  }
}

const LARKSPUR: HotelDetail = {
  id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
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
  amenityIds: ['wifi', 'pool'],
  rating: { average: 4.7, totalReviews: 2 },
  rooms: [
    {
      id: '9a1f0c2e-2c5e-4a1b-9b6a-6a0c6a3f1a11',
      name: 'Courtyard King Room',
      description: 'Faces the walled courtyard.',
      bedType: 'King',
      maxGuests: 2,
      totalInventory: 4,
      price: { amountCents: 21_400, currency: 'USD' },
      images: [],
    },
  ],
  host: {
    id: 'b2c3d4e5-0000-4000-8000-000000000001',
    name: 'Beatriz Salgueiro',
  },
};

function cardFrom(detail: HotelDetail): HotelCard {
  return {
    id: detail.id,
    slug: detail.slug,
    name: detail.name,
    city: detail.city,
    country: detail.country,
    starRating: detail.starRating,
    coverImage: null,
    amenityIds: detail.amenityIds,
    rating: detail.rating,
    priceFrom: { amountCents: 21_400, currency: 'USD' },
    currency: 'USD',
  };
}

describe('Booking API (e2e)', () => {
  let app: INestApplication;
  let repository: StubHotelsRepository;

  // Built once: the app is read-only from here, and assembling the OpenAPI document for
  // every test dominated the run time.
  beforeAll(async () => {
    repository = new StubHotelsRepository(
      [cardFrom(LARKSPUR)],
      new Map([[LARKSPUR.slug, LARKSPUR]]),
    );

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        $queryRaw: () => Promise.resolve([{ ok: 1 }]),
        $connect: () => Promise.resolve(),
      })
      .overrideProvider(HOTELS_REPOSITORY)
      .useValue(repository)
      .overrideProvider(HOST_REPOSITORY)
      .useValue(new StubHostRepository())
      .compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  beforeEach(() => {
    repository.criteria.length = 0;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/health', () => {
    it('reports ok inside the envelope', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/health')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: { status: 'ok', db: 'up' },
      });
    });
  });

  describe('GET /api/hotels', () => {
    it('returns items, total, page and pageSize inside the envelope', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/hotels')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        total: 1,
        page: 1,
        pageSize: 12,
      });
      expect(response.body.data.items[0]).toMatchObject({
        slug: 'the-larkspur-hotel',
        priceFrom: { amountCents: 21_400, currency: 'USD' },
      });
    });

    it('parses the whole query string through the Zod schema', async () => {
      await request(app.getHttpServer())
        .get(
          '/api/hotels?city=Lisbon&guests=3&minPrice=150&maxPrice=500&amenities=wifi,pool&sort=price_asc&page=2&pageSize=6',
        )
        .expect(200);

      expect(repository.criteria.at(-1)).toEqual({
        city: 'Lisbon',
        amenities: ['pool', 'wifi'],
        guests: 3,
        minPriceCents: 15_000,
        maxPriceCents: 50_000,
        currency: 'USD',
      });
    });

    it('rejects a checkout before checkin with a 400 envelope', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/hotels?checkIn=2026-06-04&checkOut=2026-06-01')
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'VALIDATION_FAILED',
          details: [expect.objectContaining({ path: 'checkOut' })],
        },
      });
    });

    it('rejects minPrice above maxPrice with a 400 envelope', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/hotels?minPrice=500&maxPrice=100')
        .expect(400);

      expect(response.body.error.details[0].path).toBe('minPrice');
    });
  });

  describe('GET /api/hotels/:id', () => {
    it('resolves by slug, because the frontend links to /hotels/{slug}', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/hotels/the-larkspur-hotel')
        .expect(200);

      expect(response.body.data).toMatchObject({
        slug: 'the-larkspur-hotel',
        rating: { average: 4.7, totalReviews: 2 },
      });
      expect(response.body.data.rooms[0].price).toEqual({
        amountCents: 21_400,
        currency: 'USD',
      });
    });

    it('404s with HOTEL_NOT_FOUND inside the envelope', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/hotels/nope')
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        error: { code: 'HOTEL_NOT_FOUND', message: 'Hotel not found' },
      });
    });
  });

  describe('the OpenAPI contract', () => {
    it('serves the raw document at /api/docs-json, unwrapped', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/docs-json')
        .expect(200);

      expect(response.body).not.toHaveProperty('success');
      expect(response.body.openapi).toBe('3.0.0');
      expect(Object.keys(response.body.paths)).toEqual(
        expect.arrayContaining([
          '/api/health',
          '/api/hotels',
          '/api/hotels/{id}',
        ]),
      );
    });

    it('documents the hotels list query string in full', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/docs-json')
        .expect(200);
      const names = response.body.paths['/api/hotels'].get.parameters.map(
        (parameter: { name: string }) => parameter.name,
      );

      expect(names).toEqual([
        'city',
        'checkIn',
        'checkOut',
        'guests',
        'minPrice',
        'maxPrice',
        'amenities',
        'sort',
        'page',
        'pageSize',
        'currency',
      ]);
    });

    it('resolves every $ref in the document', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/docs-json')
        .expect(200);
      const refs =
        JSON.stringify(response.body).match(
          /components\/schemas\/([A-Za-z0-9_.-]+)/g,
        ) ?? [];
      const known = new Set(Object.keys(response.body.components.schemas));

      expect(refs.length).toBeGreaterThan(0);
      for (const ref of refs) {
        expect(known.has(ref.split('/').pop() ?? '')).toBe(true);
      }
    });

    it('matches the committed openapi.json', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/docs-json')
        .expect(200);
      const committed = JSON.parse(
        await readFile(
          fileURLToPath(new URL('../openapi.json', import.meta.url)),
          'utf8',
        ),
      );

      expect(committed).toEqual(response.body);
    });
  });

  it('answers an unknown route with the error envelope, not the Nest default body', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/nope')
      .expect(404);

    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(response.body).not.toHaveProperty('statusCode');
  });
});
