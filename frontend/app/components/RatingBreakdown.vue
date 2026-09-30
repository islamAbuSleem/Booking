<script setup lang="ts">
/**
 * Rating breakdown.
 *
 * The bars are normalised to the visible min–max of the five displayed scores, NOT to
 * 0–10. Against a 0–10 axis a set running 8.4–9.6 renders as five near-identical
 * full-width bars that carry no information; against min–max the weakest score is
 * visibly the weakest. The axis bounds are printed so the scale is never a mystery.
 *
 * Colour is never the only signal: every bar carries its label, its raw score, and a
 * count, and the scale is stated in text.
 */
import type { MockRatingBreakdown } from '~/utils/mock/types'

const props = defineProps<{ breakdown: MockRatingBreakdown }>()

const { t } = useI18n()

const scores = computed<{ key: string, label: string, score: number }[]>(() => {
  const b = props.breakdown
  return [
    { key: 'cleanliness', label: t('detail.ratingCleanliness'), score: b.cleanliness },
    { key: 'location', label: t('detail.ratingLocation'), score: b.location },
    { key: 'comfort', label: t('detail.ratingComfort'), score: b.comfort },
    { key: 'facilities', label: t('detail.ratingFacilities'), score: b.facilities },
    { key: 'staff', label: t('detail.ratingStaff'), score: b.staff },
  ]
})

const minScore = computed(() => Math.min(...scores.value.map(entry => entry.score)))
const maxScore = computed(() => Math.max(...scores.value.map(entry => entry.score)))
const isFlat = computed(() => minScore.value === maxScore.value)

/** In the degenerate all-equal case there is no axis to divide by, so every bar is full. */
function widthFor(score: number): string {
  if (isFlat.value) return '100%'
  return `${((score - minScore.value) / (maxScore.value - minScore.value)) * 100}%`
}
</script>

<template>
  <div class="border-rule bg-surface rounded-none border p-5">
    <p class="text-fg-muted text-label uppercase">
      {{ $t('detail.ratingScale', { min: minScore, max: maxScore }) }}
    </p>

    <div class="mt-4 flex items-baseline gap-3">
      <span class="tabular font-display text-display-l">{{ breakdown.average }}</span>
      <span class="text-fg-muted text-sm">
        {{ breakdown.totalReviews === 1
          ? $t('detail.reviewsCountOne')
          : $t('detail.reviewsCount', { count: breakdown.totalReviews }) }}
      </span>
    </div>

    <ul class="mt-5 flex flex-col gap-3">
      <li
        v-for="entry in scores"
        :key="entry.key"
        class="flex flex-col gap-1.5"
      >
        <div class="flex items-baseline justify-between gap-3 text-sm">
          <span>{{ entry.label }}</span>
          <span class="tabular text-fg-muted">{{ entry.score.toFixed(1) }}</span>
        </div>
        <!-- The bar itself is decorative: the label and the raw score above it are
             already text, so announcing them twice would be noise. -->
        <div
          aria-hidden="true"
          class="bg-surface-alt h-1.5 w-full"
        >
          <div
            class="bg-accent h-full"
            :style="{ width: widthFor(entry.score) }"
          />
        </div>
      </li>
    </ul>
  </div>
</template>
