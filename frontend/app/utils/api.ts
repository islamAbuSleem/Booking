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
export type ApiUploadSign = components['schemas']['UploadSign']
export type ApiAttachUpload = components['schemas']['AttachUpload']
export type ApiHostHotelListItem = components['schemas']['HostHotelListItem']
export type ApiHostHotelListData = components['schemas']['HostHotelListData']
export type ApiHostHotelDetail = components['schemas']['HostHotelDetail']
export type ApiHostRoom = components['schemas']['RoomDetail']
export type ApiHostBlackout = components['schemas']['BlackoutDate']
export type ApiHostBooking = components['schemas']['HostBookingListItem']
export type ApiHostBookingListData = components['schemas']['HostBookingListData']
export type ApiCreateHotel = components['schemas']['CreateHotel']
export type ApiUpdateHotel = components['schemas']['UpdateHotel']
export type ApiCreateRoom = components['schemas']['CreateRoom']
export type ApiUpdateRoom = components['schemas']['UpdateRoom']
export type ApiCreateBlackout = components['schemas']['CreateBlackout']
export type ApiReview = components['schemas']['Review']
export type ApiReviewListData = components['schemas']['ReviewListData']
export type ApiReviewable = components['schemas']['ReviewableData']
export type ApiCreateReview = components['schemas']['CreateReview']
export type ApiIntentData = components['schemas']['IntentData']
export type ApiPayment = components['schemas']['Payment']
export type ApiAdminHotel = components['schemas']['AdminHotel']
export type ApiAdminUser = components['schemas']['AdminUser']
export type ApiAdminReview = components['schemas']['AdminReview']
export type ApiAdminStats = components['schemas']['AdminStats']
export type ApiAdminHotelStatus = ApiAdminHotel['status']
export type ApiAdminUserStatus = ApiAdminUser['status']
export type ApiAdminReviewStatus = ApiAdminReview['status']
export type ApiThread = components['schemas']['Thread']
export type ApiThreadListData = components['schemas']['ThreadListData']
export type ApiThreadMessage = components['schemas']['Message']
export type ApiThreadMessageListData = components['schemas']['MessageListData']
export type ApiCreateThread = components['schemas']['CreateThread']
export type ApiSendMessage = components['schemas']['SendMessage']

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
   * server prices a stay and answers 200), the favourites insert, and the upload
   * sign/attach. `DELETE` is a path-only call that answers 204 with no body at all.
   * `PATCH` for the updates that carry a partial body.
   */
  method?: 'POST' | 'DELETE' | 'PATCH'
  /**
   * Flat key/value bodies stay a `Record` so `$fetch` omits `undefined` optionals and
   * the API applies its own defaults. Bodies with nested arrays (room prices, room
   * images) cannot be expressed that way, so they travel as `json` instead — one or
   * the other, never both.
   */
  body?: Record<string, string | number | boolean | undefined>
  json?: unknown
  /**
   * Set only for a route that answers 204 with no body on a non-`DELETE` method —
   * `POST /api/auth/logout`. A 204 is a legitimate protocol answer, but it is not a success
   * envelope, so without this the client would call it `BAD_RESPONSE` and report a logout
   * that the server had already performed as a failure. Opting in per call keeps the
   * default strict: an empty body anywhere else is still a real protocol mismatch.
   */
  tolerateEmptyBody?: boolean
}

