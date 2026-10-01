<script setup lang="ts">
/**
 * /bookings — the guest's trips. Calm and scannable: two status-driven tabs,
 * a data table on desktop (64px rows, tabular right-aligned totals) and
 * stacked label-above-value cards on mobile.
 *
 * T20: the API is the primary source. A 401 (sign-in is T23, so anonymous is
 * the everyday state) or a transport failure degrades to the fixtures; any
 * other envelope error is a real answer and drives the error state, never
 * a fixture.
 */
import { fetchMyBookings, isApiError, isApiFailure } from '~/utils/api'
import type { ApiBooking } from '~/utils/api'
import { mockBookingToApi } from '~/utils/bookingAdapters'
import { isUpcomingStatus, useBookings } from '~/composables/useBookings'
import { formatStayDate, payableCents, wholeNumber } from '~/utils/format'

const { t } = useI18n()

/**
 * The shared fixture store, not the immutable arrays in `~/utils/mock`: a cancel the
 * detail page's fallback performed has to be visible here, or navigating back shows
 * the old status.
 */
const { bookings: mockBookings } = useBookings()

type Tab = 'upcoming' | 'past'

const tab = ref<Tab>('upcoming')
const page = ref(1)
const PAGE_SIZE = 5

interface TripsPayload {
  bookings: ApiBooking[]
}

/**
 * `fetchMyBookings` first. 401 `UNAUTHORIZED` is not an error here — with no
 * sign-in wired yet, an anonymous visit is the normal case, and the fixtures
 * stand in for it exactly as they do when no backend answered. Every other
 * real envelope error is rethrown so the error state renders instead.
 */
const {
  data,
  status,
  error,
  refresh,
} = await useAsyncData<TripsPayload>(
  'bookings:trips',
  async (): Promise<TripsPayload> => {
    try {
      const list = await fetchMyBookings()
      return { bookings: list.items }
    }
    catch (fetchError: unknown) {
      if (isApiFailure(fetchError) && (!isApiError(fetchError) || fetchError.code !== 'UNAUTHORIZED')) {
        throw fetchError
      }
      return { bookings: mockBookings.value.map(mockBookingToApi) }
    }
  },
)

const bookings = computed(() => data.value?.bookings ?? [])

/** Tabs are driven by status, client-side over whatever answered: PENDING or
    CONFIRMED is occupying a room, so it is upcoming. */
const upcoming = computed(() => bookings.value.filter(booking => isUpcomingStatus(booking.status)))
const past = computed(() => bookings.value.filter(booking => !isUpcomingStatus(booking.status)))

const rows = computed(() => (tab.value === 'upcoming' ? upcoming.value : past.value))

const total = computed(() => rows.value.length)
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))

const visible = computed(() => {
  const current = Math.min(page.value, totalPages.value)
  return rows.value.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)
})

/** Skeletons only when there is nothing to show — never on a background refresh. */
const isLoading = computed(() => status.value === 'pending' && !data.value)
const hasFailed = computed(() => status.value === 'error')
/**
 * The current tab's rows, not the whole payload: a guest with only upcoming trips
 * who opens "Past (0)" must get the empty state, not an empty table and a
 * pagination that self-hides.
 */
const isEmpty = computed(() => !isLoading.value && !hasFailed.value && rows.value.length === 0)

function select(next: Tab): void {
  tab.value = next
  page.value = 1
}

useSeoMeta({
  title: () => `${t('bookings.title')} · ${t('common.brand')}`,
  description: () => t('bookings.metaDescription'),
  robots: 'noindex, nofollow',
})
</script>

