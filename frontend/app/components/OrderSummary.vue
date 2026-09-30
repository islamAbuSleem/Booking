<script setup lang="ts">
/**
 * Order summary. Hairline-ruled rows, every figure tabular and right-aligned,
 * the total the only emphasised row. Shared by the booking flow (T7) and the
 * booking detail (T8) — the second occurrence, so it is extracted, not copied.
 *
 * Amounts arrive as integer cents and are formatted payable-style (2 decimals).
 */
import { usdCents, wholeNumber } from '~/utils/format'

defineProps<{
  nightlyCents: number
  nights: number
  subtotalCents: number
  feesCents: number
  totalCents: number
}>()
</script>

<template>
  <div>
    <dl class="flex flex-col">
      <div class="border-rule flex items-baseline justify-between gap-4 border-b py-3">
        <dt class="text-fg-muted text-sm">
          {{ $t('booking.rateLine', { rate: usdCents(nightlyCents), count: wholeNumber(nights) }) }}
        </dt>
        <dd class="tabular text-sm">
          {{ usdCents(subtotalCents) }}
        </dd>
      </div>

      <div class="border-rule flex items-baseline justify-between gap-4 border-b py-3">
        <dt class="text-fg-muted text-sm">
          {{ $t('booking.feesLine') }}
        </dt>
        <dd class="tabular text-sm">
          {{ usdCents(feesCents) }}
        </dd>
      </div>

      <div class="flex items-baseline justify-between gap-4 pt-4">
        <dt class="text-fg-muted text-label uppercase">
          {{ $t('booking.total') }}
        </dt>
        <dd class="tabular font-display text-price-lg">
          {{ usdCents(totalCents) }}
        </dd>
      </div>
    </dl>
  </div>
</template>
