<script setup lang="ts">
/**
 * /dashboard/host — the property manager's view. Dense, calm, data-first:
 * four stat cards, the property table at fixed 64px rows, and recent
 * bookings.
 *
 * T22: the API is the primary source — the property table, the stats, and the
 * incoming bookings all read the host endpoints. A transport failure (no backend
 * listening) or a 401 degrades to the fixtures, exactly like the guest bookings
 * pages; any other envelope error is a real answer and drives the error state.
 * The fixtures never mix with live rows: each path maps into the same view model.
 */
import { BOOKINGS, HOTELS } from '~/utils/mock'
import { fetchHostBookings, fetchMyHotels, isApiError, isApiFailure } from '~/utils/api'
import type { ApiHostBooking, ApiHostHotelListItem } from '~/utils/api'
import { usd, wholeNumber } from '~/utils/format'

definePageMeta({ layout: 'dashboard', middleware: 'auth' })

const { t } = useI18n()

type HotelStatus = ApiHostHotelListItem['status']
type BookingStatus = 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED'

/**
 * What the template renders. The host list endpoint carries no rating and no room
 * detail — counts and a cover only — so the view flattens both sources to the same
 * fields and the template never branches on "live vs mock".
 */
interface HostHotelView {
  id: string
  name: string
  city: string
  status: HotelStatus
  coverImageUrl: string | null
  coverAlt: string
  roomsCount: number
  upcomingCount: number
  ratingAverage: number | null
  ratingTotal: number
}

interface HostBookingView {
  id: string
  reference: string
  hotelName: string
  checkIn: string
  totalCents: number
  status: BookingStatus
}

/**
 * The generated host type leaves `status` a bare string while the wire only ever
 * carries the four booking states. Narrow it for the badge; an unknown value means
 * the contract drifted, and COMPLETED (neutral tone) mislabels it quietest.
 */
function toBookingStatus(value: string): BookingStatus {
  return value === 'PENDING' || value === 'CONFIRMED' || value === 'COMPLETED' || value === 'CANCELLED'
    ? value
    : 'COMPLETED'
}

function liveHotelToView(item: ApiHostHotelListItem): HostHotelView {
  return {
    id: item.id,
    name: item.name,
    city: item.city,
    status: item.status,
    coverImageUrl: item.coverImageUrl,
    coverAlt: item.name,
    roomsCount: item.roomsCount,
    upcomingCount: item.upcomingBookingsCount,
    // No review aggregates on the host endpoints yet — the cell renders "—" until
    // reviews (T24) or analytics (T41) add one. A null is honest; a 0.0 would be a lie.
    ratingAverage: null,
    ratingTotal: 0,
  }
}

function liveBookingToView(booking: ApiHostBooking): HostBookingView {
  return {
    id: booking.id,
    reference: booking.reference,
    hotelName: booking.hotel.name,
    checkIn: booking.checkIn,
    totalCents: booking.totalCents,
    status: toBookingStatus(booking.status),
  }
}

function mockHotelToView(hotel: (typeof HOTELS)[number]): HostHotelView {
  const upcoming = BOOKINGS.filter(
    booking => booking.hotelId === hotel.id && (booking.status === 'PENDING' || booking.status === 'CONFIRMED'),
  ).length
  return {
    id: hotel.id,
    name: hotel.name,
    city: hotel.city,
    status: hotel.status,
    coverImageUrl: hotel.images[0]?.url ?? null,
    coverAlt: hotel.images[0]?.alt ?? hotel.name,
    roomsCount: hotel.rooms.length,
    upcomingCount: upcoming,
    ratingAverage: hotel.rating.average,
    ratingTotal: hotel.rating.totalReviews,
  }
}

function mockBookingToView(booking: (typeof BOOKINGS)[number]): HostBookingView {
  return {
    id: booking.id,
    reference: booking.reference,
    hotelName: HOTELS.find(hotel => hotel.id === booking.hotelId)?.name ?? booking.hotelId,
    checkIn: booking.checkIn,
    totalCents: booking.totalCents,
    status: toBookingStatus(booking.status),
  }
}

interface DashboardPayload {
  hotels: HostHotelView[]
  bookings: HostBookingView[]
}

const {
  data,
  status: fetchStatus,
  error,
} = await useAsyncData<DashboardPayload>(
  'host:dashboard',
  async (): Promise<DashboardPayload> => {
    try {
      // Independent reads, so they run concurrently rather than as a waterfall.
      const [hotels, bookings] = await Promise.all([fetchMyHotels(), fetchHostBookings()])
      return {
        hotels: hotels.items.map(liveHotelToView),
        bookings: [...bookings.items]
          .sort((a, b) => b.checkIn.localeCompare(a.checkIn))
          .map(liveBookingToView),
      }
    }
    catch (fetchError: unknown) {
      if (isApiFailure(fetchError) && (!isApiError(fetchError) || fetchError.code !== 'UNAUTHORIZED')) {
        throw fetchError
      }
      return {
        hotels: HOTELS.map(mockHotelToView),
        bookings: [...BOOKINGS]
          .sort((a, b) => b.checkIn.localeCompare(a.checkIn))
          .map(mockBookingToView),
      }
    }
  },
)

