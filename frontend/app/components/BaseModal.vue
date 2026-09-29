<script setup lang="ts">
/**
 * Modal. Traps focus while open, restores it on close, and closes on Escape.
 * Uses <dialog> so the browser handles the top layer and the backdrop for us —
 * no focus-trap library needed, and no `inert` bookkeeping.
 */
const props = withDefaults(defineProps<{ open: boolean, title: string, labelClose?: string }>(), {
  labelClose: 'Close',
})

const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const dialog = ref<HTMLDialogElement | null>(null)
const previouslyFocused = ref<HTMLElement | null>(null)

const onCancel = (event: Event): void => {
  event.preventDefault()
  close()
}

const close = (): void => {
  emit('update:open', false)
}

watch(
  () => props.open,
  async (open) => {
    const el = dialog.value
    if (!el) return

    if (open) {
      previouslyFocused.value = document.activeElement as HTMLElement | null
      el.showModal()
    }
    else if (el.open) {
      el.close()
      previouslyFocused.value?.focus()
    }
  },
  { immediate: true },
)
</script>

<template>
  <dialog
    ref="dialog"
    class="bg-surface border-rule m-auto w-[min(560px,calc(100vw-2rem))] rounded-none border p-0 backdrop:bg-surface-inv/40"
    @cancel="onCancel"
  >
    <div class="border-rule flex items-center justify-between border-b px-6 py-4">
      <h2 class="font-display text-lg">
        {{ title }}
      </h2>
      <button
        type="button"
        class="text-fg-muted hover:text-fg px-2 text-sm"
        :aria-label="labelClose"
        @click="close"
      >
        ✕
      </button>
    </div>

    <div class="px-6 py-5">
      <slot />
    </div>
  </dialog>
</template>
