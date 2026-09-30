<script setup lang="ts">
/**
 * The filter body. Deliberately shell-free: the desktop rail and the mobile bottom
 * sheet are the same controls in two different containers, so the shell lives with
 * the surface that needs it and only the controls live here.
 *
 * Every change is emitted as a complete `HotelFilterState`; the page turns that into
 * a query string. Nothing is held locally, so the URL is always what is on screen.
 */
import { AMENITIES } from '~/utils/mock'
import {
  DEFAULT_HOTEL_FILTERS,
  HOTEL_STAR_OPTIONS,
  PRICE_MAX,
  PRICE_MIN,
  PRICE_STEP,
  activeFilterCount,
} from '~/utils/hotels'
import type { HotelFilterState } from '~/utils/hotels'

const filters = defineModel<HotelFilterState>({ required: true })

/**
 * The sheet repeats the count on its own action button, so it turns this one off.
 * Both are read, neither is forwarded blindly.
 */
withDefaults(defineProps<{ resultCount: number, showSummary?: boolean }>(), { showSummary: true })

const { t } = useI18n()
const uid = useId()

const today = new Date().toISOString().slice(0, 10)

/**
 * An unusable range is reported, not silently dropped — and the page keeps searching
 * without the dates rather than returning an empty result set with no explanation.
 */
const rangeError = computed(() => {
  const { checkIn, checkOut } = filters.value
  if (!checkIn && !checkOut) return ''
  if (checkIn && checkIn < today) return t('hotels.checkInPast')
  if (checkIn && checkOut && checkOut <= checkIn) return t('search.invalidRange')
  return ''
})

const price = computed({
  get: () => ({ min: filters.value.minPrice, max: filters.value.maxPrice }),
  set: (next: { min: number | null, max: number | null }) =>
    patch({ minPrice: next.min, maxPrice: next.max }),
})

const guests = computed({
  get: () => filters.value.guests,
  set: (value: number) => patch({ guests: value }),
})

const guestsLabel = computed(() =>
  filters.value.guests === 1
    ? t('search.guestsOne')
    : t('search.guestsMany', { count: filters.value.guests }),
)

const isFiltered = computed(() => activeFilterCount(filters.value) > 0)

function patch(part: Partial<HotelFilterState>): void {
  filters.value = { ...filters.value, ...part }
}

function toggleAmenity(id: string): void {
  const next = filters.value.amenities.includes(id)
    ? filters.value.amenities.filter(entry => entry !== id)
    : [...filters.value.amenities, id]
  patch({ amenities: next })
}

function toggleStar(star: number): void {
  const next = filters.value.stars.includes(star)
    ? filters.value.stars.filter(entry => entry !== star)
    : [...filters.value.stars, star]
  patch({ stars: next })
}
</script>

<template>
  <div class="flex flex-col">
    <div class="pb-6">
      <BaseInput
        :id="`${uid}-city`"
        :model-value="filters.city"
        type="search"
        :label="$t('hotels.destination')"
        :placeholder="$t('hotels.destinationPlaceholder')"
        autocomplete="off"
        @update:model-value="patch({ city: String($event ?? '') })"
      />
    </div>

    <div class="border-rule border-t" />

    <div class="flex flex-col gap-4 py-6">
      <BaseInput
        :id="`${uid}-check-in`"
        :model-value="filters.checkIn"
        type="date"
        :label="$t('hotels.checkIn')"
        :error="!filters.checkOut && rangeError ? rangeError : ''"
        @update:model-value="patch({ checkIn: String($event ?? '') })"
      />

      <BaseInput
        :id="`${uid}-check-out`"
        :model-value="filters.checkOut"
        type="date"
        :label="$t('hotels.checkOut')"
        :disabled="!filters.checkIn"
        :error="filters.checkOut && rangeError ? rangeError : ''"
        @update:model-value="patch({ checkOut: String($event ?? '') })"
      />
    </div>

    <div class="border-rule border-t" />

    <div class="py-6">
      <GuestsStepper
        v-model="guests"
        :label="$t('hotels.guests')"
        :value-label="guestsLabel"
        :decrease-label="$t('hotels.guestsDecrease')"
        :increase-label="$t('hotels.guestsIncrease')"
      />
    </div>

    <div class="border-rule border-t" />

    <div class="py-6">
      <p class="text-fg-muted text-label mb-3 uppercase">
        {{ $t('hotels.pricePerNight') }}
      </p>
      <PriceRangeSlider
        v-model="price"
        :min-bound="PRICE_MIN"
        :max-bound="PRICE_MAX"
        :step="PRICE_STEP"
      />
    </div>

    <div class="border-rule border-t" />

    <fieldset class="py-6">
      <legend class="text-fg-muted text-label mb-1 uppercase">
        {{ $t('hotels.amenities') }}
      </legend>
      <ul>
        <li
          v-for="amenity in AMENITIES"
          :key="amenity.id"
        >
          <label class="hover:bg-surface-alt flex min-h-11 cursor-pointer items-center gap-3 rounded-sm px-1 transition-colors duration-150">
            <input
              type="checkbox"
              class="accent-accent h-4 w-4 shrink-0 rounded-sm"
              :checked="filters.amenities.includes(amenity.id)"
              @change="toggleAmenity(amenity.id)"
            >
            <span class="text-sm">{{ amenity.name }}</span>
          </label>
        </li>
      </ul>
    </fieldset>

    <div class="border-rule border-t" />

    <fieldset class="py-6">
      <legend class="text-fg-muted text-label mb-1 uppercase">
        {{ $t('hotels.stars') }}
      </legend>
      <div class="flex flex-wrap gap-x-4">
        <label
          v-for="option in HOTEL_STAR_OPTIONS"
          :key="option"
          class="hover:bg-surface-alt flex min-h-11 cursor-pointer items-center gap-2 rounded-sm px-1 transition-colors duration-150"
        >
          <input
            type="checkbox"
            class="accent-accent h-4 w-4 shrink-0 rounded-sm"
            :checked="filters.stars.includes(option)"
            @change="toggleStar(option)"
          >
          <span class="tabular text-sm">{{ $t('hotels.starsOption', { count: option }) }}</span>
        </label>
      </div>
    </fieldset>

    <div class="border-rule border-t" />

    <div class="flex flex-col gap-3 py-6">
      <p
        v-if="showSummary"
        class="text-fg-muted text-sm"
        role="status"
      >
        {{ resultCount === 1 ? $t('hotels.showResultsOne') : $t('hotels.showResults', { count: resultCount }) }}
      </p>
      <BaseButton
        variant="secondary"
        size="md"
        :disabled="!isFiltered"
        @click="patch(DEFAULT_HOTEL_FILTERS)"
      >
        {{ $t('hotels.clearAll') }}
      </BaseButton>
    </div>
  </div>
</template>
