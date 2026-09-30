import {
  type ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ApiError } from '../errors/api-error.js';
import { Prisma } from '../../generated/prisma/client.js';
import { AllExceptionsFilter } from './all-exceptions.filter.js';

/**
 * A minimal `ArgumentsHost` double. The filter's whole job is deciding status + body, so
 * a fake response is enough and there is no reason to boot an HTTP server here.
 *
 * The cast is deliberate: `ArgumentsHost` is generic and its three transport variants
 * (http / rpc / ws) are not what is under test.
 */
function hostFor(
  request: { method: string; url: string; path: string } = {
    method: 'GET',
    url: '/api/hotels?city=Lisbon&token=secret',
    path: '/api/hotels',
  },
) {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const response = { status, json };

  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;

  return { host, response };
}

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();
  let errorLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorLogSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockReturnValue(undefined);
  });

  afterEach(() => {
    errorLogSpy.mockRestore();
  });

  it('keeps a domain code chosen by the service', () => {
    const { host, response } = hostFor();

    filter.catch(
      new ApiError(HttpStatus.NOT_FOUND, 'HOTEL_NOT_FOUND', 'Hotel not found'),
      host,
    );

    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.json).toHaveBeenCalledWith({
      success: false,
      error: { code: 'HOTEL_NOT_FOUND', message: 'Hotel not found' },
    });
  });

  it('turns a bare Nest NotFoundException into the envelope, not the Nest default body', () => {
    const { host, response } = hostFor();

    filter.catch(new NotFoundException('Cannot GET /api/nope'), host);

    expect(response.status).toHaveBeenCalledWith(404);
    const body = response.json.mock.calls[0]?.[0];
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body).not.toHaveProperty('statusCode');
  });

  it('translates a Prisma unique-constraint error to 409 without leaking its message', () => {
    const { host, response } = hostFor();

    filter.catch(
      new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on slug',
        {
          code: 'P2002',
          clientVersion: '7.10.0',
        },
      ),
      host,
    );

    expect(response.status).toHaveBeenCalledWith(409);
    expect(response.json).toHaveBeenCalledWith({
      success: false,
      error: { code: 'CONFLICT', message: 'That value is already taken' },
    });
  });

  it('translates a Prisma not-found error to 404', () => {
    const { host, response } = hostFor();

    filter.catch(
      new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: '7.10.0',
      }),
      host,
    );

    expect(response.status).toHaveBeenCalledWith(404);
  });

  it('hides an unexpected error behind a generic 500', () => {
    const { host, response } = hostFor();

    filter.catch(
      new Error('connection string postgres://user:hunter2@host/db failed'),
      host,
    );

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  });

  it('never leaks a stack trace', () => {
    const { host, response } = hostFor();

    filter.catch(new HttpException('boom', 500), host);

    const serialised = JSON.stringify(response.json.mock.calls[0]?.[0]);
    expect(serialised).not.toContain('stack');
    expect(serialised).not.toContain('at ');
  });

  it('logs the path but never the query string', () => {
    const { host } = hostFor();

    filter.catch(new Error('boom'), host);

    const logged = errorLogSpy.mock.calls.flat().join(' ');
    expect(logged).toContain('/api/hotels');
    expect(logged).not.toContain('token=secret');
    expect(logged).not.toContain('Lisbon');
  });
});
