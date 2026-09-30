<script setup lang="ts">
/**
 * Order summary. Hairline-ruled rows, every figure tabular and right-aligned,
 * the total the only emphasised row. Shared by the booking flow (T7) and the
 * booking detail (T8) — the second occurrence, so it is extracted, not copied.
 *
 * Amounts arrive as integer cents already priced by the server (T18) and are formatted
 * payable-style in the currency it quoted: 2 decimals, symbol first. `nightlyCents` is
 * nullable so a rate the response did not carry renders as "—", never as $0.
 */
import { payableCents, wholeNumber } from '~/utils/format'

const props = withDefaults(
  defineProps<{
    nightlyCents: number | null
    nights: number
    subtotalCents: number
    feesCents: number
    totalCents: number
    currency?: string
  }>(),
  { currency: 'USD' },
)
</script>

<template>
  <div>
    <dl class="flex flex-col">
      <div class="border-rule flex items-baseline justify-between gap-4 border-b py-3">
        <dt class="text-fg-muted text-sm">
          {{
            $t('booking.rateLine', {
              rate: nightlyCents === null ? '—' : payableCents(nightlyCents, props.currency),
              count: wholeNumber(nights),
            })
          }}
        </dt>
        <dd class="tabular text-sm">
          {{ payableCents(subtotalCents, props.currency) }}
        </dd>
      </div>

      <div class="border-rule flex items-baseline justify-between gap-4 border-b py-3">
        <dt class="text-fg-muted text-sm">
          {{ $t('booking.feesLine') }}
        </dt>
        <dd class="tabular text-sm">
          {{ payableCents(feesCents, props.currency) }}
        </dd>
      </div>

      <div class="flex items-baseline justify-between gap-4 pt-4">
        <dt class="text-fg-muted text-label uppercase">
          {{ $t('booking.total') }}
        </dt>
        <dd class="tabular font-display text-price-lg">
          {{ payableCents(totalCents, props.currency) }}
        </dd>
      </div>
    </dl>
  </div>
</template>
