<script setup lang="ts">
/**
 * /dashboard/host/[id]/edit — edit the listing, its rooms, and its blackout
 * date ranges. Blackout ranges are inclusive date spans that must not overlap
 * each other; the overlap check runs on every add. Everything is local state
 * until the host API (T22) persists it.
 */
import { HOTEL_BY_ID } from '~/utils/mock'
import { formatStayDate, usd } from '~/utils/format'

definePageMeta({ layout: 'dashboard', middleware: 'auth' })

const route = useRoute()
const { t } = useI18n()

const id = computed(() => String(route.params.id ?? ''))
const hotel = computed(() => HOTEL_BY_ID.get(id.value))

interface RoomEdit {
  id: string
  name: string
  maxGuests: number
  priceDollars: number
}

interface Blackout {
  key: number
  from: string
  to: string
}

const hotelName = ref('')
const hotelCity = ref('')
const hotelDescription = ref('')
const hotelStatus = ref<'PENDING' | 'PUBLISHED' | 'REJECTED' | 'SUSPENDED'>('PENDING')
const rooms = ref<RoomEdit[]>([])
const blackouts = ref<Blackout[]>([])
const blackoutKey = ref(0)
const newFrom = ref('')
const newTo = ref('')
const blackoutError = ref('')
const saved = ref(false)
const initialised = ref(false)

/** Seed the form once the fixture resolves. */
watch(
  hotel,
  (current) => {
    if (!current || initialised.value) return
    hotelName.value = current.name
    hotelCity.value = current.city
    hotelDescription.value = current.description
    hotelStatus.value = current.status
    rooms.value = current.rooms.map(room => ({
      id: room.id,
      name: room.name,
      maxGuests: room.maxGuests,
      priceDollars: room.pricePerNightCents / 100,
    }))
    initialised.value = true
  },
  { immediate: true },
)

/** Inclusive ranges overlap when each starts before the other ends. */
function overlaps(a: Blackout, from: string, to: string): boolean {
  return a.from <= to && from <= a.to
}

function addBlackout(): void {
  blackoutError.value = ''
  if (!newFrom.value || !newTo.value || newTo.value < newFrom.value) {
    blackoutError.value = t('host.blackoutInvalid')
    return
  }
  const clash = blackouts.value.some(entry => overlaps(entry, newFrom.value, newTo.value))
  if (clash) {
    blackoutError.value = t('host.blackoutOverlap')
    return
  }
  blackoutKey.value += 1
  blackouts.value.push({ key: blackoutKey.value, from: newFrom.value, to: newTo.value })
  blackouts.value.sort((a, b) => a.from.localeCompare(b.from))
  newFrom.value = ''
  newTo.value = ''
}

function removeBlackout(key: number): void {
  blackouts.value = blackouts.value.filter(entry => entry.key !== key)
}

function save(): void {
  // Mock mutation: the form state IS the saved state. The host API persists it.
  saved.value = true
}

const statusOptions = computed(() => [
  { value: 'PENDING', label: t('status.pending') },
  { value: 'PUBLISHED', label: t('status.published') },
  { value: 'REJECTED', label: t('status.rejected') },
  { value: 'SUSPENDED', label: t('status.suspended') },
])

useSeoMeta({
  title: () => `${t('host.editTitle')} · ${t('common.brand')}`,
  robots: 'noindex, nofollow',
})
</script>

