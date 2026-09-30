import { Controller, Get, type INestApplication, Query } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { z } from 'zod';
import request from 'supertest';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter.js';
import { EnvelopeInterceptor } from '../src/common/interceptors/envelope.interceptor.js';
import { ZodValidationPipe } from '../src/common/pipes/zod-validation.pipe.js';
import { notFound } from '../src/common/errors/api-error.js';

/**
 * T13's contract, exercised over real HTTP: the success envelope, the error envelope, and
 * Nest's own 404 for an unmatched route.
 *
 * A miniature application is used on purpose. Booting `AppModule` would need a live
 * database, and the point of these assertions is the response shape, not the wiring.
 */
@Controller('probe')
class ProbeController {
  @Get('ok')
  ok(): { hello: string } {
    return { hello: 'world' };
  }

  @Get('search')
  search(
    @Query(
      new ZodValidationPipe(z.object({ page: z.coerce.number().int().min(1) })),
    )
    query: {
      page: number;
    },
  ): { page: number } {
    return query;
  }

  @Get('missing')
  missing(): never {
    throw notFound('HOTEL_NOT_FOUND', 'Hotel not found');
  }
}

describe('API envelope (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProbeController],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new EnvelopeInterceptor(new Reflector()));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('wraps a successful response in { success: true, data }', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/probe/ok')
      .expect(200);

    expect(response.body).toEqual({ success: true, data: { hello: 'world' } });
  });

  it('wraps a domain error in { success: false, error } and keeps its code', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/probe/missing')
      .expect(404);

    expect(response.body).toEqual({
      success: false,
      error: { code: 'HOTEL_NOT_FOUND', message: 'Hotel not found' },
    });
  });

  it('answers an unmatched route with the error envelope, not the Nest default body', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/does-not-exist')
      .expect(404);

    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(response.body).not.toHaveProperty('statusCode');
  });

  it('answers a failed validation with a 400 and the offending field', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/probe/search?page=0')
      .expect(400);

    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: 'VALIDATION_FAILED',
        details: [expect.objectContaining({ path: 'page' })],
      },
    });
  });

  it('coerces a valid query param through the same pipe', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/probe/search?page=2')
      .expect(200);

    expect(response.body).toEqual({ success: true, data: { page: 2 } });
  });
});
