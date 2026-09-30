<script setup lang="ts">
type Status = 'neutral' | 'success' | 'warning' | 'danger' | 'accent'

/**
 * Status badge. Square-cornered at 2px — D23 struck pill shapes from the system
 * entirely, so there is deliberately no `rounded-full` variant here.
 */
const statusClasses: Record<Status, string> = {
  neutral: 'bg-surface-alt text-fg-muted border-rule',
  success: 'bg-success-wash text-success border-success',
  warning: 'bg-warning-wash text-warning border-warning',
  danger: 'bg-danger-wash text-danger border-danger',
  accent: 'bg-accent-wash text-accent border-accent',
}

defineProps<{ status?: Status }>()
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-0.5 text-label whitespace-nowrap uppercase"
    :class="statusClasses[status ?? 'neutral']"
  >
    <slot />
  </span>
</template>
