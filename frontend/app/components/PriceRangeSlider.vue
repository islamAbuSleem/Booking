<script setup lang="ts">
/**
 * Dual-ended price slider.
 *
 * Two native range inputs share one track, so the thumbs are real form controls —
 * keyboard operable, announced with their own names, and hit-tested by the browser.
 * Both inputs span the FULL bounds and the crossing is prevented in the setters, not
 * by narrowing one input's `max`: if the bounds differed per input the thumbs would
 * compute their positions against different scales and the fill would drift off them.
 *
 * `low` renders beneath `high` so the upper thumb stays grabbable where the two meet.
 * The thumbs meet only at a bound, where there is nothing further to drag.
 *
 * Commits are debounced: the fill tracks the drag at once, the query string follows
 * once the thumb settles. A shared URL therefore always holds a settled value.
 */
import { usd } from '~/utils/format'

const model = defineModel<{ min: number | null, max: number | null }>({ required: true })

const props = defineProps<{ minBound: number, maxBound: number, step: number }>()

const uid = useId()
const { t } = useI18n()

const low = ref(model.value.min ?? props.minBound)
const high = ref(model.value.max ?? props.maxBound)
let timer: ReturnType<typeof setTimeout> | undefined

const span = computed(() => props.maxBound - props.minBound)

const lowPct = computed(() => ((low.value - props.minBound) / span.value) * 100)
const widthPct = computed(() => ((high.value - low.value) / span.value) * 100)

/** The URL is the source of truth, so a back navigation has to win over the drag. */
watch(model, (next) => {
  low.value = next.min ?? props.minBound
  high.value = next.max ?? props.maxBound
})

watch([low, high], () => {
  clearTimeout(timer)
  timer = setTimeout(() => {
    model.value = {
      min: low.value <= props.minBound ? null : low.value,
      max: high.value >= props.maxBound ? null : high.value,
    }
  }, 250)
})

onScopeDispose(() => clearTimeout(timer))

const rangeText = computed(() =>
  model.value.min === null && model.value.max === null
    ? t('hotels.priceRangeUnset')
    : t('hotels.priceRange', { min: usd(low.value * 100), max: usd(high.value * 100) }),
)
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex items-baseline justify-between gap-3">
      <label
        :for="`${uid}-low`"
        class="text-fg-muted text-label uppercase"
      >{{ $t('hotels.priceMin') }}</label>
      <label
        :for="`${uid}-high`"
        class="text-fg-muted text-label uppercase"
      >{{ $t('hotels.priceMax') }}</label>
    </div>

    <div class="relative h-11">
      <div
        aria-hidden="true"
        class="bg-surface-alt absolute inset-x-0 top-1/2 h-1 -translate-y-1/2"
      />
      <div
        aria-hidden="true"
        class="bg-accent absolute top-1/2 h-1 -translate-y-1/2"
        :style="{ left: `${lowPct}%`, width: `${widthPct}%` }"
      />

      <input
        :id="`${uid}-low`"
        v-model.number="low"
        type="range"
        :min="minBound"
        :max="maxBound"
        :step="step"
        :aria-valuetext="usd(low * 100)"
        class="range-thumb pointer-events-none absolute inset-x-0 top-1/2 h-11 w-full -translate-y-1/2 appearance-none bg-transparent"
        @change="low = Math.min(low, high)"
      >

      <input
        :id="`${uid}-high`"
        v-model.number="high"
        type="range"
        :min="minBound"
        :max="maxBound"
        :step="step"
        :aria-valuetext="usd(high * 100)"
        class="range-thumb pointer-events-none absolute inset-x-0 top-1/2 z-10 h-11 w-full -translate-y-1/2 appearance-none bg-transparent"
        @change="high = Math.max(high, low)"
      >
    </div>

    <p class="tabular text-fg-muted text-sm">
      {{ rangeText }}
    </p>
  </div>
</template>

<style scoped>
/*
 * Native thumb and track styling is not reachable from a Tailwind utility class
 * portably — `::-webkit-slider-thumb` and `::-moz-range-thumb` need different
 * declarations for the same control. This is the one component with a style block;
 * the theme itself stays in app/assets/css/main.css.
 */
.range-thumb::-webkit-slider-runnable-track {
  height: 1.5rem;
  background: transparent;
  border: 0;
}

.range-thumb::-webkit-slider-thumb {
  appearance: none;
  pointer-events: auto;
  width: 1.25rem;
  height: 1.25rem;
  border-radius: 2px;
  border: 1px solid var(--color-fg);
  background-color: var(--color-surface);
  cursor: grab;
}

.range-thumb::-moz-range-track {
  height: 1.5rem;
  background: transparent;
  border: 0;
}

.range-thumb::-moz-range-progress {
  background: transparent;
}

.range-thumb::-moz-range-thumb {
  pointer-events: auto;
  width: 1.25rem;
  height: 1.25rem;
  border-radius: 2px;
  border: 1px solid var(--color-fg);
  background-color: var(--color-surface);
  cursor: grab;
}

.range-thumb:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
</style>
