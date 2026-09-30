import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * The machine-readable error codes the API is allowed to emit. Clients branch on these,
 * never on `message` (context/code-standards.md, "Error contract").
 *
 * Extend this union when a new module introduces a code; the exception filter and the
 * OpenAPI document are both generated from it, so a typo is a type error.
 */
export const ERROR_CODES = [
  'BAD_REQUEST',
  'VALIDATION_FAILED',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'UNPROCESSABLE',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
  // Module-specific. T14/T16 own these; more are added as modules land.
  'HOTEL_NOT_FOUND',
  'ROOM_NOT_FOUND',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiErrorBody {
  code: ErrorCode;
  message: string;
  details?: unknown;
}

/**
 * The only error type domain code should throw. Everything else that reaches the
 * exception filter is treated as internal and hidden from the client.
 */
export class ApiError extends HttpException {
  constructor(
    status: HttpStatus,
    code: ErrorCode,
    message: string,
    details?: unknown,
  ) {
    const body: ApiErrorBody =
      details === undefined ? { code, message } : { code, message, details };
    super(body, status);
  }
}

export function badRequest(message: string, details?: unknown): ApiError {
  return new ApiError(HttpStatus.BAD_REQUEST, 'BAD_REQUEST', message, details);
}

export function notFound(
  code: ErrorCode,
  message: string,
  details?: unknown,
): ApiError {
  return new ApiError(HttpStatus.NOT_FOUND, code, message, details);
}
