<script setup lang="ts">
/**
 * The booking panel — sticky in the right 5 columns on desktop, and a pinned action
 * bar on mobile so the rate and the button stay reachable while the reviews are read.
 * Mobile gets extra bottom padding on the page so the bar never covers text.
 *
 * Prose is Archivo at 68ch: a Fraunces description at 16px is unreadable and undoes
 * the editorial feel (D24).
 */
import type { MockHotel } from '~/utils/mock/types'
import { cheapestNightlyCents } from '~/utils/hotels'
import { usd } from '~/utils/format'

const props = defineProps<{ hotel: MockHotel }>()

const { t } = useI18n()

const nightlyCents = computed(() => cheapestNightlyCents(props.hotel))

const band = computed(() => {
  const average = props.hotel.rating.average
  if (average >= 9) return t('detail.bandExcellent')
  if (average >= 8) return t('detail.bandVeryGood')
  if (average >= 7) return t('detail.bandGood')
  if (average >= 6) return t('detail.bandPleasant')
  return t('detail.bandMixed')
})

/** The guarantee sits with the price, not in a badge. */
const cancellation = computed(() => t('detail.cancellation'))
</script>

<template>
  <div class="lg:sticky lg:top-6">
    <div class="border-rule bg-surface rounded-none border p-6">
      <p class="text-fg-muted text-label uppercase">
        {{ hotel.city }}, {{ hotel.country }}
      </p>

      <h1 class="font-display mt-2 text-display-l">
        {{ hotel.name }}
      </h1>

      <p class="mt-3 flex flex-wrap items-baseline gap-x-2 text-sm">
        <span class="tabular text-lg font-semibold">{{ hotel.rating.average }}</span>
        <span>{{ band }}</span>
        <span class="text-fg-subtle">
          {{ hotel.rating.totalReviews === 1
            ? $t('detail.reviewsCountOne')
            : $t('detail.reviewsCount', { count: hotel.rating.totalReviews }) }}
        </span>
      </p>

      <p class="prose-70 text-fg-muted mt-4 text-lg">
        {{ hotel.description }}
      </p>

      <div class="border-rule my-6 border-t" />

      <p class="flex flex-wrap items-baseline gap-2">
        <span class="text-fg-muted text-sm">{{ $t('hotel.from') }}</span>
        <span class="tabular font-display text-price-lg">{{ nightlyCents === null ? '—' : usd(nightlyCents) }}</span>
        <span class="text-fg-subtle text-sm">{{ $t('hotel.perNight') }}</span>
      </p>

      <BaseButton
        :to="`/hotels/${hotel.slug}/book`"
        variant="primary"
        size="lg"
        class="mt-5 w-full"
      >
        {{ $t('hotel.checkAvailability') }}
      </BaseButton>

      <p class="text-fg-muted mt-4 flex items-start gap-2 text-sm">
        <svg
          class="mt-0.5 shrink-0"
          viewBox="0 0 16 16"
          width="14"
          height="14"
          aria-hidden="true"
          focusable="false"
        >
          <path
            d="M3 8.5l3.2 3.2L13 5"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
          />
        </svg>
        <span>{{ cancellation }}</span>
      </p>
    </div>

    <!-- Mobile only. The page reserves the space; this never sits over content. -->
    <div
      class="border-rule bg-surface fixed inset-x-0 bottom-0 z-20 flex items-center gap-4 border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:hidden"
    >
      <p class="flex shrink-0 flex-col">
        <span class="text-fg-subtle text-label uppercase">{{ $t('hotel.from') }}</span>
        <span class="flex items-baseline gap-1">
          <span class="tabular text-price">{{ nightlyCents === null ? '—' : usd(nightlyCents) }}</span>
          <span class="text-fg-subtle text-sm">{{ $t('hotel.perNight') }}</span>
        </span>
      </p>
      <BaseButton
        :to="`/hotels/${hotel.slug}/book`"
        variant="primary"
        size="md"
        class="flex-1"
      >
        {{ $t('hotel.checkAvailability') }}
      </BaseButton>
    </div>
  </div>
</template>
