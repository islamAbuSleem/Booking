<script setup lang="ts">
/**
 * One review. Square avatar tile with the reviewer's initials — a square, not a circle;
 * this system does not round things it does not have to.
 *
 * The rating is the raw score. No stars: a star row as the only rating display is a
 * listed anti-pattern, and the number is what the guest actually meant.
 */
import type { MockReview } from '~/utils/mock/types'
import { formatStayDate } from '~/utils/format'

const props = defineProps<{ review: MockReview }>()

const initials = computed(() =>
  props.review.authorName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? '')
    .join(''),
)
</script>

<template>
  <BaseCard
    as="article"
    class="flex flex-col gap-3 p-5"
  >
    <div class="flex items-center gap-3">
      <span
        aria-hidden="true"
        class="border-rule bg-surface-alt text-fg-muted flex h-10 w-10 shrink-0 items-center justify-center rounded-none border text-sm"
      >{{ initials }}</span>

      <div class="min-w-0">
        <p class="truncate text-sm font-medium">
          {{ review.authorName }}
        </p>
        <p class="text-fg-subtle text-label uppercase">
          {{ review.authorLocation }}
        </p>
      </div>

      <p class="tabular ml-auto shrink-0 text-sm font-semibold">
        {{ review.rating.toFixed(1) }}
      </p>
    </div>

    <h4 class="font-display text-title">
      {{ review.title }}
    </h4>

    <p class="prose-70 text-fg-muted text-sm">
      {{ review.body }}
    </p>

    <p class="text-fg-subtle tabular text-sm">
      {{ formatStayDate(review.createdAt) }}
    </p>
  </BaseCard>
</template>
