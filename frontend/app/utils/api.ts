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
 * A transport failure (`code === 'NETWORK_ERROR'`) or a 2xx from a foreign
 * response on a port the API is not on means there is no backend to talk to.
 * Pages treat those as the mock-fallback signal via `isApiFailure`; a real
 * failure — an envelope error (validation, 404, …) or an HTTP error status — is
 * rethrown so the error state renders instead.
 */
import type { components } from '~/types/api'
import type { HotelFilterState, HotelSort } from '~/utils/hotels'

export type ApiHotelCard = components['schemas']['HotelCard']
export type ApiHotelDetail = components['schemas']['HotelDetail']
export type ApiHotelRoom = components['schemas']['HotelRoom']
export type ApiHotelImage = components['schemas']['HotelImage']
export type ApiHotelListData = components['schemas']['HotelListData']
export type ApiMoney = components['schemas']['Money']
export type ApiQuoteData = components['schemas']['QuoteData']
export type ApiQuoteNight = components['schemas']['QuoteNight']
export type ApiFavorite = components['schemas']['Favorite']
export type ApiBooking = components['schemas']['Booking']
export type ApiBookingListData = components['schemas']['BookingListData']

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

/** No backend answered *at all*, or something that answered 2xx but is not the API. Pages fall back to the mock fixtures on these two, and only these. */
const LOCAL_FAILURES = new Set(['NETWORK_ERROR', 'BAD_RESPONSE'])

/**
 * The API answered and the answer is a real failure — an envelope error, or an
 * HTTP error status whose body was not an envelope (`HTTP_502` from a proxy, a
 * 500 from a crashed process). Both mean the service is there and unhappy, so
 * they drive the error / not-found state and are never hidden behind fixtures:
 * a guest must never be shown fixture rooms while a real search is broken.
 *
 * Only a transport failure (`NETWORK_ERROR` — nothing listening) or a 2xx from
 * a foreign service (`BAD_RESPONSE`) means there is no backend here, and those
 * are the mock-fallback signal.
 */
export function isApiFailure(error: unknown): boolean {
  if (!(error instanceof ApiRequestError)) return false
  return !LOCAL_FAILURES.has(error.code)
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
  /**
   * `POST` for the writes that carry a body — the quote (which changes nothing, the
   * server prices a stay and answers 200) and the favourites insert. `DELETE` is a
   * path-only call that answers 204 with no body at all.
   */
  method?: 'POST' | 'DELETE'
  body?: Record<string, string | number>
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
      method: options.method,
      query: options.query,
      body: options.body,
    })
  }
  catch (error: unknown) {
    throw normalizeTransportError(error)
  }

  if (isSuccessEnvelope(raw)) return raw.data as T
  // `unfavorite` is the only call that answers 204, so it is the only one allowed to come
  // back with no body. The tolerance is scoped to it deliberately: an empty 200 anywhere
  // else is not a success, and returning `undefined as T` there is a typed lie that every
  // read call site trusts — `BAD_RESPONSE` is the honest answer and it is a fallback
  // signal, so a broken response shows fixtures instead of a silent `TypeError`.
  if (options.method === 'DELETE' && (raw === undefined || raw === null || raw === '')) {
    return undefined as T
  }
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

/**
 * `POST /api/bookings/quote` — the T18 body. `currency` is the property's own quoted
 * currency, read from the detail payload rather than asserted here, so the site never
 * asks for a currency it has not shown prices in.
 *
 * Half-open dates: `checkOut` is the day the guest leaves, not a night.
 */
export interface QuoteRequest {
  roomId: string
  checkIn: string
  checkOut: string
  guests: number
  currency?: string
}

export async function fetchQuote(request: QuoteRequest): Promise<ApiQuoteData> {
  return apiFetch<ApiQuoteData>('/api/bookings/quote', { method: 'POST', body: { ...request } })
}

/**
 * T19. `hotelId` is the **uuid**, not the slug — `GET /hotels/:id` accepts either, so a
 * detail page keyed on `slug` will cheerfully send the wrong one and collect a 404.
 * A duplicate is a `FAVORITE_EXISTS` 409, not a second 201; reconciling that is the
 * caller's job because it owns the toggle, not the transport.
 */
export async function fetchFavorite(hotelId: string): Promise<ApiFavorite> {
  return apiFetch<ApiFavorite>('/api/favorites', { method: 'POST', body: { hotelId } })
}

/** 204, no body. Nothing to unwrap and nothing worth returning. */
export async function unfavorite(hotelId: string): Promise<void> {
  await apiFetch<undefined>(`/api/favorites/${encodeURIComponent(hotelId)}`, { method: 'DELETE' })
}

/**
 * T20. `GET /api/bookings` — the caller's own trips, newest first. An anonymous session
 * (no auth yet — T23) answers 401 `UNAUTHORIZED`, which the pages treat as "nothing
 * answered" and degrade to the fixtures rather than an error state.
 */
export async function fetchMyBookings(): Promise<ApiBookingListData> {
  return apiFetch<ApiBookingListData>('/api/bookings')
}

/**
 * T20. `GET /api/bookings/:id`. 404 `BOOKING_NOT_FOUND` and 403 `NOT_BOOKING_OWNER`
 * are both *answers*, not failures: a trip that is not yours reads as one you cannot
 * see, so the caller renders its not-found state instead of a fixture or an error.
 */
export async function fetchBooking(id: string): Promise<ApiBooking> {
  return apiFetch<ApiBooking>(`/api/bookings/${encodeURIComponent(id)}`)
}

/**
 * T20. `POST /api/bookings/:id/cancel` — no body, so it is a `POST` option without
 * `body`, unlike the quote and the favourites write. Guarded to `CONFIRMED` on the
 * server (D55); the 200 body carries the booking in its new `CANCELLED` state, which
 * is the source of truth for the flip — any other state answers 409
 * `INVALID_CANCEL_STATE` and the caller must not claim a cancellation.
 */
export async function cancelBooking(id: string): Promise<ApiBooking> {
  return apiFetch<ApiBooking>(`/api/bookings/${encodeURIComponent(id)}/cancel`, { method: 'POST' })
}