<template>
  <div class="mx-auto max-w-[1280px] px-6 py-10 lg:py-14">
    <h1 class="font-display text-display-l">
      {{ $t('bookings.title') }}
    </h1>
    <div class="border-rule mt-4 border-b" />

    <div
      class="mt-6"
      :aria-busy="isLoading"
    >
      <!-- Loading. A static block, no shimmer. -->
      <div
        v-if="isLoading"
        class="border-rule bg-surface rounded-none border p-5"
      >
        <p
          class="sr-only"
          role="status"
        >
          {{ $t('bookings.loadingTrips') }}
        </p>
        <BaseSkeleton :rows="5" />
      </div>

      <!-- Error. The retry is a retry, not a restart. -->
      <BaseAlert
        v-else-if="hasFailed"
        tone="danger"
        :title="$t('bookings.loadError')"
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

      <template v-else>
        <div
          role="tablist"
          class="border-rule flex gap-8 border-b"
          :aria-label="$t('bookings.title')"
        >
          <button
            v-for="entry in (['upcoming', 'past'] as const)"
            :key="entry"
            type="button"
            role="tab"
            :aria-selected="tab === entry"
            class="text-label border-b-2 px-1 py-3 uppercase transition-colors duration-150"
            :class="tab === entry ? 'border-accent text-fg' : 'text-fg-muted hover:text-fg border-transparent'"
            @click="select(entry)"
          >
            {{
              entry === 'upcoming'
                ? $t('bookings.upcoming', { count: wholeNumber(upcoming.length) })
                : $t('bookings.past', { count: wholeNumber(past.length) })
            }}
          </button>
        </div>

        <BaseEmptyState
          v-if="isEmpty"
          :title="$t('bookings.emptyTitle')"
          :hint="$t('bookings.emptyHint')"
          class="mt-8"
        >
          <BaseButton
            to="/hotels"
            variant="primary"
            size="md"
          >
            {{ $t('detail.browseStays') }}
          </BaseButton>
        </BaseEmptyState>

        <template v-else>
          <!-- Desktop: data table. No vertical borders, hairline row rules only. -->
          <table class="mt-2 hidden w-full border-collapse md:table">
            <caption class="sr-only">
              {{ $t('bookings.title') }}
            </caption>
            <thead>
              <tr class="bg-surface-alt text-fg-muted text-left text-label uppercase">
                <th
                  scope="col"
                  class="px-4 py-3 font-medium"
                >
                  {{ $t('bookings.colBooking') }}
                </th>
                <th
                  scope="col"
                  class="px-4 py-3 font-medium"
                >
                  {{ $t('bookings.colHotel') }}
                </th>
                <th
                  scope="col"
                  class="px-4 py-3 font-medium"
                >
                  {{ $t('bookings.colCheckIn') }}
                </th>
                <th
                  scope="col"
                  class="px-4 py-3 font-medium"
                >
                  {{ $t('bookings.colCheckOut') }}
                </th>
                <th
                  scope="col"
                  class="px-4 py-3 text-right font-medium"
                >
                  {{ $t('bookings.colGuests') }}
                </th>
                <th
                  scope="col"
                  class="px-4 py-3 font-medium"
                >
                  {{ $t('bookings.colStatus') }}
                </th>
                <th
                  scope="col"
                  class="px-4 py-3 text-right font-medium"
                >
                  {{ $t('bookings.colTotal') }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="booking in visible"
                :key="booking.id"
                class="border-rule h-16 border-b"
              >
                <td class="px-4 py-2">
                  <NuxtLink
                    :to="`/bookings/${booking.id}`"
                    class="text-link font-mono text-sm underline-offset-4 hover:underline"
                  >
                    {{ booking.reference }}
                  </NuxtLink>
                </td>
                <td class="max-w-[240px] truncate px-4 py-2 font-display text-lg">
                  {{ booking.hotel.name }}
                </td>
                <td class="tabular px-4 py-2 text-sm">
                  {{ formatStayDate(booking.checkIn) }}
                </td>
                <td class="tabular px-4 py-2 text-sm">
                  {{ formatStayDate(booking.checkOut) }}
                </td>
                <td class="tabular px-4 py-2 text-right text-sm">
                  {{ wholeNumber(booking.guestsCount) }}
                </td>
                <td class="px-4 py-2">
                  <BookingStatusBadge :status="booking.status" />
                </td>
                <td class="tabular px-4 py-2 text-right text-sm font-medium">
                  {{ payableCents(booking.totalCents, booking.currency) }}
                </td>
              </tr>
            </tbody>
          </table>

          <!-- Mobile: one stacked card per booking. -->
          <ul class="flex flex-col md:hidden">
            <li
              v-for="booking in visible"
              :key="booking.id"
              class="border-rule border-b py-5"
            >
              <div class="flex flex-wrap items-center justify-between gap-3">
                <NuxtLink
                  :to="`/bookings/${booking.id}`"
                  class="text-link font-mono text-sm underline-offset-4 hover:underline"
                >
                  {{ booking.reference }}
                </NuxtLink>
                <BookingStatusBadge :status="booking.status" />
              </div>
              <p class="font-display mt-2 text-xl">
                {{ booking.hotel.name }}
              </p>
              <dl class="mt-3 grid grid-cols-2 gap-3">
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
                    {{ $t('bookings.colGuests') }}
                  </dt>
                  <dd class="tabular mt-1 text-sm">
                    {{ wholeNumber(booking.guestsCount) }}
                  </dd>
                </div>
                <div>
                  <dt class="text-fg-muted text-label uppercase">
                    {{ $t('bookings.colTotal') }}
                  </dt>
                  <dd class="tabular mt-1 text-sm font-medium">
                    {{ payableCents(booking.totalCents, booking.currency) }}
                  </dd>
                </div>
              </dl>
            </li>
          </ul>

          <div class="mt-8 flex justify-center">
            <BasePagination
              :page="Math.min(page, totalPages)"
              :page-size="PAGE_SIZE"
              :total="total"
              @update:page="page = $event"
            />
          </div>
        </template>
      </template>
    </div>
  </div>
</template>
