<script setup lang="ts">
/**
 * Gallery lightbox.
 *
 * `BaseModal` supplies the parts that are easy to get wrong by hand: the top layer,
 * the focus trap, `Escape`, and returning focus to the thumbnail that opened it. What
 * it does not supply is positional navigation, so the arrow keys are handled here and
 * only while the lightbox is open — a gallery that eats arrow keys while closed would
 * break every other page it is on.
 *
 * Navigation wraps. There is no first or last, so a user never lands on a dead arrow.
 */
import type { ApiHotelImage } from '~/utils/api'
import { wholeNumber } from '~/utils/format'

const open = defineModel<boolean>('open', { required: true })

const props = defineProps<{ images: ApiHotelImage[], startIndex: number }>()

const current = ref(0)
const total = computed(() => props.images.length)
const image = computed(() => props.images[current.value])

watch(open, (isOpen, wasOpen) => {
  if (isOpen) current.value = Math.min(Math.max(props.startIndex, 0), Math.max(0, total.value - 1))
  if (isOpen === wasOpen) return

  if (isOpen) window.addEventListener('keydown', onKeydown)
  else window.removeEventListener('keydown', onKeydown)
})

onScopeDispose(() => window.removeEventListener('keydown', onKeydown))

function step(offset: number): void {
  if (total.value < 2) return
  current.value = (current.value + offset + total.value) % total.value
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    step(-1)
  }
  else if (event.key === 'ArrowRight') {
    event.preventDefault()
    step(1)
  }
}

function select(index: number): void {
  current.value = index
}
</script>

<template>
  <BaseModal
    v-model:open="open"
    :title="$t('detail.gallery')"
    :label-close="$t('detail.closeGallery')"
  >
    <figure
      v-if="image"
      class="flex flex-col gap-3"
    >
      <img
        :src="image.url"
        :alt="image.altText ?? ''"
        :width="image.width"
        :height="image.height"
        decoding="async"
        class="aspect-[16/9] w-full bg-surface-alt object-contain"
      >

      <div class="flex items-center justify-between gap-3">
        <button
          type="button"
          class="border-rule text-fg-muted hover:border-fg hover:text-fg flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border transition-colors duration-150 disabled:opacity-30"
          :disabled="total < 2"
          :aria-label="$t('detail.previousPhoto')"
          @click="step(-1)"
        >
          <svg
            viewBox="0 0 16 16"
            width="14"
            height="14"
            aria-hidden="true"
            focusable="false"
          >
            <path
              d="M10 3L5 8l5 5"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
            />
          </svg>
        </button>

        <p
          class="tabular text-fg-muted text-sm"
          aria-live="polite"
        >
          {{ $t('detail.photoPosition', { current: wholeNumber(current + 1), total: wholeNumber(total) }) }}
        </p>

        <button
          type="button"
          class="border-rule text-fg-muted hover:border-fg hover:text-fg flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border transition-colors duration-150 disabled:opacity-30"
          :disabled="total < 2"
          :aria-label="$t('detail.nextPhoto')"
          @click="step(1)"
        >
          <svg
            viewBox="0 0 16 16"
            width="14"
            height="14"
            aria-hidden="true"
            focusable="false"
          >
            <path
              d="M6 3l5 5-5 5"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
            />
          </svg>
        </button>
      </div>

      <ul
        v-if="total > 1"
        class="grid grid-cols-4 gap-2"
      >
        <li
          v-for="(entry, index) in images"
          :key="entry.url"
        >
          <button
            type="button"
            class="block w-full overflow-hidden"
            :class="index === current ? 'border-accent border-2' : 'border-transparent border-2'"
            :aria-current="index === current ? 'true' : undefined"
            @click="select(index)"
          >
            <img
              :src="entry.url"
              :alt="entry.altText ?? ''"
              :width="entry.width"
              :height="entry.height"
              loading="lazy"
              decoding="async"
              class="aspect-[4/3] w-full object-cover"
            >
          </button>
        </li>
      </ul>
    </figure>
  </BaseModal>
</template>
