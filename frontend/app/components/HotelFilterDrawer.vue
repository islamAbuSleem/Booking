<script setup lang="ts">
/**
 * Mobile filter sheet.
 *
 * A bottom sheet, not a centred dialog, so it is `margin-top: auto` against the UA's
 * `inset: 0` and the user's thumb reaches the controls. `<dialog>` + `showModal()`
 * supplies the focus trap, the `::backdrop`, `Escape`, and `inert` on the page
 * behind — none of which a `v-if` overlay gets for free.
 *
 * The drag handle is real: the header drags the sheet down to dismiss. A handle that
 * does nothing is a picture of a control, and this system does not put those on screen.
 * Every gesture has a button equivalent — the close button and `Escape`.
 */
import type { HotelFilterState } from '~/utils/hotels'

const open = defineModel<boolean>('open', { required: true })
const filters = defineModel<HotelFilterState>('filters', { required: true })

const props = defineProps<{ resultCount: number }>()

const { t } = useI18n()

const sheet = ref<HTMLDialogElement | null>(null)
const returnFocusTo = ref<HTMLElement | null>(null)
const dragOffset = ref(0)

let dragging = false
let dragStartY = 0
let restoreScroll = ''

/** Past this the sheet is dismissed rather than snapped back. */
const DISMISS_DISTANCE = 96

const actionLabel = computed(() =>
  props.resultCount === 1
    ? t('hotels.showResultsOne')
    : t('hotels.showResults', { count: props.resultCount }),
)

function close(): void {
  open.value = false
}

function onCancel(event: Event): void {
  event.preventDefault()
  close()
}

function onPointerDown(event: PointerEvent): void {
  dragging = true
  dragStartY = event.clientY
  sheet.value?.setPointerCapture(event.pointerId)
}

function onPointerMove(event: PointerEvent): void {
  if (!dragging) return
  dragOffset.value = Math.max(0, event.clientY - dragStartY)
}

function onPointerUp(): void {
  if (!dragging) return
  dragging = false
  if (dragOffset.value > DISMISS_DISTANCE) close()
  dragOffset.value = 0
}

watch(
  open,
  (isOpen) => {
    const el = sheet.value
    if (!el) return

    if (isOpen) {
      returnFocusTo.value = document.activeElement as HTMLElement | null
      // showModal() makes the page behind inert but not unscrollable.
      restoreScroll = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      el.showModal()
    }
    else if (el.open) {
      el.close()
      document.body.style.overflow = restoreScroll
      returnFocusTo.value?.focus()
    }
  },
  { immediate: true, flush: 'post' },
)

onScopeDispose(() => {
  document.body.style.overflow = restoreScroll
})
</script>

<template>
  <dialog
    ref="sheet"
    class="border-rule bg-surface open:flex mx-0 mt-auto mb-0 max-h-[85dvh] w-full max-w-none flex-col rounded-none border-t p-0"
    :style="{
      transform: dragOffset ? `translateY(${dragOffset}px)` : undefined,
      transition: dragging ? 'none' : 'transform 240ms cubic-bezier(0.2, 0, 0, 1)',
    }"
    :aria-label="$t('hotels.filterPanel')"
    @cancel="onCancel"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
  >
    <div
      class="touch-none shrink-0 cursor-grab px-5 pt-3 pb-2"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
    >
      <div
        aria-hidden="true"
        class="bg-rule-strong mx-auto h-1 w-10 rounded-sm"
      />

      <div class="mt-3 flex items-center justify-between gap-4">
        <h2 class="font-display text-lg">
          {{ $t('hotels.filterPanel') }}
        </h2>
        <button
          type="button"
          class="text-fg-muted hover:text-fg flex h-11 w-11 items-center justify-center rounded-sm transition-colors duration-150"
          :aria-label="$t('hotels.closeFilters')"
          @click="close"
        >
          <svg
            viewBox="0 0 16 16"
            width="14"
            height="14"
            aria-hidden="true"
            focusable="false"
          >
            <path
              d="M3.5 3.5l9 9M12.5 3.5l-9 9"
              stroke="currentColor"
              stroke-width="1.5"
            />
          </svg>
        </button>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto px-5 pb-2">
      <HotelFilters
        v-model="filters"
        :result-count="resultCount"
        :show-summary="false"
      />
    </div>

    <div class="border-rule shrink-0 border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <BaseButton
        variant="primary"
        size="md"
        class="w-full"
        @click="close"
      >
        {{ actionLabel }}
      </BaseButton>
    </div>
  </dialog>
</template>
