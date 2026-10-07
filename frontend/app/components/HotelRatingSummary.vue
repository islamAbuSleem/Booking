<script setup lang="ts">
/**
 * Rating summary for the real detail payload.
 *
 * The API's `RatingSummary` is an average and a count — no per-category scores —
 * so this is a number plus its scale note, not bars. The bar chart
 * (`RatingBreakdown`) stays for the mock fallback, which is the only path that
 * has category scores. A missing average renders as "—", never as zero.
 */
import { formatRating, wholeNumber } from '~/utils/format'

const props = defineProps<{ average: number | null, totalReviews: number }>()
</script>

<template>
  <div class="border-rule bg-surface rounded-none border p-5">
    <div class="flex items-baseline gap-3">
      <span class="tabular font-display text-display-l">
        {{ props.average === null ? '—' : formatRating(props.average) }}
      </span>
      <span class="text-fg-muted text-sm">
        {{ props.totalReviews === 1
          ? $t('detail.reviewsCountOne')
          : $t('detail.reviewsCount', { count: wholeNumber(props.totalReviews) }) }}
      </span>
    </div>

    <p
      v-if="props.average === null"
      class="text-fg-muted mt-2 text-sm"
    >
      {{ $t('detail.noRating') }}
    </p>
    <p
      v-else
      class="text-fg-muted mt-2 text-sm"
    >
      {{ $t('detail.ratingScaleNote') }}
    </p>
  </div>
</template>
