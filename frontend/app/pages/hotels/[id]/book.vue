<script setup lang="ts">
/**
 * /hotels/[id]/book — the transactional surface. Deliberately denser and
 * calmer than the detail page: a 7/5 grid of form and sticky order summary,
 * square corners, hairlines, tabular figures, no imagery beyond thumbnails.
 *
 * Nights are the half-open range (checkout excluded) and every figure in the order
 * summary is priced by `POST /api/bookings/quote` — this page computes no total, because
 * the server decides availability and the rate before it hands back cents (D3). No card
 * fields yet — the Stripe Elements step is T28; this ticket ends at confirm.
 */
import { getHotelDetail, nightsBetween } from '~/utils/mock'
import { fetchHotelDetail, fetchQuote, isApiError, isEnvelopeError } from '~/utils/api'
import type { ApiHotelDetail, ApiHotelRoom, ApiQuoteData, QuoteRequest } from '~/utils/api'
import { mockHotelToDetail, mockQuoteToApi } from '~/utils/hotelAdapters'
import { formatStayDate, payableCents, wholeNumber } from '~/utils/format'
import { localToday } from '~/utils/date'
import { guestDetailsSchema } from '~/utils/validation'
import type { FieldErrors } from '~/utils/validation'

const route = useRoute()
const { t } = useI18n()

const slug = computed(() => String(route.params.id ?? ''))

/**
 * Real detail endpoint first, degrading to the fixtures only when nothing answered —
 * the same seam as /hotels and /hotels/[id]. `HOTEL_NOT_FOUND` and an unknown mock slug
 * both render the not-found state; any other API error is rethrown.
 */
const { data: hotel } = await useAsyncData<ApiHotelDetail | null>(
  () => `hotel-book:${slug.value}`,
  async (): Promise<ApiHotelDetail | null> => {
    const id = String(route.params.id ?? '')
    try {
      return await fetchHotelDetail(id)
    }
    catch (fetchError: unknown) {
      if (isApiError(fetchError) && fetchError.code === 'HOTEL_NOT_FOUND') return null
      if (isEnvelopeError(fetchError)) throw fetchError
      const mock = getHotelDetail(id)
      return mock ? mockHotelToDetail(mock) : null
    }
  },
)

if (!hotel.value) {
  setResponseStatus(404, 'Hotel not found')
}

const today = localToday()

const queryRoom = typeof route.query.room === 'string' ? route.query.room : ''
const checkIn = ref('')
const checkOut = ref('')
const guests = ref(2)
const roomId = ref(queryRoom)
const guestName = ref('')
const guestEmail = ref('')
const guestPhone = ref('')

const touched = ref({ dates: false, room: false, name: false, email: false, phone: false })
const fieldErrors = ref<FieldErrors>({})
const confirming = ref(false)
const confirmedRef = ref('')
const confirmTimer = ref<ReturnType<typeof setTimeout> | null>(null)

onUnmounted(() => {
  if (confirmTimer.value) clearTimeout(confirmTimer.value)
})

const rooms = computed(() => hotel.value?.rooms ?? [])
const selectedRoom = computed(() => rooms.value.find(room => room.id === roomId.value))

const checkInPast = computed(() => Boolean(checkIn.value) && checkIn.value < today)
const rangeInvalid = computed(() => Boolean(checkIn.value && checkOut.value) && checkOut.value <= checkIn.value)

const datesError = computed(() => {
  if (checkInPast.value) return t('booking.checkInPast')
  if (rangeInvalid.value) return t('booking.rangeInvalid')
  return ''
})

/**
 * Read before the request goes out: the API rejects a party larger than the room sleeps
 * with a 400, and a message on the stepper beats a round trip to be told the same thing.
 */
const guestsError = computed(() =>
  selectedRoom.value && guests.value > selectedRoom.value.maxGuests
    ? t('booking.guestsOverRoom', { count: wholeNumber(selectedRoom.value.maxGuests) })
    : '',
)

