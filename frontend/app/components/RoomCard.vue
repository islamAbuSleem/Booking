<script setup lang="ts">
/**
 * Room card. The rate is the loudest thing on it, because that is what the user is
 * comparing. Bed type and occupancy are labels, not prose — this is a functional
 * surface sitting inside an editorial one.
 */
import type { MockRoom } from '~/utils/mock/types'
import { usd, wholeNumber } from '~/utils/format'

const props = defineProps<{ room: MockRoom, hotelSlug: string }>()

const photo = computed(() => props.room.images[0])

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
        :alt="photo.alt"
        width="800"
        height="600"
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

        <ul class="text-fg-muted flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <li>{{ $t('hotel.sleeps', { count: room.maxGuests }) }}</li>
          <li
            v-for="item in room.amenities"
            :key="item"
          >
            {{ item }}
          </li>
        </ul>

        <div class="mt-auto flex flex-wrap items-end justify-between gap-4 pt-4">
          <p class="flex flex-col">
            <span class="flex items-baseline gap-1.5">
              <span class="tabular text-price">{{ usd(room.pricePerNightCents) }}</span>
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
