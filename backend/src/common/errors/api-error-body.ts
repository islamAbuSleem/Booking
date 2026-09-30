import { ERROR_CODES, type ApiErrorBody } from './api-error.js';

const CODES = new Set<string>(ERROR_CODES);

/**
 * Narrows an `HttpException` payload to the envelope's `error` body. A service that
 * throws `ApiError` puts one of these on the wire; everything else does not, and the
 * filter falls back to a status-derived code.
 */
export function isApiErrorBody(payload: unknown): payload is ApiErrorBody {
  if (typeof payload !== 'object' || payload === null) return false;
  const candidate = payload as Partial<ApiErrorBody>;
  return (
    typeof candidate.code === 'string' &&
    CODES.has(candidate.code) &&
    typeof candidate.message === 'string'
  );
}
