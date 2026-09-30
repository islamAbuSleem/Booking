<script setup lang="ts">
/**
 * /dashboard/host — the property manager's view. Dense, calm, data-first:
 * four stat cards, the property table at fixed 64px rows, and recent
 * bookings. Numbers are computed from the fixtures, so every figure on the
 * screen is real mock data, not invented copy.
 */
import { BOOKINGS, HOTELS } from '~/utils/mock'
import { usd, wholeNumber } from '~/utils/format'
import type { MockBookingRecord } from '~/composables/useBookings'

definePageMeta({ layout: 'dashboard', middleware: 'auth' })

const { t } = useI18n()

const properties = computed(() => HOTELS)

function upcomingFor(hotelId: string): number {
  return BOOKINGS.filter(
    booking => booking.hotelId === hotelId && (booking.status === 'PENDING' || booking.status === 'CONFIRMED'),
  ).length
}

const publishedCount = computed(() => HOTELS.filter(hotel => hotel.status === 'PUBLISHED').length)
const upcomingCount = computed(
  () => BOOKINGS.filter(booking => booking.status === 'PENDING' || booking.status === 'CONFIRMED').length,
)
const roomsTotal = computed(() => HOTELS.reduce((sum, hotel) => sum + hotel.rooms.length, 0))
const revenueCents = computed(() =>
  BOOKINGS.filter(booking => booking.status !== 'CANCELLED').reduce((sum, booking) => sum + booking.totalCents, 0),
)

const recent = computed<MockBookingRecord[]>(() =>
  [...BOOKINGS].sort((a, b) => b.checkIn.localeCompare(a.checkIn)).slice(0, 5),
)

function hotelName(hotelId: string): string {
  return HOTELS.find(hotel => hotel.id === hotelId)?.name ?? hotelId
}

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
                  v-if="hotel.images[0]"
                  :src="hotel.images[0].url"
                  :alt="hotel.images[0].alt"
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
              {{ wholeNumber(hotel.rooms.length) }}
            </td>
            <td class="tabular px-4 py-2 text-right text-sm">
              {{ wholeNumber(upcomingFor(hotel.id)) }}
            </td>
            <td class="tabular px-4 py-2 text-right text-sm">
              {{ hotel.rating.totalReviews > 0 ? hotel.rating.average : '—' }}
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
              v-if="hotel.images[0]"
              :src="hotel.images[0].url"
              :alt="hotel.images[0].alt"
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
              {{ $t('host.roomsLine', { count: wholeNumber(hotel.rooms.length) }) }}
            </span>
            <span class="tabular text-fg-muted">
              {{ $t('host.upcomingLine', { count: wholeNumber(upcomingFor(hotel.id)) }) }}
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
              {{ hotelName(booking.hotelId) }}
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
            {{ hotelName(booking.hotelId) }} · <span class="tabular">{{ booking.checkIn }}</span>
          </p>
        </li>
      </ul>
    </section>
  </div>
</template>
