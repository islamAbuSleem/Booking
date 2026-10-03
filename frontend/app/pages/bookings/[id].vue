<script setup lang="ts">
/**
 * /bookings/[id] — one trip. Property snapshot, stay facts, the stored price
 * breakdown, and cancel behind a confirm modal that names the reference.
 *
 * T20: the API is primary; a 401 (sign-in is T23) or a transport failure
 * degrades to the fixture store, and a 404/403 is an *answer* — a trip that
 * is not yours reads as one you cannot see, rendered as the not-found state.
 * Cancel goes through the real endpoint and degrades to the local store the
 * same way the read does.
 */
import { cancelBooking, createReview, fetchBooking, fetchReviewable, isApiError, isApiFailure } from '~/utils/api'
import type { ApiBooking } from '~/utils/api'
import { bookingCoverImage, mockBookingToApi } from '~/utils/bookingAdapters'
import { useBookings } from '~/composables/useBookings'
import { formatStayDate, wholeNumber } from '~/utils/format'

const route = useRoute()
const { t } = useI18n()
const { bookingById, cancelBooking: mockCancelBooking } = useBookings()

const id = computed(() => String(route.params.id ?? ''))

interface BookingDetailPayload {
  booking: ApiBooking | null
  /**
   * Mock-only: the API's booking carries no guest field, and a trip detail is
   * always the owner's own trip — printing your own name on it is redundant.
   * The fixture world keeps the line, the live one drops it.
   */
  guestName: string | null
  /** False in fixture fallback — the review form below only renders for live bookings. */
  live: boolean
}

/**
 * The key carries the route param, so a swap from one trip to another re-fetches
 * instead of showing the previous booking (context/ui-rules.md).
 */
const {
  data: payload,
  status,
  error,
  refresh,
} = await useAsyncData<BookingDetailPayload>(
  () => `booking:${id.value}`,
  async (): Promise<BookingDetailPayload> => {
    const bookingId = String(route.params.id ?? '')
    try {
      const booking = await fetchBooking(bookingId)
      return { booking, guestName: null, live: true }
    }
    catch (fetchError: unknown) {
      // 404 and 403 are answers, not failures: neither is papered over with a
      // fixture, and both read as "you cannot see this trip".
      if (isApiError(fetchError) && (fetchError.code === 'BOOKING_NOT_FOUND' || fetchError.code === 'NOT_BOOKING_OWNER')) {
        return { booking: null, guestName: null, live: false }
      }
      // 401 `UNAUTHORIZED` means no session at all, and with auth unwired that
      // is the everyday case — so it degrades to the fixtures, as a transport
      // failure does. Every other real envelope error drives the error state.
      if (isApiFailure(fetchError) && (!isApiError(fetchError) || fetchError.code !== 'UNAUTHORIZED')) {
        throw fetchError
      }
      const mock = bookingById(bookingId)
      if (!mock) return { booking: null, guestName: null, live: false }
      return { booking: mockBookingToApi(mock), guestName: mock.guestName, live: false }
    }
  },
)

const booking = computed(() => payload.value?.booking ?? null)
const guestName = computed(() => payload.value?.guestName ?? null)

/** A missing id or a 404/403 answer is a not-found, not an exception — say so in the status line. */
if (!booking.value && status.value !== 'error') {
  setResponseStatus(404, 'Booking not found')
}

/**
 * T24: the review gate. Asked only for a live COMPLETED booking — anything else cannot
 * be reviewable, so asking would be a wasted round trip. A negative answer is data, not
 * an error: the template branches on the reason. Gone, foreign, or unreachable since
 * the booking loaded all hide the form alike.
 */
const {
  data: reviewable,
  refresh: refreshReviewable,
} = await useAsyncData(
  () => `booking:${id.value}:reviewable`,
  async () => {
    const record = booking.value
    if (!payload.value?.live || !record || record.status !== 'COMPLETED') return null
    try {
      return await fetchReviewable(record.id)
    }
    catch {
      return null
    }
  },
)

const canReview = computed(() => reviewable.value?.canReview === true)
const reviewReason = computed(() => reviewable.value?.reason ?? null)

const rating = ref('5')
const reviewTitle = ref('')
const reviewBody = ref('')
const reviewBusy = ref(false)
const reviewError = ref('')
const reviewDone = ref(false)

const ratingOptions = computed(() => [5, 4, 3, 2, 1].map(score => ({ value: String(score), label: String(score) })))

/**
 * Writes the review, then stands down: the success banner replaces the form, so a
 * double submit cannot 409 against itself. Losing a race (or the stay changing under
 * the form) re-asks the gate instead of retrying a closed door — the reason note
 * below replaces the form, and the visitor's words stay in place either way.
 */
