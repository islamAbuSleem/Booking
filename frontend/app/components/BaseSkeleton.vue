<script setup lang="ts">
/**
 * Loading placeholder. No shimmer: it animates continuously for as long as the page
 * is loading, which is exactly the motion the design language rules out. A static
 * block reads as content, not as a promise.
 */
withDefaults(defineProps<{ rows?: number }>(), { rows: 1 })
</script>

<template>
  <div
    class="bg-surface-alt rounded-none"
    :aria-busy="true"
    :aria-label="$t('common.loading')"
  >
    <div
      v-for="row in rows"
      :key="row"
      class="border-rule h-4 border-b last:border-b-0"
      :style="{ width: `${100 - row * 7}%` }"
    />
  </div>
</template>
