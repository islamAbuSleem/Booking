<script setup lang="ts">
/**
 * Dashboard stat. Hairline-bordered, no ornamentation. The label is one line
 * (`label-caps`, shortest wording that fits) so every number in a row shares
 * a baseline. Shared by the host (T10) and admin (T11) dashboards.
 */
defineProps<{
  label: string
  value: string
  hint?: string
}>()
</script>

<template>
  <div class="border-rule bg-surface rounded-none border p-5">
    <p class="text-fg-muted truncate text-label uppercase">
      {{ label }}
    </p>
    <p class="tabular font-display mt-2 text-price-lg">
      {{ value }}
    </p>
    <p
      v-if="hint"
      class="text-fg-muted mt-1 text-sm"
    >
      {{ hint }}
    </p>
  </div>
</template>