async function submitReview(): Promise<void> {
  const record = booking.value
  reviewError.value = ''
  if (!record || reviewBusy.value) return
  if (!reviewTitle.value.trim() || !reviewBody.value.trim()) {
    reviewError.value = t('reviews.fieldsRequired')
    return
  }
  reviewBusy.value = true
  try {
    await createReview(record.hotel.id, {
      bookingId: record.id,
      rating: Number(rating.value),
      title: reviewTitle.value.trim(),
      body: reviewBody.value.trim(),
    })
    reviewDone.value = true
  }
  catch (error: unknown) {
    if (isApiError(error) && (error.code === 'ALREADY_REVIEWED' || error.code === 'INVALID_REVIEW_STATE')) {
      await refreshReviewable()
      return
    }
    reviewError.value = isApiError(error) ? error.message : t('common.unexpectedError')
  }
  finally {
    reviewBusy.value = false
  }
}

/** Skeletons only on the cold request — a cached payload renders straight away. */
const isLoading = computed(() => status.value === 'pending' && !payload.value)
const hasFailed = computed(() => status.value === 'error')

/** The cover image from the hotel snapshot, rendered as a URL or omitted. */
const cover = computed(() => (booking.value ? bookingCoverImage(booking.value) : null))

/**
 * CONFIRMED only: the API guards the cancel the same way (409
 * `INVALID_CANCEL_STATE` for any other status), so the button shows only here,
 * in the live world and the fixture world alike.
 */
const cancellable = computed(() => booking.value?.status === 'CONFIRMED')

/**
 * Neither the API snapshot nor the fixture stores a per-night rate; with nights,
 * the figure divides out of the subtotal. A stay with no nights has no rate at
 * all — null renders as "—", never $0 (D45).
 */
const nightlyCents = computed<number | null>(() => {
  const record = booking.value
  if (!record || record.nights === 0) return null
  return Math.round(record.subtotalCents / record.nights)
})

const cancelOpen = ref(false)
const cancelBusy = ref(false)
const cancelled = ref(false)
const cancelFailed = ref(false)

/**
 * The real cancel first. On success the response *is* the new state, so the
 * page renders the flip from it. A real envelope error (409
 * `INVALID_CANCEL_STATE`, a 403, a 404) means the trip was not cancelled —
 * the claim is not made. Only when nothing answered does the fixture store
 * own the flip, and `UNAUTHORIZED` counts as nothing answered: it is exactly
 * what the read above degrades on, so the two can never disagree.
 */
async function requestCancel(): Promise<void> {
  const record = booking.value
  if (!record || cancelBusy.value) return
  cancelBusy.value = true
  cancelFailed.value = false
  try {
    const updated = await cancelBooking(record.id)
    // `apiFetch` hands back `undefined` for a body it could not read, so a 200 with
    // nothing usable in it is not a confirmed cancellation. Claiming it would show
    // the success alert beside a CONFIRMED badge and a live Cancel button.
    if (!updated || updated.status !== 'CANCELLED') {
      cancelFailed.value = true
      return
    }
    Object.assign(record, updated)
    cancelled.value = true
  }
  catch (cancelError: unknown) {
    const answered = isApiFailure(cancelError)
      && !(isApiError(cancelError) && cancelError.code === 'UNAUTHORIZED')
    if (answered) {
      cancelFailed.value = true
    }
    else if (mockCancelBooking(record.id)) {
      record.status = 'CANCELLED'
      cancelled.value = true
    }
    else {
      cancelFailed.value = true
    }
  }
  finally {
    cancelBusy.value = false
    cancelOpen.value = false
  }
}

useSeoMeta({
  title: () => (booking.value ? `${booking.value.reference} · ${t('bookings.title')} · ${t('common.brand')}` : t('bookings.notFoundTitle')),
  description: () => t('bookings.metaDescription'),
  robots: 'noindex, nofollow',
})
</script>

