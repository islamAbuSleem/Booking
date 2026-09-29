<script setup lang="ts">
import { AMENITY_BY_ID } from '~/utils/mock'
import type { MockHotel } from '~/utils/mock/types'

const props = defineProps<{ hotel: MockHotel }>()

/** Three amenities then a count. Never more — a card is a summary, not a list. */
const MAX_AMENITIES = 3

const visibleAmenities = computed(() =>
  props.hotel.amenityIds
    .map(id => AMENITY_BY_ID.get(id)?.name)
    .filter((name): name is string => Boolean(name))
    .slice(0, MAX_AMENITIES),
)

const overflowCount = computed(() => Math.max(0, props.hotel.amenityIds.length - MAX_AMENITIES))

const cover = computed(() => props.hotel.images[0])
const cheapestNight = computed(() => {
  const prices = props.hotel.rooms.map(room => room.pricePerNightCents)
  return prices.length ? Math.min(...prices) : null
})

const priceLabel = computed(() =>
  cheapestNight.value === null
    ? '—'
    : new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      }).format(cheapestNight.value / 100),
)
</script>

<template>
  <BaseCard
    as="article"
    interactive
    class="group flex h-full flex-col"
  >
    <NuxtLink
      :to="`/hotels/${hotel.slug}`"
      class="flex h-full flex-col"
    >
      <div class="border-rule relative aspect-[3/2] overflow-hidden border-b">
        <img
          v-if="cover"
          :src="cover.url"
          :alt="cover.alt"
          :width="800"
          :height="533"
          loading="lazy"
          decoding="async"
          class="h-full w-full object-cover"
        >
        <span
          v-if="hotel.status === 'PENDING'"
          class="bg-warning-wash text-warning border-warning absolute top-3 left-3 rounded-sm border px-2.5 py-0.5 text-label uppercase"
        >
          {{ $t('status.pending') }}
        </span>
      </div>

      <div class="flex flex-1 flex-col gap-2 p-5">
        <p class="text-fg-muted text-label uppercase">
          {{ hotel.city }}, {{ hotel.country }}
        </p>

        <h3 class="font-display text-display-m">{{ hotel.name }}</h3>

        <ul class="text-fg-muted flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <li
            v-for="name in visibleAmenities"
            :key="name"
          >{{ name }}</li>
          <li
            v-if="overflowCount > 0"
            class="text-fg-subtle"
          >
            {{ $t('hotel.amenitiesMore', { count: overflowCount }) }}
          </li>
        </ul>

        <div class="mt-auto flex items-end justify-between gap-4 pt-3">
          <p class="flex items-baseline gap-1.5 text-sm">
            <span class="tabular text-lg font-semibold">{{ hotel.rating.average }}</span>
            <span class="text-fg-subtle">
              {{ $t('hotel.reviews', { count: hotel.rating.totalReviews }) }}
            </span>
          </p>

          <p class="flex items-baseline gap-1.5">
            <span class="tabular text-lg font-semibold">{{ priceLabel }}</span>
            <span class="text-fg-subtle text-sm">{{ $t('hotel.perNight') }}</span>
          </p>
        </div>
      </div>
    </NuxtLink>
  </BaseCard>
</template>
