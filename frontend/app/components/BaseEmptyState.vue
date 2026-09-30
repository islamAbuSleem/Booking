<script setup lang="ts">
/**
 * Empty state. Never renders a bare "No results" — every empty state offers the next
 * action, because a dead end tells the user nothing about what to do instead.
 */
defineProps<{ title: string, hint?: string }>()
</script>

<template>
  <div class="border-rule bg-surface flex flex-col items-center gap-4 border px-6 py-16 text-center">
    <p class="font-display text-display-m text-fg">
      {{ title }}
    </p>
    <p
      v-if="hint"
      class="text-fg-muted max-w-[68ch] text-sm"
    >
      {{ hint }}
    </p>
    <div class="mt-2">
      <slot />
    </div>
  </div>
</template>
