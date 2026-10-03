<script setup lang="ts">
/**
 * One review. Square avatar tile with the reviewer's initials — a square, not a circle;
 * this system does not round things it does not have to.
 *
 * The rating is the raw score. No stars: a star row as the only rating display is a
 * listed anti-pattern, and the number is what the guest actually meant.
 *
 * `ReviewView` is the card's contract, not the mock shape: the live API review has no
 * author location and its `createdAt` is an instant, while the fixture carries a
 * location and a date-only string. Both map into this view (see `hotelAdapters.ts`)
 * so the card never branches on the source.
 */
import { formatStayDate } from '~/utils/format'

export interface ReviewView {
  id: string
  authorName: string
  /** Null for API reviews — the contract carries no location, and none is invented. */
  authorLocation: string | null
  /** 1–5 live, 1–10 in the fixtures. Rendered raw either way. */
  rating: number
  title: string
  body: string
  /** Date-only `YYYY-MM-DD`, so the timezone-safe formatter holds. */
  stayedOn: string
}

const props = defineProps<{ review: ReviewView }>()

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
        <p
          v-if="review.authorLocation"
          class="text-fg-subtle text-label uppercase"
        >
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
      {{ formatStayDate(review.stayedOn) }}
    </p>
  </BaseCard>
</template>
