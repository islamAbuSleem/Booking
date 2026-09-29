<script setup lang="ts">
withDefaults(defineProps<{ label?: string, size?: 'sm' | 'md' | 'lg' }>(), { size: 'md' })

const sizeClasses = { sm: 'h-4 w-4', md: 'h-6 w-6', lg: 'h-8 w-8' }
</script>

<template>
  <span
    class="text-fg-muted inline-flex items-center justify-center"
    :class="sizeClasses[size]"
    role="status"
    :aria-label="label ?? $t('common.loading')"
  >
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      class="h-full w-full animate-spin"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        stroke-width="1.5"
        opacity="0.25"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
      />
    </svg>
  </span>
</template>
