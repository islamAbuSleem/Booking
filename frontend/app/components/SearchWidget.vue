<script setup lang="ts">
/**
 * The primary conversion control on the site. It gets real space: a bordered panel
 * with a 2x2 field grid, not a cramped single row. That was a specific defect in the
 * design references — see the corrected prompt in context/stitch-prompts.md.
 */
import { localToday } from '~/utils/date'

const router = useRouter()
const route = useRoute()
const { t } = useI18n()

const destination = ref('')
const checkIn = ref('')
const checkOut = ref('')
const guests = ref(2)

/** Restore from the query string so a shared or reloaded URL reproduces the search. */
onMounted(() => {
  const q = route.query
  destination.value = typeof q.city === 'string' ? q.city : ''
  checkIn.value = typeof q.checkIn === 'string' ? q.checkIn : ''
  checkOut.value = typeof q.checkOut === 'string' ? q.checkOut : ''
  const g = Number.parseInt(typeof q.guests === 'string' ? q.guests : '', 10)
  if (Number.isFinite(g) && g > 0) guests.value = Math.min(g, 20)
})

/** Checkout cannot precede check-in, so it stays disabled until check-in is set. */
const checkOutEnabled = computed(() => checkIn.value.length > 0)

const rangeError = computed(() => {
  if (!checkIn.value || !checkOut.value) return ''
  return checkOut.value > checkIn.value ? '' : t('search.invalidRange')
})

const today = localToday()

const incrementGuests = (): void => {
  guests.value = Math.min(20, guests.value + 1)
}

const decrementGuests = (): void => {
  guests.value = Math.max(1, guests.value - 1)
}

const submit = async (): Promise<void> => {
  if (rangeError.value) return
  await router.push({
    path: '/hotels',
    query: {
      ...(destination.value ? { city: destination.value } : {}),
      ...(checkIn.value ? { checkIn: checkIn.value } : {}),
      ...(checkOut.value ? { checkOut: checkOut.value } : {}),
      guests: String(guests.value),
    },
  })
}
</script>

<template>
  <form
    class="border-rule bg-surface rounded-none border p-5"
    novalidate
    @submit.prevent="submit"
  >
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div class="flex flex-col gap-2">
        <label
          for="search-destination"
          class="text-fg-muted text-label uppercase"
        >
          {{ $t('search.destination') }}
        </label>
        <input
          id="search-destination"
          v-model="destination"
          type="search"
          :placeholder="$t('search.destinationPlaceholder')"
          class="text-fg placeholder:text-fg-subtle border-rule-strong bg-surface h-12 w-full rounded-sm border px-3 text-sm focus:border-fg focus:outline-none"
        >
      </div>

      <div class="flex flex-col gap-2">
        <span
          id="search-guests-label"
          class="text-fg-muted text-label uppercase"
        >
          {{ $t('search.guests') }}
        </span>
        <div class="border-rule-strong bg-surface flex h-12 items-center justify-between rounded-sm border px-3">
          <span class="tabular text-sm">
            {{ $t('search.guestsMany', { count: guests }) }}
          </span>
          <span class="flex items-center gap-2">
            <button
              type="button"
              class="border-rule text-fg-muted hover:border-fg h-8 w-8 rounded-sm border text-sm disabled:opacity-40"
              :disabled="guests <= 1"
              :aria-label="$t('search.guests') + ' −'"
              @click="decrementGuests"
            >
              −
            </button>
            <button
              type="button"
              class="border-rule text-fg-muted hover:border-fg h-8 w-8 rounded-sm border text-sm disabled:opacity-40"
              :disabled="guests >= 20"
              :aria-label="$t('search.guests') + ' +'"
              @click="incrementGuests"
            >
              +
            </button>
          </span>
        </div>
      </div>

      <div class="flex flex-col gap-2">
        <label
          for="search-check-in"
          class="text-fg-muted text-label uppercase"
        >
          {{ $t('search.checkIn') }}
        </label>
        <input
          id="search-check-in"
          v-model="checkIn"
          type="date"
          :min="today"
          class="text-fg border-rule-strong bg-surface h-12 w-full rounded-sm border px-3 text-sm focus:border-fg focus:outline-none"
        >
      </div>

      <div class="flex flex-col gap-2">
        <label
          for="search-check-out"
          class="text-fg-muted text-label uppercase"
        >
          {{ $t('search.checkOut') }}
        </label>
        <input
          id="search-check-out"
          v-model="checkOut"
          type="date"
          :min="checkIn || today"
          :disabled="!checkOutEnabled"
          :aria-invalid="Boolean(rangeError)"
          :aria-describedby="rangeError ? 'search-range-error' : undefined"
          class="text-fg border-rule-strong bg-surface h-12 w-full rounded-sm border px-3 text-sm focus:border-fg focus:outline-none disabled:opacity-50"
        >
      </div>
    </div>

    <p
      v-if="rangeError"
      id="search-range-error"
      role="alert"
      class="text-danger mt-3 text-sm"
    >
      {{ rangeError }}
    </p>

    <button
      type="submit"
      class="mt-5 flex h-12 w-full items-center justify-center rounded-sm bg-accent text-sm font-medium text-surface transition-colors duration-150 hover:bg-accent-hover disabled:opacity-60"
      :disabled="Boolean(rangeError)"
    >
      {{ $t('search.submit') }}
    </button>

    <p class="text-fg-subtle mt-3 text-center text-sm">
      {{ $t('search.freeCancellationNote') }}
    </p>
  </form>
</template>