const properties = computed(() => data.value?.hotels ?? [])
const bookings = computed(() => data.value?.bookings ?? [])
const isLoading = computed(() => fetchStatus.value === 'pending')

const publishedCount = computed(() => properties.value.filter(hotel => hotel.status === 'PUBLISHED').length)
const upcomingCount = computed(
  () => bookings.value.filter(booking => booking.status === 'PENDING' || booking.status === 'CONFIRMED').length,
)
const roomsTotal = computed(() => properties.value.reduce((sum, hotel) => sum + hotel.roomsCount, 0))
const revenueCents = computed(() =>
  bookings.value.filter(booking => booking.status !== 'CANCELLED').reduce((sum, booking) => sum + booking.totalCents, 0),
)

const recent = computed(() => bookings.value.slice(0, 5))

useSeoMeta({
  title: () => `${t('host.title')} · ${t('common.brand')}`,
  robots: 'noindex, nofollow',
})
</script>

<template>
  <div>
    <div class="flex flex-wrap items-end justify-between gap-4">
      <h1 class="font-display text-display-l">
        {{ $t('host.title') }}
      </h1>
      <BaseButton
        to="/dashboard/host/new"
        variant="primary"
        size="md"
      >
        {{ $t('host.addProperty') }}
      </BaseButton>
    </div>

    <dl class="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        :label="$t('host.statPublished')"
        :value="wholeNumber(publishedCount)"
      />
      <StatCard
        :label="$t('host.statUpcoming')"
        :value="wholeNumber(upcomingCount)"
      />
      <StatCard
        :label="$t('host.statRooms')"
        :value="wholeNumber(roomsTotal)"
      />
      <StatCard
        :label="$t('host.statRevenue')"
        :value="usd(revenueCents)"
      />
    </dl>

    <BaseAlert
      v-if="error"
      tone="danger"
      class="mt-8"
    >
      {{ $t('common.unexpectedError') }}
    </BaseAlert>

    <div v-else-if="isLoading">
      <BaseSkeleton :rows="6" />
    </div>

    <template v-else>
      <BaseEmptyState
        v-if="properties.length === 0"
        :title="$t('host.emptyTitle')"
        :hint="$t('host.emptyHint')"
        class="mt-10"
      >
        <BaseButton
          to="/dashboard/host/new"
          variant="primary"
          size="md"
        >
          {{ $t('host.addProperty') }}
        </BaseButton>
      </BaseEmptyState>

      <template v-else>
        <section
          aria-labelledby="host-properties"
          class="mt-10"
        >
          <h2
            id="host-properties"
            class="text-fg-muted text-label uppercase"
          >
            {{ $t('host.propertiesHeading') }}
          </h2>

          <!-- Desktop table. Fixed 64px rows; a wrapping value is a width bug. -->
          <table class="mt-3 hidden w-full border-collapse lg:table">
            <caption class="sr-only">
              {{ $t('host.propertiesHeading') }}
            </caption>
            <thead>
              <tr class="bg-surface-alt text-fg-muted text-left text-label uppercase">
                <th
                  scope="col"
                  class="px-4 py-3 font-medium"
                >
                  {{ $t('host.colProperty') }}
                </th>
                <th
                  scope="col"
                  class="px-4 py-3 font-medium"
                >
                  {{ $t('host.colCity') }}
                </th>
                <th
                  scope="col"
                  class="px-4 py-3 font-medium"
                >
                  {{ $t('host.colStatus') }}
                </th>
                <th
                  scope="col"
                  class="px-4 py-3 text-right font-medium"
                >
                  {{ $t('host.colRooms') }}
                </th>
                <th
                  scope="col"
                  class="px-4 py-3 text-right font-medium"
                >
                  {{ $t('host.colUpcoming') }}
                </th>
                <th
                  scope="col"
                  class="px-4 py-3 text-right font-medium"
                >
                  {{ $t('host.colRating') }}
                </th>
                <th
                  scope="col"
                  class="w-32 px-4 py-3 font-medium"
                >
                  <span class="sr-only">{{ $t('host.colAction') }}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="hotel in properties"
                :key="hotel.id"
                class="border-rule h-16 border-b"
              >
                <td class="max-w-[280px] px-4 py-2">
                  <span class="flex items-center gap-3">
                    <img
                      v-if="hotel.coverImageUrl"
                      :src="hotel.coverImageUrl"
                      :alt="hotel.coverAlt"
                      width="96"
                      height="96"
                      loading="lazy"
                      decoding="async"
                      class="h-12 w-12 shrink-0 object-cover"
                    >
                    <span class="truncate font-display text-lg">{{ hotel.name }}</span>
                  </span>
                </td>
                <td class="px-4 py-2 text-sm">
                  {{ hotel.city }}
                </td>
                <td class="px-4 py-2">
                  <HotelStatusBadge :status="hotel.status" />
                </td>
                <td class="tabular px-4 py-2 text-right text-sm">
                  {{ wholeNumber(hotel.roomsCount) }}
                </td>
                <td class="tabular px-4 py-2 text-right text-sm">
                  {{ wholeNumber(hotel.upcomingCount) }}
                </td>
                <td class="tabular px-4 py-2 text-right text-sm">
                  {{ hotel.ratingTotal > 0 && hotel.ratingAverage !== null ? hotel.ratingAverage : '—' }}
                </td>
                <td class="px-4 py-2">
                  <BaseButton
                    :to="`/dashboard/host/${hotel.id}/edit`"
                    variant="secondary"
                    size="sm"
                    class="w-full"
                  >
                    {{ $t('common.edit') }}
                  </BaseButton>
                </td>
              </tr>
            </tbody>
          </table>

          <!-- Narrow screens: one card per property. -->
          <ul class="flex flex-col lg:hidden">
            <li
              v-for="hotel in properties"
              :key="hotel.id"
              class="border-rule border-b py-5"
            >
              <div class="flex items-center gap-3">
                <img
                  v-if="hotel.coverImageUrl"
                  :src="hotel.coverImageUrl"
                  :alt="hotel.coverAlt"
                  width="96"
                  height="96"
                  loading="lazy"
                  decoding="async"
                  class="h-12 w-12 shrink-0 object-cover"
                >
                <div class="min-w-0">
                  <p class="truncate font-display text-xl">
                    {{ hotel.name }}
                  </p>
                  <p class="text-fg-muted text-sm">
                    {{ hotel.city }}
                  </p>
                </div>
              </div>
              <div class="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                <HotelStatusBadge :status="hotel.status" />
                <span class="tabular text-fg-muted">
                  {{ $t('host.roomsLine', { count: wholeNumber(hotel.roomsCount) }) }}
                </span>
                <span class="tabular text-fg-muted">
                  {{ $t('host.upcomingLine', { count: wholeNumber(hotel.upcomingCount) }) }}
                </span>
              </div>
              <BaseButton
                :to="`/dashboard/host/${hotel.id}/edit`"
                variant="secondary"
                size="sm"
                class="mt-3"
              >
                {{ $t('common.edit') }}
              </BaseButton>
            </li>
          </ul>
        </section>

        <section
          aria-labelledby="host-bookings"
          class="mt-10"
        >
          <h2
            id="host-bookings"
            class="text-fg-muted text-label uppercase"
          >
            {{ $t('host.recentHeading') }}
          </h2>

          <table class="mt-3 hidden w-full border-collapse lg:table">
            <caption class="sr-only">
              {{ $t('host.recentHeading') }}
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
                  class="px-4 py-3 text-right font-medium"
                >
                  {{ $t('bookings.colTotal') }}
                </th>
                <th
                  scope="col"
                  class="px-4 py-3 font-medium"
                >
                  {{ $t('bookings.colStatus') }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="booking in recent"
                :key="booking.id"
                class="border-rule h-16 border-b"
              >
                <td class="px-4 py-2 font-mono text-sm">
                  {{ booking.reference }}
                </td>
                <td class="max-w-[240px] truncate px-4 py-2 text-sm">
                  {{ booking.hotelName }}
                </td>
                <td class="tabular px-4 py-2 text-sm">
                  {{ booking.checkIn }}
                </td>
                <td class="tabular px-4 py-2 text-right text-sm">
                  {{ usd(booking.totalCents) }}
                </td>
                <td class="px-4 py-2">
                  <BookingStatusBadge :status="booking.status" />
                </td>
              </tr>
            </tbody>
          </table>

          <ul class="flex flex-col lg:hidden">
            <li
              v-for="booking in recent"
              :key="booking.id"
              class="border-rule border-b py-4"
            >
              <div class="flex flex-wrap items-center justify-between gap-2">
                <span class="font-mono text-sm">{{ booking.reference }}</span>
                <BookingStatusBadge :status="booking.status" />
              </div>
              <p class="mt-1 truncate text-sm">
                {{ booking.hotelName }} · <span class="tabular">{{ booking.checkIn }}</span>
              </p>
            </li>
          </ul>
          <p
            v-if="recent.length === 0"
            class="text-fg-muted mt-3 text-sm"
          >
            {{ $t('host.noBookingsHint') }}
          </p>
        </section>
      </template>
    </template>
  </div>
</template>
