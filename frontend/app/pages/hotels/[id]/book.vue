<script setup lang="ts">
/**
 * /hotels/[id]/book — the transactional surface. Deliberately denser and
 * calmer than the detail page: a 7/5 grid of form and sticky order summary,
 * square corners, hairlines, tabular figures, no imagery beyond thumbnails.
 *
 * Nights are the half-open range (`nightsBetween`, checkout excluded) and the
 * total is the mock's flat-10% `quote()`, recomputed on every change. No card
 * fields yet — the Stripe Elements step is T28; this ticket ends at confirm.
 */
import { getHotelDetail, nightsBetween, quote } from '~/utils/mock'
import { formatStayDate, usdCents, wholeNumber } from '~/utils/format'
import { localToday } from '~/utils/date'
import { guestDetailsSchema } from '~/utils/validation'
import type { FieldErrors } from '~/utils/validation'

const route = useRoute()
const { t } = useI18n()

const slug = computed(() => String(route.params.id ?? ''))

const { data: hotel } = await useAsyncData(
  `hotel-book:${slug.value}`,
  async () => getHotelDetail(slug.value),
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

const nights = computed(() =>
  checkIn.value && checkOut.value ? nightsBetween(checkIn.value, checkOut.value) : 0,
)

const breakdown = computed(() => {
  if (!selectedRoom.value || nights.value < 1) return null
  return quote(selectedRoom.value, checkIn.value, checkOut.value)
})

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
  if (!guest.success) return
  if (!breakdown.value) return

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
                          <span class="tabular text-price">{{ usdCents(room.pricePerNightCents) }}</span>
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
                :alt="hotel.images[0].alt"
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

            <div class="mt-4">
              <OrderSummary
                v-if="breakdown"
                :nightly-cents="breakdown.nightlyCents"
                :nights="breakdown.nights"
                :subtotal-cents="breakdown.subtotalCents"
                :fees-cents="breakdown.feesCents"
                :total-cents="breakdown.totalCents"
              />
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