<template>
  <div class="mx-auto max-w-[1280px] px-6 py-10 lg:py-14">
    <!-- Loading: a static block, no shimmer. -->
    <div
      v-if="isLoading"
      class="border-rule bg-surface rounded-none border p-6"
    >
      <p
        class="sr-only"
        role="status"
      >
        {{ $t('bookings.loadingBooking') }}
      </p>
      <BaseSkeleton :rows="6" />
    </div>

    <!-- Error: a real answer that is not a 404/403. The retry is a retry, not a restart. -->
    <BaseAlert
      v-else-if="hasFailed"
      tone="danger"
      :title="$t('bookings.bookingLoadError')"
    >
      <p>{{ $t('bookings.loadErrorHint') }}</p>
      <p
        v-if="error"
        class="font-mono text-xs"
      >
        {{ error.message }}
      </p>
      <button
        type="button"
        class="border-danger text-danger mt-2 inline-flex h-11 items-center rounded-sm border px-4 text-sm"
        @click="refresh()"
      >
        {{ $t('common.retry') }}
      </button>
    </BaseAlert>

    <template v-else-if="booking">
      <nav
        class="text-fg-muted text-sm"
        :aria-label="$t('booking.breadcrumb')"
      >
        <NuxtLink
          to="/bookings"
          class="hover:text-fg"
        >
          {{ $t('bookings.title') }}
        </NuxtLink>
        <span aria-hidden="true"> / </span>
        <span
          aria-current="page"
          class="font-mono"
        >{{ booking.reference }}</span>
      </nav>

      <div class="mt-4 flex flex-wrap items-center gap-4">
        <h1 class="font-display text-display-l font-mono">
          {{ booking.reference }}
        </h1>
        <BookingStatusBadge :status="booking.status" />
      </div>

      <BaseAlert
        v-if="cancelled"
        tone="success"
        :title="$t('bookings.cancelledTitle')"
        class="mt-6 max-w-[720px]"
      >
        {{ $t('bookings.cancelledBody', { reference: booking.reference }) }}
      </BaseAlert>

      <BaseAlert
        v-else-if="cancelFailed"
        tone="danger"
        :title="$t('bookings.cancelErrorTitle')"
        class="mt-6 max-w-[720px]"
      >
        <p>{{ $t('bookings.cancelErrorBody', { reference: booking.reference }) }}</p>
        <button
          type="button"
          class="border-danger text-danger mt-2 inline-flex h-11 items-center rounded-sm border px-4 text-sm"
          @click="requestCancel()"
        >
          {{ $t('common.retry') }}
        </button>
      </BaseAlert>

      <div class="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-12">
        <div class="flex flex-col gap-8 lg:col-span-7">
          <!-- Property snapshot, from the booking's own hotel — no second fetch. -->
          <section
            aria-labelledby="booking-property"
            class="border-rule bg-surface rounded-none border p-6"
          >
            <h2
              id="booking-property"
              class="text-fg-muted text-label uppercase"
            >
              {{ $t('bookings.propertyHeading') }}
            </h2>
            <div class="mt-4 flex items-start gap-4">
              <img
                v-if="cover"
                :src="cover"
                :alt="booking.hotel.name"
                width="320"
                height="240"
                loading="lazy"
                decoding="async"
                class="aspect-[4/3] w-32 shrink-0 object-cover"
              >
              <div class="min-w-0">
                <p class="font-display text-display-m">
                  {{ booking.hotel.name }}
                </p>
                <p class="text-fg-muted text-label mt-1 uppercase">
                  {{ booking.hotel.city }}, {{ booking.hotel.country }}
                </p>
                <p class="text-fg-muted mt-2 text-sm">
                  {{ booking.hotel.addressLine }}
                </p>
              </div>
            </div>
          </section>

          <!-- Stay facts. -->
          <section
            aria-labelledby="booking-stay"
            class="border-rule bg-surface rounded-none border p-6"
          >
            <h2
              id="booking-stay"
              class="text-fg-muted text-label uppercase"
            >
              {{ $t('bookings.stayHeading') }}
            </h2>
            <dl class="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <dt class="text-fg-muted text-label uppercase">
                  {{ $t('bookings.colCheckIn') }}
                </dt>
                <dd class="tabular mt-1 text-sm">
                  {{ formatStayDate(booking.checkIn) }}
                </dd>
              </div>
              <div>
                <dt class="text-fg-muted text-label uppercase">
                  {{ $t('bookings.colCheckOut') }}
                </dt>
                <dd class="tabular mt-1 text-sm">
                  {{ formatStayDate(booking.checkOut) }}
                </dd>
              </div>
              <div>
                <dt class="text-fg-muted text-label uppercase">
                  {{ $t('bookings.colNights') }}
                </dt>
                <dd class="tabular mt-1 text-sm">
                  {{ wholeNumber(booking.nights) }}
                </dd>
              </div>
              <div>
                <dt class="text-fg-muted text-label uppercase">
                  {{ $t('bookings.colGuests') }}
                </dt>
                <dd class="tabular mt-1 text-sm">
                  {{ wholeNumber(booking.guestsCount) }}
                </dd>
              </div>
            </dl>
            <p
              v-if="guestName"
              class="text-fg-muted mt-4 text-sm"
            >
              {{ $t('bookings.guestLine', { name: guestName }) }}
            </p>
          </section>

          <div v-if="cancellable">
            <BaseButton
              variant="secondary"
              size="md"
              @click="cancelOpen = true"
            >
              {{ $t('bookings.cancelBooking') }}
            </BaseButton>
          </div>

          <!-- T24: the review form, once per completed stay. Fixtures are read-only. -->
          <section
            v-if="booking.status === 'COMPLETED'"
            aria-labelledby="booking-review"
            class="border-rule bg-surface rounded-none border p-6"
          >
            <h2
              id="booking-review"
              class="text-fg-muted text-label uppercase"
            >
              {{ $t('reviews.formTitle') }}
            </h2>

            <BaseAlert
              v-if="reviewDone"
              tone="success"
              :title="$t('reviews.successTitle')"
              class="mt-4"
            >
              {{ $t('reviews.successBody') }}
            </BaseAlert>

            <form
              v-else-if="canReview"
              class="mt-4 flex flex-col gap-4"
              novalidate
              @submit.prevent="submitReview"
            >
              <p class="text-fg-muted text-sm">
                {{ $t('reviews.formHint') }}
              </p>
              <div class="max-w-[200px]">
                <BaseSelect
                  id="review-rating"
                  v-model="rating"
                  :label="$t('reviews.ratingLabel')"
                  :options="ratingOptions"
                />
              </div>
              <BaseInput
                id="review-title"
                v-model="reviewTitle"
                type="text"
                :label="$t('reviews.titleLabel')"
              />
              <div class="flex flex-col gap-2">
                <label
                  for="review-body"
                  class="text-fg-muted text-label uppercase"
                >{{ $t('reviews.bodyLabel') }}</label>
                <textarea
                  id="review-body"
                  v-model="reviewBody"
                  rows="5"
                  class="text-fg placeholder:text-fg-subtle border-rule-strong bg-surface w-full rounded-sm border px-3 py-3 text-sm focus:border-fg focus:outline-none"
                />
              </div>
              <p
                v-if="reviewError"
                role="alert"
                class="text-danger text-sm"
              >
                {{ reviewError }}
              </p>
              <div>
                <BaseButton
                  type="submit"
                  variant="primary"
                  size="md"
                  :loading="reviewBusy"
                  :disabled="reviewBusy"
                >
                  {{ reviewBusy ? $t('reviews.submittingReview') : $t('reviews.submitReview') }}
                </BaseButton>
              </div>
            </form>

            <p
              v-else-if="reviewReason === 'ALREADY_REVIEWED'"
              class="text-fg-muted mt-4 text-sm"
            >
              {{ $t('reviews.alreadyReviewed') }}
            </p>
            <p
              v-else-if="reviewReason === 'NOT_COMPLETED'"
              class="text-fg-muted mt-4 text-sm"
            >
              {{ $t('reviews.notCompletedNote') }}
            </p>
          </section>
        </div>

        <!-- Price breakdown: 5 columns, sticky. -->
        <aside class="lg:col-span-5">
          <div class="border-rule bg-surface rounded-none border p-6 lg:sticky lg:top-6">
            <h2 class="text-fg-muted text-label uppercase">
              {{ $t('booking.summaryHeading') }}
            </h2>
            <div class="mt-4">
              <OrderSummary
                :nightly-cents="nightlyCents"
                :nights="booking.nights"
                :subtotal-cents="booking.subtotalCents"
                :fees-cents="booking.feesCents"
                :total-cents="booking.totalCents"
                :currency="booking.currency"
              />
            </div>
            <p class="text-fg-muted border-rule mt-4 border-t pt-4 text-sm">
              {{ $t('detail.cancellation') }}
            </p>
          </div>
        </aside>
      </div>

      <BaseModal
        v-model:open="cancelOpen"
        :title="$t('bookings.cancelTitle', { reference: booking.reference })"
      >
        <p class="text-fg-muted text-sm">
          {{ $t('bookings.cancelBody', { reference: booking.reference }) }}
        </p>
        <div class="mt-6 flex flex-wrap gap-3">
          <BaseButton
            variant="secondary"
            size="md"
            @click="cancelOpen = false"
          >
            {{ $t('common.back') }}
          </BaseButton>
          <button
            type="button"
            class="bg-danger text-surface hover:bg-danger flex h-12 items-center justify-center rounded-sm px-6 text-sm font-medium transition-colors duration-150 disabled:opacity-60"
            :disabled="cancelBusy"
            @click="requestCancel()"
          >
            {{ cancelBusy ? $t('bookings.cancelCancelling') : $t('bookings.cancelConfirm', { reference: booking.reference }) }}
          </button>
        </div>
      </BaseModal>
    </template>

    <div v-else>
      <h1 class="font-display mt-4 text-display-l">
        {{ $t('bookings.notFoundTitle') }}
      </h1>
      <p class="prose-70 text-fg-muted mt-4">
        {{ $t('bookings.notFoundBody') }}
      </p>
      <BaseButton
        to="/bookings"
        variant="primary"
        size="lg"
        class="mt-8"
      >
        {{ $t('bookings.title') }}
      </BaseButton>
    </div>
  </div>
</template>