/** A 204 with no body arrives as `undefined`, `null` or `''` depending on the runtime. */
function isEmptyBody(raw: unknown): boolean {
  return raw === undefined || raw === null || raw === ''
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
      body: options.json !== undefined ? options.json : options.body,
    })
  }
  catch (error: unknown) {
    throw normalizeTransportError(error)
  }

  if (isSuccessEnvelope(raw)) return raw.data as T
  // An empty body is only a success where the route documents one. `unfavorite` and the
  // logout POST answer 204 with nothing to unwrap; every other call must carry `data`, and
  // returning `undefined as T` there is a typed lie that every read call site trusts.
  // `BAD_RESPONSE` is the honest answer elsewhere, so a broken response shows fixtures
  // instead of a silent `TypeError`.
  if (isEmptyBody(raw) && (options.method === 'DELETE' || options.tolerateEmptyBody === true)) {
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

/**
 * T22. The host's own listings. Scoped server-side to the caller — a 403
 * `NOT_HOTEL_OWNER` is the answer for someone else's id, and the list never contains
 * it in the first place. Anonymous callers 401, which pages treat as the mock-fallback
 * signal exactly like the bookings pages do.
 */
export async function fetchMyHotels(): Promise<ApiHostHotelListData> {
  return apiFetch<ApiHostHotelListData>('/api/host/hotels')
}

/** Accepts a uuid or a slug, like the public detail route. */
export async function fetchMyHotel(id: string): Promise<ApiHostHotelDetail> {
  return apiFetch<ApiHostHotelDetail>(`/api/host/hotels/${encodeURIComponent(id)}`)
}

/** Creates the listing `PENDING`. The slug comes back on the detail for the edit link. */
export async function createHotel(body: ApiCreateHotel): Promise<ApiHostHotelDetail> {
  return apiFetch<ApiHostHotelDetail>('/api/host/hotels', { method: 'POST', json: body })
}

/** A host can suspend their own listing here, but never publish it (403 `FORBIDDEN`). */
export async function updateHotel(id: string, body: ApiUpdateHotel): Promise<ApiHostHotelDetail> {
  return apiFetch<ApiHostHotelDetail>(`/api/host/hotels/${encodeURIComponent(id)}`, { method: 'PATCH', json: body })
}

/** 204, no body. Rooms, images and blackouts cascade server-side. */
export async function deleteHotel(id: string): Promise<void> {
  await apiFetch<undefined>(`/api/host/hotels/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function createRoom(hotelId: string, body: ApiCreateRoom): Promise<ApiHostRoom> {
  return apiFetch<ApiHostRoom>(`/api/host/hotels/${encodeURIComponent(hotelId)}/rooms`, { method: 'POST', json: body })
}

export async function updateRoom(roomId: string, body: ApiUpdateRoom): Promise<ApiHostRoom> {
  return apiFetch<ApiHostRoom>(`/api/host/hotels/rooms/${encodeURIComponent(roomId)}`, { method: 'PATCH', json: body })
}

/** 204, no body. Only when no confirmed booking needs the room. */
export async function deleteRoom(roomId: string): Promise<void> {
  await apiFetch<undefined>(`/api/host/hotels/rooms/${encodeURIComponent(roomId)}`, { method: 'DELETE' })
}

/**
 * `roomId: null` closes the whole hotel for the range, otherwise just that room.
 * Dates are `YYYY-MM-DD`, inclusive on both ends.
 */
export async function createBlackout(hotelId: string, body: ApiCreateBlackout): Promise<ApiHostBlackout> {
  return apiFetch<ApiHostBlackout>(`/api/host/hotels/${encodeURIComponent(hotelId)}/blackouts`, { method: 'POST', json: body })
}

/** 204, no body. */
export async function deleteBlackout(blackoutId: string): Promise<void> {
  await apiFetch<undefined>(`/api/host/hotels/blackouts/${encodeURIComponent(blackoutId)}`, { method: 'DELETE' })
}

/** Every booking on the caller's rooms, newest first — the "incoming" table. */
export async function fetchHostBookings(): Promise<ApiHostBookingListData> {
  return apiFetch<ApiHostBookingListData>('/api/host/hotels/bookings')
}

/**
 * T24. A hotel's visible reviews, newest first. Takes the same uuid-or-slug the detail
 * route does, so the page never resolves the slug first and waterfalls.
 */
export async function fetchHotelReviews(hotelIdOrSlug: string, page = 1, pageSize = 10): Promise<ApiReviewListData> {
  return apiFetch<ApiReviewListData>(`/api/hotels/${encodeURIComponent(hotelIdOrSlug)}/reviews`, {
    query: { page, pageSize },
  })
}

/** T24. One review per completed stay — a second write for the same booking 409s. */
export async function createReview(hotelId: string, body: ApiCreateReview): Promise<ApiReview> {
  return apiFetch<ApiReview>(`/api/hotels/${encodeURIComponent(hotelId)}/reviews`, { method: 'POST', json: body })
}

/**
 * T24. Whether the caller may review this booking right now. A negative answer is data
 * (`canReview: false` + reason), not an error — the form branches on it.
 */
export async function fetchReviewable(bookingId: string): Promise<ApiReviewable> {
  return apiFetch<ApiReviewable>(`/api/bookings/${encodeURIComponent(bookingId)}/reviewable`)
}

/**
 * T20 + T28. Creates the PENDING booking — the hold that T26/T27 confirm. The money
 * snapshot is server-computed from the quote inputs; contact fields are validated but
 * not persisted. A signed-out caller 401s (the page sends them to login); nothing
 * answered (transport failure) is the only case with no booking at all.
 */
export interface CreateBookingRequest {
  roomId: string
  checkIn: string
  checkOut: string
  guests: number
  guestName: string
  guestEmail: string
  guestPhone: string
}

export async function createBooking(request: CreateBookingRequest): Promise<ApiBooking> {
  return apiFetch<ApiBooking>('/api/bookings', { method: 'POST', body: { ...request } })
}

/**
 * T26 + T28. Mints (or replays, idempotently) the PaymentIntent for a PENDING booking.
 * The amount answers in the payload — the page never prices anything itself.
 */
export async function createPaymentIntent(bookingId: string): Promise<ApiIntentData> {
  return apiFetch<ApiIntentData>('/api/payments/intent', { method: 'POST', body: { bookingId } })
}

/** T26 + T28. The payment row, if an intent exists. 404 before the first intent. */
export async function fetchPayment(bookingId: string): Promise<ApiPayment> {
  return apiFetch<ApiPayment>(`/api/payments/${encodeURIComponent(bookingId)}`)
}

/**
 * T25. The moderation console reads. Every one is admin-only: a host gets 403
 * `ADMIN_REQUIRED`, which pages treat as a real error (never fixtures — fixtures must
 * not stand in for access control).
 */
export async function fetchAdminStats(): Promise<ApiAdminStats> {
  return apiFetch<ApiAdminStats>('/api/admin/stats')
}

export async function fetchAdminListings(status?: string): Promise<ApiAdminHotel[]> {
  return apiFetch<{ items: ApiAdminHotel[] }>('/api/admin/listings', {
    query: status && status !== 'ALL' ? { status } : {},
  }).then(page => page.items)
}

export async function setAdminListingStatus(id: string, status: ApiAdminHotelStatus): Promise<ApiAdminHotel> {
  return apiFetch<ApiAdminHotel>(`/api/admin/listings/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    json: { status },
  })
}