<template>
  <div>
    <template v-if="hotel">
      <nav
        class="text-fg-muted text-sm"
        :aria-label="$t('booking.breadcrumb')"
      >
        <NuxtLink
          to="/dashboard/host"
          class="hover:text-fg"
        >
          {{ $t('host.title') }}
        </NuxtLink>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">{{ hotel.name }}</span>
      </nav>

      <div class="mt-4 flex flex-wrap items-center gap-4">
        <h1 class="font-display text-display-l">
          {{ $t('host.editTitle') }}
        </h1>
        <HotelStatusBadge :status="hotelStatus" />
      </div>

      <BaseAlert
        v-if="saved"
        tone="success"
        :title="$t('host.savedTitle')"
        class="mt-6 max-w-[720px]"
      >
        {{ $t('host.savedBody', { name: hotelName.trim() || hotel.name }) }}
      </BaseAlert>

      <div class="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-12">
        <div class="flex flex-col gap-10 lg:col-span-7">
          <!-- Listing. -->
          <section aria-labelledby="edit-listing">
            <h2
              id="edit-listing"
              class="text-fg-muted text-label uppercase"
            >
              {{ $t('host.listingHeading') }}
            </h2>
            <div class="border-rule mt-3 flex flex-col gap-4 border-t pt-6">
              <BaseInput
                id="edit-name"
                v-model="hotelName"
                type="text"
                :label="$t('host.fieldName')"
              />
              <BaseInput
                id="edit-city"
                v-model="hotelCity"
                type="text"
                :label="$t('host.fieldCity')"
              />
              <div class="flex flex-col gap-2">
                <label
                  for="edit-description"
                  class="text-fg-muted text-label uppercase"
                >{{ $t('host.fieldDescription') }}</label>
                <textarea
                  id="edit-description"
                  v-model="hotelDescription"
                  rows="5"
                  class="text-fg border-rule-strong bg-surface w-full rounded-sm border px-3 py-3 text-sm focus:border-fg focus:outline-none"
                />
              </div>
              <div class="max-w-[320px]">
                <BaseSelect
                  id="edit-status"
                  v-model="hotelStatus"
                  :label="$t('host.fieldStatus')"
                  :options="statusOptions"
                />
              </div>
            </div>
          </section>

          <!-- Rooms. -->
          <section aria-labelledby="edit-rooms">
            <h2
              id="edit-rooms"
              class="text-fg-muted text-label uppercase"
            >
              {{ $t('host.roomsHeading') }}
            </h2>
            <ul class="border-rule mt-3 flex flex-col gap-4 border-t pt-6">
              <li
                v-for="room in rooms"
                :key="room.id"
                class="border-rule bg-surface rounded-none border p-4"
              >
                <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <BaseInput
                    :id="`edit-room-name-${room.id}`"
                    v-model="room.name"
                    type="text"
                    :label="$t('host.roomName')"
                  />
                  <BaseInput
                    :id="`edit-room-guests-${room.id}`"
                    v-model="room.maxGuests"
                    type="number"
                    :label="$t('host.roomGuests')"
                  />
                  <BaseInput
                    :id="`edit-room-price-${room.id}`"
                    v-model="room.priceDollars"
                    type="number"
                    :label="$t('host.roomPrice')"
                  />
                </div>
                <p class="tabular text-fg-muted mt-3 text-sm">
                  {{ usd(room.priceDollars * 100) }} {{ $t('hotel.perNight') }}
                </p>
              </li>
            </ul>
          </section>

          <!-- Blackout dates. -->
          <section aria-labelledby="edit-blackouts">
            <h2
              id="edit-blackouts"
              class="text-fg-muted text-label uppercase"
            >
              {{ $t('host.blackoutsHeading') }}
            </h2>
            <div class="border-rule mt-3 border-t pt-6">
              <p class="text-fg-muted max-w-[68ch] text-sm">
                {{ $t('host.blackoutsHint') }}
              </p>
              <ul
                v-if="blackouts.length"
                class="mt-4 flex flex-col gap-2"
              >
                <li
                  v-for="entry in blackouts"
                  :key="entry.key"
                  class="border-rule bg-surface flex flex-wrap items-center justify-between gap-3 rounded-none border px-4 py-3"
                >
                  <span class="tabular text-sm">{{ formatStayDate(entry.from) }} – {{ formatStayDate(entry.to) }}</span>
                  <button
                    type="button"
                    class="text-danger px-2 py-1 text-sm underline-offset-4 hover:underline"
                    :aria-label="$t('host.removeBlackout', { from: entry.from, to: entry.to })"
                    @click="removeBlackout(entry.key)"
                  >
                    {{ $t('common.remove') }}
                  </button>
                </li>
              </ul>
              <div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <BaseInput
                  id="edit-blackout-from"
                  v-model="newFrom"
                  type="date"
                  :label="$t('host.blackoutFrom')"
                />
                <BaseInput
                  id="edit-blackout-to"
                  v-model="newTo"
                  type="date"
                  :label="$t('host.blackoutTo')"
                  :min="newFrom"
                  :disabled="!newFrom"
                />
              </div>
              <p
                v-if="blackoutError"
                role="alert"
                class="text-danger mt-2 text-sm"
              >
                {{ blackoutError }}
              </p>
              <button
                type="button"
                class="border-rule-strong text-fg hover:border-fg mt-3 flex h-12 items-center justify-center rounded-sm border px-6 text-sm"
                @click="addBlackout"
              >
                {{ $t('host.addBlackout') }}
              </button>
            </div>
          </section>

          <div>
            <BaseButton
              variant="primary"
              size="lg"
              @click="save"
            >
              {{ $t('common.save') }}
            </BaseButton>
          </div>
        </div>

        <!-- Live summary: 5 columns. -->
        <aside class="lg:col-span-5">
          <div class="border-rule bg-surface rounded-none border p-6 lg:sticky lg:top-6">
            <h2 class="text-fg-muted text-label uppercase">
              {{ $t('host.summaryHeading') }}
            </h2>
            <p class="font-display mt-3 text-xl">
              {{ hotelName.trim() || hotel.name }}
            </p>
            <p class="text-fg-muted text-label mt-1 uppercase">
              {{ hotelCity.trim() || hotel.city }}
            </p>
            <dl class="border-rule mt-4 flex flex-col border-t pt-4 text-sm">
              <div class="flex items-baseline justify-between gap-4 py-1.5">
                <dt class="text-fg-muted">
                  {{ $t('host.colRooms') }}
                </dt>
                <dd class="tabular">
                  {{ rooms.length }}
                </dd>
              </div>
              <div class="flex items-baseline justify-between gap-4 py-1.5">
                <dt class="text-fg-muted">
                  {{ $t('host.blackoutsHeading') }}
                </dt>
                <dd class="tabular">
                  {{ blackouts.length }}
                </dd>
              </div>
            </dl>
          </div>
        </aside>
      </div>
    </template>

    <div v-else>
      <h1 class="font-display mt-4 text-display-l">
        {{ $t('detail.notFoundTitle') }}
      </h1>
      <p class="prose-70 text-fg-muted mt-4">
        {{ $t('detail.notFoundBody') }}
      </p>
      <BaseButton
        to="/dashboard/host"
        variant="primary"
        size="lg"
        class="mt-8"
      >
        {{ $t('host.backToProperties') }}
      </BaseButton>
    </div>
  </div>
</template>
