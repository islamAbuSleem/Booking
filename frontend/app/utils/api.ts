/**
 * API client — the only place that talks to the booking API.
 *
 * Every request goes through `apiFetch`, which unwraps the
 * `{ success: true, data } / { success: false, error }` envelope once and
 * normalises every failure into an `ApiRequestError { code, message, details }`.
 * Call sites branch on `error.code`, never on `error.message`.
 *
 * Auth rides the session cookie: `credentials: 'include'` on the client, and the
 * incoming `cookie` header forwarded on the server so SSR requests are
 * authenticated too.
 *
 * A transport failure (`code === 'NETWORK_ERROR'`) or a foreign response from a
 * port the API is not on means there is no backend to talk to. Pages treat those
 * as the mock-fallback signal via `isEnvelopeError`; a real envelope error
 * (validation, 404, …) is rethrown so the error state renders instead.
 */
import type { components } from '~/types/api'
import type { HotelFilterState, HotelSort } from '~/utils/hotels'

export type ApiHotelCard = components['schemas']['HotelCard']
export type ApiHotelDetail = components['schemas']['HotelDetail']
export type ApiHotelRoom = components['schemas']['HotelRoom']
export type ApiHotelImage = components['schemas']['HotelImage']
export type ApiHotelListData = components['schemas']['HotelListData']
export type ApiMoney = components['schemas']['Money']

export type ApiSort = 'recommended' | 'price_asc' | 'price_desc' | 'rating_desc' | 'name_asc'

export class ApiRequestError extends Error {
  readonly code: string
  readonly details: unknown

  constructor(code: string, message: string, details: unknown = undefined) {
    super(message)
    this.name = 'ApiRequestError'
    this.code = code
    this.details = details
  }
}

export function isApiError(error: unknown): error is ApiRequestError {
  return error instanceof ApiRequestError
}

/** No backend answered. Pages fall back to the mock fixtures on this, and only this. */
export function isTransportError(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === 'NETWORK_ERROR'
}

const LOCAL_FAILURES = new Set(['NETWORK_ERROR', 'BAD_RESPONSE'])

/**
 * The API itself answered with a well-formed envelope error — a 404, a 400, a
 * 429. That is a real response, so it drives the error / not-found state and is
 * never hidden behind fixtures. Anything else (no backend, a foreign response
 * from a port the API is not on) is a fallback signal.
 */
export function isEnvelopeError(error: unknown): boolean {
  if (!(error instanceof ApiRequestError)) return false
  if (LOCAL_FAILURES.has(error.code)) return false
  if (error.code.startsWith('HTTP_')) return false
  return true
}

interface SuccessEnvelope {
  success: true
  data: unknown
}

interface FailureEnvelope {
  success: false
  error: {
    code: string
    message: string
    details?: unknown
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isSuccessEnvelope(value: unknown): value is SuccessEnvelope {
  return isRecord(value) && value.success === true && 'data' in value
}

function isFailureEnvelope(value: unknown): value is FailureEnvelope {
  if (!isRecord(value) || value.success !== false) return false
  const error = value.error
  if (!isRecord(error)) return false
  return typeof error.code === 'string' && typeof error.message === 'string'
}

/** `$fetch` throws on non-2xx, so envelope errors arrive on `error.response._data`. */
function responsePayload(error: unknown): unknown {
  if (!isRecord(error)) return undefined
  const response = error.response
  if (!isRecord(response)) return undefined
  return response._data
}

function normalizeTransportError(error: unknown): ApiRequestError {
  if (isApiError(error)) return error
  const payload = responsePayload(error)
  if (isFailureEnvelope(payload)) {
    return new ApiRequestError(payload.error.code, payload.error.message, payload.error.details)
  }
  if (isRecord(error) && isRecord(error.response)) {
    const status = error.response.status
    const label = typeof status === 'number' ? `HTTP_${status}` : 'HTTP_ERROR'
    return new ApiRequestError(label, 'The service answered with something the app does not understand.')
  }
  return new ApiRequestError('NETWORK_ERROR', 'The booking service could not be reached.')
}

interface ApiRequestOptions {
  query?: Record<string, string | number>
}

export async function apiFetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { apiBase } = useRuntimeConfig().public
  const base = typeof apiBase === 'string' && apiBase.length > 0 ? apiBase : 'http://localhost:3000'

  const headers: Record<string, string> = {}
  if (import.meta.server) {
    const cookie = useRequestHeaders(['cookie']).cookie
    if (cookie) headers.cookie = cookie
  }

  let raw: unknown
  try {
    raw = await $fetch(path, {
      baseURL: base,
      credentials: 'include',
      headers,
      query: options.query,
    })
  }
  catch (error: unknown) {
    throw normalizeTransportError(error)
  }

  if (isSuccessEnvelope(raw)) return raw.data as T
  if (isFailureEnvelope(raw)) {
    throw new ApiRequestError(raw.error.code, raw.error.message, raw.error.details)
  }
  throw new ApiRequestError('BAD_RESPONSE', 'The service returned a response the app does not understand.')
}

/** UI sort values stay in the query string; the mapping happens here, at the edge. */
export function toApiSort(sort: HotelSort): ApiSort {
  switch (sort) {
    case 'price-asc': return 'price_asc'
    case 'price-desc': return 'price_desc'
    case 'rating': return 'rating_desc'
    case 'name': return 'name_asc'
    default: return 'recommended'
  }
}

/**
 * UI filter state → API query params. `stars` has no API param in the T16
 * contract, so it is intentionally absent here — the list page applies it
 * client-side and the report flags the gap.
 */
export function toHotelListParams(
  filters: HotelFilterState,
  sort: HotelSort,
  page: number,
  pageSize: number,
): Record<string, string | number> {
  const params: Record<string, string | number> = {
    guests: filters.guests,
    sort: toApiSort(sort),
    page,
    pageSize,
  }
  if (filters.city) params.city = filters.city
  if (filters.checkIn) params.checkIn = filters.checkIn
  if (filters.checkOut) params.checkOut = filters.checkOut
  if (filters.minPrice !== null) params.minPrice = filters.minPrice
  if (filters.maxPrice !== null) params.maxPrice = filters.maxPrice
  if (filters.amenities.length > 0) params.amenities = [...filters.amenities].sort().join(',')
  return params
}

export async function fetchHotels(params: Record<string, string | number>): Promise<ApiHotelListData> {
  return apiFetch<ApiHotelListData>('/api/hotels', { query: params })
}

/** Accepts a uuid or a slug — the frontend links to `/hotels/{slug}`. */
export async function fetchHotelDetail(id: string): Promise<ApiHotelDetail> {
  return apiFetch<ApiHotelDetail>(`/api/hotels/${encodeURIComponent(id)}`)
}