/**
 * The quote's inputs. `null` until they are all present and usable, and the handler below
 * makes no request for a `null` — the panel shows its empty state instead.
 *
 * `currency` is the property's own quoted currency from the detail payload, not a constant
 * here: the site must not ask for a currency it has not already shown prices in.
 */
const quoteRequest = computed<QuoteRequest | null>(() => {
  const room = selectedRoom.value
  const property = hotel.value
  if (!room || !property) return null
  if (!checkIn.value || !checkOut.value) return null
  if (checkInPast.value || checkOut.value <= checkIn.value) return null
  if (guestsError.value) return null
  return {
    roomId: room.id,
    checkIn: checkIn.value,
    checkOut: checkOut.value,
    guests: guests.value,
    currency: property.currency,
  }
})

/** What the panel renders for the current request: nothing, a quote, or a verdict. */
type QuoteState
  = | { kind: 'idle' }
    | { kind: 'quoted', quote: ApiQuoteData }
    | { kind: 'unavailable' }
    | { kind: 'no-price' }

/**
 * The key carries the property and every input the quote depends on, so changing the room
 * or the dates cannot leave the previous stay's figures on screen — and two properties in
 * the same session cannot share one cache entry (context/ui-rules.md).
 */
const {
  data: quoteState,
  status: quoteStatus,
  error: quoteError,
  refresh: requote,
} = await useAsyncData<QuoteState>(
  () => `quote:${slug.value}:${roomId.value}:${checkIn.value}:${checkOut.value}:${guests.value}`,
  async (): Promise<QuoteState> => {
    const request = quoteRequest.value
    if (!request) return { kind: 'idle' }
    try {
      return { kind: 'quoted', quote: await fetchQuote(request) }
    }
    catch (quoteFailure: unknown) {
      // Branch on the code, never on the message (context/code-standards.md). Both of
      // these are answers, not failures, so they render as states instead of an error.
      if (isApiError(quoteFailure)) {
        if (quoteFailure.code === 'ROOM_UNAVAILABLE') return { kind: 'unavailable' }
        if (quoteFailure.code === 'PRICE_UNAVAILABLE') return { kind: 'no-price' }
      }
      if (isEnvelopeError(quoteFailure)) throw quoteFailure
      // Nothing is listening, which means nothing priced this stay either. The fixture
      // stands in, as on the list and detail pages — but only when the room on screen is
      // itself a fixture, so a live property never shows invented figures.
      const mock = getHotelDetail(slug.value)
      const fixture = mock?.rooms.find(room => room.id === request.roomId)
      const quoted = fixture ? mockQuoteToApi(fixture, request.checkIn, request.checkOut) : null
      if (!quoted) throw quoteFailure
      return { kind: 'quoted', quote: quoted }
    }
  },
)

const quote = computed(() => (quoteState.value?.kind === 'quoted' ? quoteState.value.quote : null))
const isRoomUnavailable = computed(() => quoteState.value?.kind === 'unavailable')
const isPriceUnavailable = computed(() => quoteState.value?.kind === 'no-price')
const hasQuoteFailed = computed(() => quoteStatus.value === 'error')
/** Only a cold request shows the skeleton; a cached quote renders straight away. */
const isQuoting = computed(() => quoteStatus.value === 'pending' && !quote.value)

/**
 * The nightly figure, from the quote's own per-night list. Null when the response carried
 * no breakdown — an unavailable rate, which must not read as $0 (D45).
 */
const nightlyCents = computed(() => quote.value?.breakdown[0]?.priceCents ?? null)

/** A room's advertised rate, for the selector. No price row is "—", never $0 (D45). */
function roomRate(room: ApiHotelRoom): string {
  return room.price === null ? '—' : payableCents(room.price.amountCents, room.price.currency)
}

const nights = computed(() =>
  checkIn.value && checkOut.value ? nightsBetween(checkIn.value, checkOut.value) : 0,
)

const roomFits = computed(() => (maxGuests: number) => maxGuests >= guests.value)

const guestsLabel = computed(() =>
  guests.value === 1 ? t('search.guestsOne') : t('search.guestsMany', { count: guests.value }),
)

function touch(field: keyof typeof touched.value): void {
  touched.value[field] = true
}

