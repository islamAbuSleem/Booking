<script setup lang="ts">
/**
 * One 16:9 cover plus a 3-up 4:3 row. Every image opens the lightbox, and the whole
 * strip is a real list of buttons so keyboard users get the same gallery as a mouse
 * user — the thumbnails are the controls, not a click handler on a wrapper div.
 *
 * `alt` is content-bearing per ui-tokens.md, so a photograph whose text is the same
 * as its neighbours is decorative and takes `alt=""`.
 */
import type { ApiHotelImage } from '~/utils/api'

const props = defineProps<{ images: ApiHotelImage[] }>()

const emit = defineEmits<{ open: [index: number] }>()

const thumbnails = computed(() => props.images.slice(1, 4))
</script>

<template>
  <div class="flex flex-col gap-2">
    <button
      v-if="images[0]"
      type="button"
      class="group relative block w-full overflow-hidden text-left"
      @click="emit('open', 0)"
    >
      <img
        :src="images[0].url"
        :alt="images[0].altText ?? ''"
        :width="images[0].width"
        :height="images[0].height"
        fetchpriority="high"
        decoding="async"
        class="aspect-[16/9] w-full object-cover"
      >
      <span
        class="border-rule bg-surface text-fg-muted absolute right-3 bottom-3 flex h-11 items-center gap-2 rounded-sm border px-3 text-sm"
      >
        <svg
          viewBox="0 0 16 16"
          width="14"
          height="14"
          aria-hidden="true"
          focusable="false"
        >
          <path
            d="M2.5 5.5V2.5h3M13.5 5.5V2.5h-3M2.5 10.5v3h3M13.5 10.5v3h-3"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
          />
        </svg>
        {{ $t('detail.expandGallery') }}
      </span>
    </button>

    <ul
      v-if="thumbnails.length"
      class="grid grid-cols-3 gap-2"
    >
      <li
        v-for="(image, index) in thumbnails"
        :key="image.url"
      >
        <button
          type="button"
          class="block w-full overflow-hidden"
          @click="emit('open', index + 1)"
        >
          <img
            :src="image.url"
            :alt="image.altText ?? ''"
            :width="image.width"
            :height="image.height"
            loading="lazy"
            decoding="async"
            class="aspect-[4/3] w-full object-cover"
          >
        </button>
      </li>
    </ul>
  </div>
</template>
