<script setup lang="ts">
import { AMENITY_BY_ID } from '~/utils/mock'
import { usd } from '~/utils/format'
import { isUuid } from '~/utils/validation'
import type { ApiHotelCard } from '~/utils/api'

const props = defineProps<{ hotel: ApiHotelCard }>()

/** Three amenities then a count. Never more — a card is a summary, not a list. */
const MAX_AMENITIES = 3

const visibleAmenities = computed(() =>
  props.hotel.amenityIds
    .map(id => AMENITY_BY_ID.get(id)?.name)
    .filter((name): name is string => Boolean(name))
    .slice(0, MAX_AMENITIES),
)

const overflowCount = computed(() => Math.max(0, props.hotel.amenityIds.length - MAX_AMENITIES))

const cover = computed(() => props.hotel.coverImage)

/** A missing price is "—": free and missing are different states. */
const priceLabel = computed(() =>
  props.hotel.priceFrom === null ? '—' : usd(props.hotel.priceFrom.amountCents),
)

const ratingLabel = computed(() =>
  props.hotel.rating.average === null ? '—' : props.hotel.rating.average.toFixed(1),
)

/**
 * The mock fallback keys fixtures by `htl_*` slugs, and `POST /favorites` wants a uuid, so
 * the heart would always come back as a 400 the guest cannot act on. A card that cannot be
 * saved is better off without the control than with one that always fails.
 */
const canFavorite = computed(() => isUuid(props.hotel.id))
</script>

<template>
  <BaseCard
    as="article"
    interactive
    class="group relative flex h-full flex-col"
  >
    <!--
      A sibling of the link, not inside it: a <button> nested in an <a> is invalid HTML and
      assistive tech announces one control where there are two. Absolute, so it sits over
      the cover's top-right without touching the link's box. First in the DOM because the
      heart is above the card visually and tab order should follow the eye.

      `inset-x-3` rather than `right-3`: the toggle's problem message grows downwards out of
      the same box, and a box with no left edge lets that message run wider than the card and
      over the neighbouring grid cell.
    -->
    <div
      v-if="canFavorite"
      class="absolute inset-x-3 top-3 flex justify-end"
    >
      <FavoriteToggle
        :hotel-id="hotel.id"
        :hotel-name="hotel.name"
      />
    </div>

    <NuxtLink
      :to="`/hotels/${hotel.slug}`"
      class="flex h-full flex-col"
    >
      <div class="border-rule relative aspect-[3/2] overflow-hidden border-b">
        <img
          v-if="cover"
          :src="cover.url"
          :alt="cover.altText ?? hotel.name"
          :width="cover.width"
          :height="cover.height"
          loading="lazy"
          decoding="async"
          class="h-full w-full object-cover"
        >
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
            <span class="tabular text-lg font-semibold">{{ ratingLabel }}</span>
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