function confirm(): void {
  if (!hotel.value || confirming.value || confirmedRef.value) return
  touched.value = { dates: true, room: true, name: true, email: true, phone: true }

  const guest = guestDetailsSchema.safeParse({
    name: guestName.value,
    email: guestEmail.value,
    phone: guestPhone.value,
  })
  fieldErrors.value = { ...guest.errors }
  if (!checkIn.value || !checkOut.value || datesError.value) return
  if (!selectedRoom.value) return
  if (guestsError.value) return
  if (!guest.success) return
  if (!quote.value) return

  confirming.value = true
  confirmTimer.value = setTimeout(() => {
    confirming.value = false
    confirmedRef.value = `HB-${Math.floor(1000 + Math.random() * 9000)}`
  }, 900)
}

useSeoMeta({
  title: () => (hotel.value ? `${t('booking.title')} · ${hotel.value.name} · ${t('common.brand')}` : t('detail.notFoundTitle')),
  description: () => t('booking.metaDescription'),
  robots: 'noindex, nofollow',
})
</script>

<template>
  <div class="mx-auto max-w-[1280px] px-6 py-10 lg:py-14">
    <template v-if="hotel">
      <nav
        class="text-fg-muted text-sm"
        :aria-label="$t('booking.breadcrumb')"
      >
        <NuxtLink
          to="/"
          class="hover:text-fg"
        >
          {{ $t('nav.stays') }}
        </NuxtLink>
        <span aria-hidden="true"> / </span>
        <NuxtLink
          :to="`/hotels/${hotel.slug}`"
          class="hover:text-fg"
        >
          {{ hotel.name }}
        </NuxtLink>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">{{ $t('booking.title') }}</span>
      </nav>

      <h1 class="font-display mt-4 text-display-l">
        {{ $t('booking.title') }}
      </h1>
      <p class="prose-70 text-fg-muted mt-2">
        {{ $t('booking.subtitle', { name: hotel.name }) }}
      </p>

      <!-- Confirmation replaces the form. The reference is named, the input kept. -->
      <BaseAlert
        v-if="confirmedRef"
        tone="success"
        :title="$t('booking.confirmedTitle')"
        class="mt-8 max-w-[720px]"
      >
        <p>
          {{ $t('booking.confirmedBody', { reference: confirmedRef, name: hotel.name }) }}
        </p>
        <p class="mt-3 flex flex-wrap gap-3">
          <NuxtLink
            to="/bookings"
            class="text-link underline-offset-4 hover:underline"
          >
            {{ $t('booking.viewTrips') }}
          </NuxtLink>
          <NuxtLink
            :to="`/hotels/${hotel.slug}`"
            class="text-link underline-offset-4 hover:underline"
          >
            {{ $t('booking.backToHotel') }}
          </NuxtLink>
        </p>
      </BaseAlert>

      <div
        v-else
        class="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-12"
      >
        <!-- Form: 7 columns. -->
        <form
          class="flex flex-col gap-10 lg:col-span-7"
          novalidate
          @submit.prevent="confirm"
        >
          <section aria-labelledby="book-stay">
            <h2
              id="book-stay"
              class="text-fg-muted text-label uppercase"
            >
              {{ $t('booking.stayHeading') }}
            </h2>
            <div class="border-rule mt-3 border-t pt-6">
              <fieldset>
                <legend class="text-fg-muted text-label uppercase">
                  {{ $t('booking.roomHeading') }}
                </legend>
                <ul class="mt-3 flex flex-col gap-3">
                  <li
                    v-for="room in rooms"
                    :key="room.id"
                  >
                    <label
                      class="border-rule bg-surface flex cursor-pointer items-start gap-3 rounded-sm border p-4 transition-colors duration-150"
                      :class="[
                        roomId === room.id ? 'border-fg' : 'hover:border-fg',
                        roomFits(room.maxGuests) ? '' : 'opacity-60',
                      ]"
                    >
                      <input
                        v-model="roomId"
                        type="radio"
                        name="book-room"
                        :value="room.id"
                        :disabled="!roomFits(room.maxGuests)"
                        class="accent-accent mt-1 h-4 w-4 shrink-0"
                        @change="touch('room')"
                      >
                      <span class="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <span>
                          <span class="block text-sm font-medium">{{ room.name }}</span>
                          <span class="text-fg-muted block text-sm">
                            {{ $t('hotel.sleeps', { count: wholeNumber(room.maxGuests) }) }}
                            {{ roomFits(room.maxGuests) ? '' : `· ${$t('booking.roomTooSmall')}` }}
                          </span>
                        </span>
                        <span class="flex items-baseline gap-1.5">
                          <span class="tabular text-price">{{ roomRate(room) }}</span>
                          <span class="text-fg-subtle text-sm">{{ $t('hotel.perNight') }}</span>
                        </span>
                      </span>
                    </label>
                  </li>
                </ul>
                <p
                  v-if="touched.room && !selectedRoom"
                  role="alert"
                  class="text-danger mt-2 text-sm"
                >
                  {{ $t('booking.roomRequired') }}
                </p>
              </fieldset>

              <div class="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <BaseInput
                  id="book-check-in"
                  v-model="checkIn"
                  type="date"
                  :label="$t('hotels.checkIn')"
                  :min="today"
                  :error="touched.dates && checkInPast ? datesError : ''"
                  @blur="touch('dates')"
                />
                <BaseInput
                  id="book-check-out"
                  v-model="checkOut"
                  type="date"
                  :label="$t('hotels.checkOut')"
                  :min="checkIn || today"
                  :disabled="!checkIn"
                  :error="touched.dates && !checkInPast && rangeInvalid ? datesError : ''"
                  @blur="touch('dates')"
                />
              </div>
              <p
                v-if="checkIn && checkOut && !datesError && nights > 0"
                class="tabular text-fg-muted mt-3 text-sm"
                aria-live="polite"
              >
                {{
                  $t('booking.nightsLine', {
                    count: wholeNumber(nights),
                    checkIn: formatStayDate(checkIn),
                    checkOut: formatStayDate(checkOut),
                  })
                }}
              </p>

              <div class="mt-6 max-w-[320px]">
                <GuestsStepper
                  v-model="guests"
                  :label="$t('hotels.guests')"
                  :value-label="guestsLabel"
                  :decrease-label="$t('hotels.guestsDecrease')"
                  :increase-label="$t('hotels.guestsIncrease')"
                  :error="guestsError"
                />
              </div>
            </div>
          </section>

          <section aria-labelledby="book-guest">
            <h2
              id="book-guest"
              class="text-fg-muted text-label uppercase"
            >
              {{ $t('booking.guestHeading') }}
            </h2>
            <div class="border-rule mt-3 grid grid-cols-1 gap-4 border-t pt-6 sm:grid-cols-2">
              <BaseInput
                id="book-name"
                v-model="guestName"
                type="text"
                :label="$t('booking.guestName')"
                autocomplete="name"
                :error="touched.name && fieldErrors.name ? $t(fieldErrors.name) : ''"
                @blur="touch('name')"
              />
              <BaseInput
                id="book-email"
                v-model="guestEmail"
                type="email"
                :label="$t('booking.guestEmail')"
                autocomplete="email"
                :error="touched.email && fieldErrors.email ? $t(fieldErrors.email) : ''"
                @blur="touch('email')"
              />
              <BaseInput
                id="book-phone"
                v-model="guestPhone"
                type="tel"
                :label="$t('booking.guestPhone')"
                autocomplete="tel"
                :error="touched.phone && fieldErrors.phone ? $t(fieldErrors.phone) : ''"
                @blur="touch('phone')"
              />
            </div>
          </section>

          <div>
            <BaseButton
              type="submit"
              variant="primary"
              size="lg"
              class="w-full sm:w-auto"
              :loading="confirming"
              :disabled="confirming"
            >
              {{ confirming ? $t('booking.confirming') : $t('booking.confirm') }}
            </BaseButton>
            <p
              v-if="datesError && touched.dates"
              role="alert"
              class="text-danger mt-3 text-sm"
            >
              {{ datesError }}
            </p>
          </div>
        </form>

        <!-- Order summary: 5 columns, sticky. -->
        <aside class="lg:col-span-5">
          <div class="border-rule bg-surface rounded-none border p-6 lg:sticky lg:top-6">
            <h2 class="text-fg-muted text-label uppercase">
              {{ $t('booking.summaryHeading') }}
            </h2>
            <div class="mt-4 flex items-center gap-4">
              <img
                v-if="hotel.images[0]"
                :src="hotel.images[0].url"
                :alt="hotel.images[0].altText ?? hotel.name"
                width="160"
                height="120"
                loading="lazy"
                decoding="async"
                class="aspect-[4/3] h-20 w-20 shrink-0 object-cover"
              >
              <div class="min-w-0">
                <p class="font-display truncate text-lg">
                  {{ hotel.name }}
                </p>
                <p class="text-fg-muted text-label uppercase">
                  {{ hotel.city }}, {{ hotel.country }}
                </p>
                <p
                  v-if="selectedRoom"
                  class="text-fg-muted mt-1 truncate text-sm"
                >
                  {{ selectedRoom.name }}
                </p>
              </div>
            </div>

            <!--
              Four states, in the order they can occur. The failure alert is first because
              `status` is authoritative and stays 'error' until a retry or a new request;
              a stale quote under an error would be the wrong thing to show.
            -->
            <div
              class="mt-4"
              :aria-busy="isQuoting"
            >
              <BaseAlert
                v-if="hasQuoteFailed"
                tone="danger"
                :title="$t('booking.quoteErrorTitle')"
              >
                <p>{{ $t('booking.quoteErrorHint') }}</p>
                <p
                  v-if="quoteError"
                  class="font-mono text-xs"
                >
                  {{ quoteError.message }}
                </p>
                <button
                  type="button"
                  class="border-danger text-danger mt-2 inline-flex h-11 items-center rounded-sm border px-4 text-sm"
                  @click="requote()"
                >
                  {{ $t('common.retry') }}
                </button>
              </BaseAlert>

              <!-- Static blocks, no shimmer: a skeleton that animates is motion the
                   design language rules out, and this panel is not the only motion on
                   a payment path. -->
              <BaseSkeleton
                v-else-if="isQuoting"
                :rows="4"
              />

              <OrderSummary
                v-else-if="quote"
                :nightly-cents="nightlyCents"
                :nights="quote.nights"
                :subtotal-cents="quote.subtotalCents"
                :fees-cents="quote.feesCents"
                :total-cents="quote.totalCents"
                :currency="quote.currency"
              />

              <BaseAlert
                v-else-if="isRoomUnavailable"
                tone="warning"
                :title="$t('booking.quoteUnavailableTitle')"
              >
                {{ $t('booking.quoteUnavailableBody') }}
              </BaseAlert>

              <BaseAlert
                v-else-if="isPriceUnavailable"
                tone="info"
                :title="$t('booking.quotePriceUnavailableTitle')"
              >
                {{ $t('booking.quotePriceUnavailableBody', { currency: hotel.currency }) }}
              </BaseAlert>

              <p
                v-else
                class="text-fg-subtle border-rule border-t pt-4 text-sm"
                aria-live="polite"
              >
                {{ $t('booking.summaryEmpty') }}
              </p>
            </div>

            <p class="text-fg-muted border-rule mt-4 border-t pt-4 text-sm">
              {{ $t('detail.cancellation') }}
            </p>
          </div>
        </aside>
      </div>
    </template>

    <div v-else>
      <h1 class="font-display mt-4 text-display-l">
        {{ $t('detail.notFoundTitle') }}
      </h1>
      <p class="prose-70 text-fg-muted mt-4">
        {{ $t('detail.notFoundBody') }}
      </p>
      <BaseButton
        to="/hotels"
        variant="primary"
        size="lg"
        class="mt-8"
      >
        {{ $t('detail.browseStays') }}
      </BaseButton>
    </div>
  </div>
</template>
