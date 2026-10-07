<script setup lang="ts">
/**
 * Location block — a static styled placeholder, not a map.
 *
 * D28 is deliberately unmade: no provider is named, so there is no embed and no
 * screenshot (a screenshot carries third-party attribution and is not accessible).
 * What is here is the information a map would have carried — address, city, and
 * coordinates in mono — plus a link out for directions.
 *
 * The component is the seam: swapping the placeholder for a provider is a change to
 * this file alone, and nothing above it has to move.
 */
import type { ApiHotelDetail } from '~/utils/api'
import { formatCoordinate } from '~/utils/format'

const props = defineProps<{ hotel: ApiHotelDetail }>()

/** Deep link rather than an embed, so nothing third-party is baked into the page. */
const directionsUrl = computed(
  () =>
    `https://www.openstreetmap.org/?mlat=${props.hotel.lat}&mlon=${props.hotel.lng}#map=17/${props.hotel.lat}/${props.hotel.lng}`,
)
</script>

<template>
  <div>
    <!-- D28: replace this block with a provider component. Nothing above changes. -->
    <div
      class="bg-surface-alt border-rule flex aspect-[4/3] flex-col items-center justify-center gap-3 rounded-none border p-6 text-center"
    >
      <svg
        viewBox="0 0 24 24"
        width="28"
        height="28"
        class="text-fg-muted"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11z"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
        />
        <circle
          cx="12"
          cy="10"
          r="2.5"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
        />
      </svg>
      <p class="text-fg text-label uppercase">
        {{ $t('detail.mapPlaceholder') }}
      </p>
      <p class="prose-70 text-fg-muted text-sm">
        {{ $t('detail.mapPlaceholderHint') }}
      </p>
    </div>

    <div class="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div>
        <p class="text-fg-muted text-label uppercase">
          {{ $t('detail.addressLabel') }}
        </p>
        <p class="mt-1 text-sm">
          {{ hotel.addressLine }}, {{ hotel.city }}, {{ hotel.country }}
        </p>
      </div>

      <div>
        <p class="text-fg-muted text-label uppercase">
          {{ $t('detail.coordinatesLabel') }}
        </p>
        <p class="font-mono mt-1 text-sm">
          {{ formatCoordinate(hotel.lat) }}, {{ formatCoordinate(hotel.lng) }}
        </p>
      </div>
    </div>

    <a
      :href="directionsUrl"
      target="_blank"
      rel="noopener noreferrer"
      class="text-link mt-5 inline-flex items-center gap-2 text-sm underline-offset-4 hover:underline"
    >
      {{ $t('hotel.getDirections') }}
      <svg
        viewBox="0 0 16 16"
        width="12"
        height="12"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M6 3H3v10h10v-3M9 3h4v4M13 3L7 9"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
        />
      </svg>
    </a>
  </div>
</template>
