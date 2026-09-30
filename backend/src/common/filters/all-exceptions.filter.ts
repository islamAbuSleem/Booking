import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { ApiErrorBody, ErrorCode } from '../errors/api-error.js';
import { isApiErrorBody } from '../errors/api-error-body.js';
import { translatePrismaError } from '../errors/prisma-error.js';

/**
 * T13 — the last thing a response passes through.
 *
 * Three jobs, in order:
 *   1. `HttpException` → the error envelope, preserving a code the service chose.
 *   2. A Prisma known-request error → 409 / 404 / 400, with nothing internal leaked.
 *   3. Anything else → a generic 500. The detail is logged with context and never sent.
 *
 * Nest's default body (`{ statusCode, message }`) never leaves this process.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();

    const { status, body } = this.resolve(exception);

    if (status >= 500) {
      this.logger.error(
        `[errors] ${request.method} ${request.url} -> ${status} ${body.code}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json({ success: false, error: body });
  }

  private resolve(exception: unknown): { status: number; body: ApiErrorBody } {
    if (exception instanceof HttpException) {
      const payload = exception.getResponse();
      const status = exception.getStatus();
      // A service that threw `ApiError` already chose its own code. Preserve it.
      if (isApiErrorBody(payload)) return { status, body: payload };
      return {
        status,
        body: {
          code: defaultCodeFor(status),
          message: messageFor(payload, status),
        },
      };
    }

    const translated = translatePrismaError(exception);
    if (translated) {
      return {
        status: translated.status,
        body: {
          code: translated.code as ErrorCode,
          message: translated.message,
        },
      };
    }

    return { status: HttpStatus.INTERNAL_SERVER_ERROR, body: INTERNAL_ERROR };
  }
}

const INTERNAL_ERROR: ApiErrorBody = {
  code: 'INTERNAL_ERROR',
  message: 'Internal server error',
};

function messageFor(payload: string | object, status: number): string {
  if (typeof payload === 'string') return payload;
  const message = (payload as { message?: unknown }).message;
  if (typeof message === 'string') return message;
  if (
    Array.isArray(message) &&
    message.every((part) => typeof part === 'string')
  ) {
    return message.join('; ');
  }
  return defaultCodeFor(status);
}

function defaultCodeFor(status: number): ErrorCode {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return 'BAD_REQUEST';
    case HttpStatus.UNAUTHORIZED:
      return 'UNAUTHORIZED';
    case HttpStatus.FORBIDDEN:
      return 'FORBIDDEN';
    case HttpStatus.NOT_FOUND:
      return 'NOT_FOUND';
    case HttpStatus.CONFLICT:
      return 'CONFLICT';
    case HttpStatus.UNPROCESSABLE_ENTITY:
      return 'UNPROCESSABLE';
    case HttpStatus.TOO_MANY_REQUESTS:
      return 'RATE_LIMITED';
    default:
      return 'INTERNAL_ERROR';
  }
}
