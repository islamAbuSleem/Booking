<script setup lang="ts">
/**
 * Room card. The rate is the loudest thing on it, because that is what the user is
 * comparing. Bed type and occupancy are labels, not prose — this is a functional
 * surface sitting inside an editorial one.
 *
 * The detail payload carries no per-room amenity list, so the card shows occupancy
 * only. A missing price renders as "—", not "$0".
 */
import type { ApiHotelRoom } from '~/utils/api'
import { usd, wholeNumber } from '~/utils/format'

const props = defineProps<{ room: ApiHotelRoom, hotelSlug: string }>()

const photo = computed(() => props.room.images[0] ?? null)

const priceLabel = computed(() =>
  props.room.price === null ? '—' : usd(props.room.price.amountCents),
)

const inventory = computed(() =>
  props.room.totalInventory === 1
    ? '1'
    : wholeNumber(props.room.totalInventory),
)
</script>

<template>
  <BaseCard
    as="article"
    class="flex h-full flex-col"
  >
    <div class="flex h-full flex-col">
      <img
        v-if="photo"
        :src="photo.url"
        :alt="photo.altText ?? room.name"
        :width="photo.width"
        :height="photo.height"
        loading="lazy"
        decoding="async"
        class="border-rule aspect-[4/3] w-full border-b object-cover"
      >

      <div class="flex flex-1 flex-col gap-3 p-5">
        <div>
          <h3 class="font-display text-display-m">
            {{ room.name }}
          </h3>
          <p class="text-fg-muted mt-1 text-sm">
            {{ $t('detail.bedType', { bed: room.bedType }) }}
          </p>
        </div>

        <p class="text-fg-muted prose-70 text-sm">
          {{ room.description }}
        </p>

        <p class="text-fg-muted text-sm">
          {{ $t('hotel.sleeps', { count: wholeNumber(room.maxGuests) }) }}
        </p>

        <div class="mt-auto flex flex-wrap items-end justify-between gap-4 pt-4">
          <p class="flex flex-col">
            <span class="flex items-baseline gap-1.5">
              <span class="tabular text-price">{{ priceLabel }}</span>
              <span class="text-fg-subtle text-sm">{{ $t('hotel.perNight') }}</span>
            </span>
            <span class="text-fg-subtle text-label uppercase">
              {{ $t('detail.inventory', { count: inventory }) }}
            </span>
          </p>

          <BaseButton
            :to="`/hotels/${hotelSlug}/book?room=${room.id}`"
            variant="secondary"
            size="md"
          >
            {{ $t('hotel.selectRoom') }}
          </BaseButton>
        </div>
      </div>
    </div>
  </BaseCard>
</template>
