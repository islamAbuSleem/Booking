<script setup lang="ts">
/**
 * Guests stepper. The second guest-count control in the app (SearchWidget has the
 * first), which is the D14 threshold, so it gets its own file rather than a second
 * copy of the same button pair.
 *
 * The value is a live readout rather than a form control, so the wrapper is a
 * `role="group"` named by the visible label, and each button carries its own
 * `aria-label`. Both buttons are 44px — the 32px pair in SearchWidget is a defect,
 * not a precedent.
 */
import { MAX_GUESTS, MIN_GUESTS } from '~/utils/hotels'

const model = defineModel<number>({ required: true })

defineProps<{
  label: string
  valueLabel: string
  decreaseLabel: string
  increaseLabel: string
}>()

const uid = useId()

const decrease = (): void => {
  model.value = Math.max(MIN_GUESTS, model.value - 1)
}

const increase = (): void => {
  model.value = Math.min(MAX_GUESTS, model.value + 1)
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <span
      :id="`${uid}-label`"
      class="text-fg-muted text-label uppercase"
    >{{ label }}</span>

    <div
      role="group"
      class="border-rule-strong bg-surface flex h-12 items-center justify-between rounded-sm border px-2"
      :aria-labelledby="`${uid}-label`"
    >
      <span class="tabular pl-1 text-sm">{{ valueLabel }}</span>

      <span class="flex items-center">
        <button
          type="button"
          class="text-fg-muted hover:text-fg hover:border-fg flex h-11 w-11 items-center justify-center rounded-sm border border-transparent transition-colors duration-150 disabled:opacity-30"
          :disabled="model <= MIN_GUESTS"
          :aria-label="decreaseLabel"
          @click="decrease"
        >
          <svg
            viewBox="0 0 16 16"
            width="14"
            height="14"
            aria-hidden="true"
            focusable="false"
          >
            <path
              d="M3 8h10"
              stroke="currentColor"
              stroke-width="1.5"
            />
          </svg>
        </button>

        <button
          type="button"
          class="text-fg-muted hover:text-fg hover:border-fg flex h-11 w-11 items-center justify-center rounded-sm border border-transparent transition-colors duration-150 disabled:opacity-30"
          :disabled="model >= MAX_GUESTS"
          :aria-label="increaseLabel"
          @click="increase"
        >
          <svg
            viewBox="0 0 16 16"
            width="14"
            height="14"
            aria-hidden="true"
            focusable="false"
          >
            <path
              d="M3 8h10M8 3v10"
              stroke="currentColor"
              stroke-width="1.5"
            />
          </svg>
        </button>
      </span>
    </div>
  </div>
</template>
