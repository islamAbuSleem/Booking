<script setup lang="ts">
/**
 * Booking status badge. Square (r-sm), wash background, never a solid fill.
 * Vocabulary is fixed — a wrapping badge is a width bug, so `nowrap` holds.
 */
import { STATUS_LABEL_KEY } from '~/utils/mock'

defineProps<{
  status: 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED'
}>()

const toneFor: Record<string, 'neutral' | 'success' | 'warning' | 'danger'> = {
  PENDING: 'warning',
  CONFIRMED: 'success',
  COMPLETED: 'neutral',
  CANCELLED: 'danger',
}
</script>

<template>
  <BaseBadge :status="toneFor[status] ?? 'neutral'">
    {{ $t(STATUS_LABEL_KEY[status]) }}
  </BaseBadge>
</template>