export async function fetchAdminUsers(): Promise<ApiAdminUser[]> {
  return apiFetch<{ items: ApiAdminUser[] }>('/api/admin/users').then(page => page.items)
}

export async function setAdminUserStatus(id: string, status: ApiAdminUserStatus): Promise<ApiAdminUser> {
  return apiFetch<ApiAdminUser>(`/api/admin/users/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    json: { status },
  })
}

export async function fetchAdminReviews(): Promise<ApiAdminReview[]> {
  return apiFetch<{ items: ApiAdminReview[] }>('/api/admin/reviews').then(page => page.items)
}

export async function setAdminReviewStatus(id: string, status: ApiAdminReviewStatus): Promise<ApiAdminReview> {
  return apiFetch<ApiAdminReview>(`/api/admin/reviews/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    json: { status },
  })
}

/**
 * T21. `POST /api/uploads/sign` — the folder-scoped upload config. Only the API secret
 * stays server-side; the `apiKey` and `signature` are handed to the browser on purpose.
 *
 * This is the one call in the upload flow that goes through `apiFetch`. The Cloudinary
 * POST that follows is a third-party host, so it uses a raw `XMLHttpRequest` in
 * `usePhotoUploads` instead — see the comment there.
 */
export async function fetchUploadSign(): Promise<ApiUploadSign> {
  return apiFetch<ApiUploadSign>('/api/uploads/sign', { method: 'POST' })
}

/**
 * T21. `POST /api/uploads/attach` — persists the `hotel_images` row for an asset that
 * already uploaded to Cloudinary. T22 calls this: the wizard has no `hotelId` until it
 * creates the listing, so T21 stages the Cloudinary result instead of calling this.
 *
 * A `publicId` outside the caller's `booking/hotels/{hostId}/` folder is 403
 * `UPLOAD_FOREIGN`; a `(hotelId, url)` pair already attached is 409.
 */
export async function attachUpload(request: ApiAttachUpload):
Promise<ApiHotelImage> {
  return apiFetch<ApiHotelImage>('/api/uploads/attach', { method: 'POST', body: { ...request } })
}

/**
 * T21. `DELETE /api/uploads/:publicId` — destroys the asset and removes its row.
 *
 * The `publicId` is a Cloudinary path full of slashes (`booking/hotels/{hostId}/lobby`),
 * so it has to travel as one `%2F`-encoded segment. Interpolating it raw would make
 * `/api/uploads/` match with an empty param and the path segments route as separate
 * ones — a 404 that reads like a missing asset. `encodeURIComponent` is what a real HTTP
 * client does, and Express decodes it back before the handler sees it.
 */
export async function deleteUpload(publicId: string): Promise<void> {
  await apiFetch<undefined>(`/api/uploads/${encodeURIComponent(publicId)}`, { method: 'DELETE' })
}

/**
 * T35. `POST /api/threads` — open (or reuse) the conversation about a booking.
 * The body carries a `bookingId` only; the parties resolve server-side.
 */
export async function createThread(request: ApiCreateThread): Promise<ApiThread> {
  return apiFetch<ApiThread>('/api/threads', { method: 'POST', body: { ...request } })
}

/** T35. `GET /api/threads` — the caller''s conversations, newest first. */
export async function fetchThreads(): Promise<ApiThreadListData> {
  return apiFetch<ApiThreadListData>('/api/threads')
}

/** T35. `GET /api/threads/:id/messages` — one page, oldest first. */
export async function fetchThreadMessages(threadId: string, before?: string): Promise<ApiThreadMessageListData> {
  const query = before ? `?before=${encodeURIComponent(before)}` : ''
  return apiFetch<ApiThreadMessageListData>(`/api/threads/${encodeURIComponent(threadId)}/messages${query}`)
}

/** T35. `POST /api/threads/:id/messages` — append and bump the peer''s counter. */
export async function sendThreadMessage(threadId: string, body: ApiSendMessage): Promise<ApiThreadMessage> {
  return apiFetch<ApiThreadMessage>(`/api/threads/${encodeURIComponent(threadId)}/messages`, { method: 'POST', body: { ...body } })
}

/** T35. `POST /api/threads/:id/read` — clear only the reader''s counter. */
export async function markThreadRead(threadId: string): Promise<void> {
  await apiFetch<unknown>(`/api/threads/${encodeURIComponent(threadId)}/read`, { method: 'POST' })
}
