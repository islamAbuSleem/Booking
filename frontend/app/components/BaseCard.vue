<script setup lang="ts">
/**
 * The only card in the system: square corners, a hairline border, no shadow.
 * Depth in this design language comes from `--color-rule` and whitespace, never
 * from elevation. See context/design.md.
 */
defineProps<{ as?: 'div' | 'article' | 'li', interactive?: boolean }>()
</script>

<template>
  <component
    :is="as ?? 'div'"
    class="bg-surface border-rule rounded-none border"
    :class="interactive ? 'hover:border-fg transition-colors duration-150' : ''"
  >
    <slot />
  </component>
</template>
