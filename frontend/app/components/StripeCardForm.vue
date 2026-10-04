<script setup lang="ts">
/**
 * The card field. A single Stripe Card Element mounted client-side on first render —
 * Stripe.js injects its own iframe, so no card data ever touches our DOM, our state,
 * or our API. The parent drives payment through the exposed `pay()`: the component
 * owns the element, the page owns the flow.
 *
 * Square container with a hairline border, matching the inputs around it. The element
 * itself gets the functional typeface at form size; brand tokens stay out because
 * Stripe renders the iframe from concrete values, not our CSS.
 */
import { loadStripe, type Stripe, type StripeCardElement } from '@stripe/stripe-js'

const props = defineProps<{
  clientSecret: string
}>()

const emit = defineEmits<{
  change: [complete: boolean, error: string]
}>()

const mountPoint = ref<HTMLElement | null>(null)
let stripe: Stripe | null = null
let element: StripeCardElement | null = null

onMounted(async () => {
  const key = useRuntimeConfig().public.stripePublishableKey as string
  if (!key || !mountPoint.value) return
  stripe = await loadStripe(key)
  if (!stripe || !mountPoint.value) return
  element = stripe.elements().create('card', {
    hidePostalCode: true,
    style: {
      base: {
        'color': '#1F1B16',
        'fontFamily': '"Archivo", system-ui, sans-serif',
        'fontSize': '16px',
        '::placeholder': { color: '#6B6259' },
      },
      invalid: { color: '#A63D22' },
    },
  })
  element.mount(mountPoint.value)
  element.on('change', (event) => {
    emit('change', event.complete, event.error?.message ?? '')
  })
})

onUnmounted(() => {
  element?.unmount()
  element = null
})

/**
 * Confirms the intent behind `clientSecret` with the mounted card. A card decline is
 * data (`ok: false` + Stripe's message), not a throw — the page shows it beside a
 * retry that calls this again. Only a missing element (script blocked, key missing)
 * reports unavailability instead.
 *
 * `return_url` is mandatory for any card that needs 3-D Secure: without it that
 * authentication redirect has nowhere to come back to and the payment fails with an
 * error the guest cannot act on. `redirect: 'if_required'` keeps the common
 * non-redirecting card on this page, so only a card that actually challenges leaves it —
 * and this page recovers on re-entry by re-reading the booking from the API.
 */
async function pay(): Promise<{ ok: true } | { ok: false, message: string }> {
  if (!stripe || !element) {
    return { ok: false, message: 'unavailable' }
  }
  const result = await stripe.confirmCardPayment(props.clientSecret, {
    payment_method: { card: element },
    return_url: window.location.href,
    redirect: 'if_required',
  })
  if (result.error) {
    return { ok: false, message: result.error.message ?? 'declined' }
  }
  return { ok: true }
}

defineExpose({ pay })
</script>

<template>
  <div
    ref="mountPoint"
    class="border-rule-strong bg-surface min-h-[52px] rounded-sm border px-3 py-3"
  />
</template>
