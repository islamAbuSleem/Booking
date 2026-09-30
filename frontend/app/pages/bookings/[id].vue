<script setup lang="ts">
/**
 * /bookings/[id] — one trip. Property snapshot, stay facts, the stored price
 * breakdown, and cancel behind a confirm modal that names the reference.
 * Cancel is a local state change on the shared mock store.
 */
import { HOTEL_BY_ID } from '~/utils/mock'
import { formatStayDate, wholeNumber } from '~/utils/format'

const route = useRoute()
const { t } = useI18n()
const { bookingById, cancelBooking } = useBookings()

const id = computed(() => String(route.params.id ?? ''))
const booking = computed(() => bookingById(id.value))
const hotel = computed(() => (booking.value ? HOTEL_BY_ID.get(booking.value.hotelId) : undefined))

const cancelOpen = ref(false)
const cancelled = ref(false)

const cancellable = computed(
  () => booking.value && (booking.value.status === 'PENDING' || booking.value.status === 'CONFIRMED'),
)

/** The nightly rate is not stored on the mock booking; it divides out exactly. */
const nightlyCents = computed(() =>
  booking.value && booking.value.nights > 0
    ? Math.round(booking.value.subtotalCents / booking.value.nights)
    : 0,
)

function confirmCancel(): void {
  if (!booking.value) return
  cancelled.value = cancelBooking(booking.value.id)
  cancelOpen.value = false
}

useSeoMeta({
  title: () => (booking.value ? `${booking.value.reference} · ${t('bookings.title')} · ${t('common.brand')}` : t('bookings.notFoundTitle')),
  description: () => t('bookings.metaDescription'),
  robots: 'noindex, nofollow',
})
</script>

<template>
  <div class="mx-auto max-w-[1280px] px-6 py-10 lg:py-14">
    <template v-if="booking">
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

      <div class="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-12">
        <div class="flex flex-col gap-8 lg:col-span-7">
          <!-- Property snapshot. -->
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
                v-if="hotel?.images[0]"
                :src="hotel.images[0].url"
                :alt="hotel.images[0].alt"
                width="320"
                height="240"
                loading="lazy"
                decoding="async"
                class="aspect-[4/3] w-32 shrink-0 object-cover"
              >
              <div class="min-w-0">
                <p class="font-display text-display-m">
                  {{ hotel?.name ?? booking.hotelId }}
                </p>
                <p
                  v-if="hotel"
                  class="text-fg-muted text-label mt-1 uppercase"
                >
                  {{ hotel.city }}, {{ hotel.country }}
                </p>
                <p
                  v-if="hotel"
                  class="text-fg-muted mt-2 text-sm"
                >
                  {{ hotel.addressLine }}
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
            <p class="text-fg-muted mt-4 text-sm">
              {{ $t('bookings.guestLine', { name: booking.guestName }) }}
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
            class="bg-danger text-surface hover:bg-danger flex h-12 items-center justify-center rounded-sm px-6 text-sm font-medium transition-colors duration-150"
            @click="confirmCancel"
          >
            {{ $t('bookings.cancelConfirm', { reference: booking.reference }) }}
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
