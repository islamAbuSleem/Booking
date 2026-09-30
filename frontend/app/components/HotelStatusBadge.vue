<script setup lang="ts">
/**
 * Listing status badge. Same square wash treatment as the booking badge, one
 * line always. Shared by the host property table (T10) and the admin queue
 * (T11) — the second occurrence, so it is extracted, not copied.
 */
defineProps<{
  status: 'PENDING' | 'PUBLISHED' | 'REJECTED' | 'SUSPENDED'
}>()

const toneFor: Record<string, 'neutral' | 'success' | 'warning' | 'danger'> = {
  PENDING: 'warning',
  PUBLISHED: 'success',
  REJECTED: 'danger',
  SUSPENDED: 'neutral',
}

const keyFor: Record<string, string> = {
  PENDING: 'status.pending',
  PUBLISHED: 'status.published',
  REJECTED: 'status.rejected',
  SUSPENDED: 'status.suspended',
}
</script>

<template>
  <BaseBadge :status="toneFor[status] ?? 'neutral'">
    {{ $t(keyFor[status] ?? 'status.pending') }}
  </BaseBadge>
</template>
