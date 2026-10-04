<script setup lang="ts">
/**
 * /dashboard/host/[id]/edit — edit the listing, its rooms, and its blackout
 * date ranges. Blackout ranges are inclusive date spans that must not overlap
 * each other; the overlap check runs on every add.
 *
 * T22: the API is the primary source. The listing and each room PATCH in one
 * batch; blackouts diff against what the server returned (removed ids DELETE,
 * new ranges POST). A 403 `NOT_HOTEL_OWNER` renders the same not-found state as
 * an unknown id — the page must not confirm that someone else's listing exists.
 * Transport failure or 401 falls back to the fixtures with a local-only save.
 *
 * Two honest limits, both owned by the API rather than hidden by the form:
 * nightly prices have no write endpoint until multi-currency (T39), so the price
 * reads as a locked line instead of an editable field; hotel-scoped blackouts
 * (`roomId: null`) are not returned by the detail payload, so only room-scoped
 * ones seed the list.
 */
import { HOTEL_BY_ID } from '~/utils/mock'
import { createBlackout, deleteBlackout, fetchMyHotel, isApiError, isApiFailure, updateHotel, updateRoom } from '~/utils/api'
import type { ApiHostHotelDetail } from '~/utils/api'
import { formatStayDate, usd } from '~/utils/format'

definePageMeta({ layout: 'dashboard', middleware: 'auth' })

const route = useRoute()
const { t } = useI18n()

const id = computed(() => String(route.params.id ?? ''))

type HotelStatus = 'PENDING' | 'PUBLISHED' | 'REJECTED' | 'SUSPENDED'

/**
 * The one status a host may set here. Publishing (and the other moderation outcomes) is the
 * admin's decision, so `PUBLISHED` is never offered — offering it would sell a control that
 * always answers 403.
 */
const HOST_SETTABLE_STATUS: HotelStatus = 'SUSPENDED'

const STATUS_LABEL_KEYS: Record<HotelStatus, string> = {
  PENDING: 'status.pending',
  PUBLISHED: 'status.published',
  REJECTED: 'status.rejected',
  SUSPENDED: 'status.suspended',
}

interface RoomEdit {
  id: string
  name: string
  maxGuests: number
  /** Display only — prices have no write endpoint until T39. */
  priceDollars: number
}

interface Blackout {
  /** Null until the server returns an id for it. */
  id: string | null
  roomId: string | null
  from: string
  to: string
}

interface EditPayload {
  hotel: ApiHostHotelDetail | null
}

const {
  data,
  status: fetchStatus,
  error: fetchError,
  refresh,
} = await useAsyncData<EditPayload>(
  () => `host:hotel:${id.value}`,
  async (): Promise<EditPayload> => {
    try {
      return { hotel: await fetchMyHotel(id.value) }
    }
    catch (fetchErr: unknown) {
      // Someone else's listing — or no such listing — is the not-found page, never an
      // error state and never a fixture: fixtures must not stand in for access control.
      if (isApiError(fetchErr) && (fetchErr.code === 'NOT_HOTEL_OWNER' || fetchErr.code === 'HOTEL_NOT_FOUND')) {
        return { hotel: null }
      }
      if (isApiFailure(fetchErr) && (!isApiError(fetchErr) || fetchErr.code !== 'UNAUTHORIZED')) {
        throw fetchErr
      }
      const mock = HOTEL_BY_ID.get(id.value)
      return {
        hotel: mock
          ? {
              id: mock.id,
              slug: mock.slug,
              name: mock.name,
              description: mock.description,
              addressLine: mock.addressLine,
              city: mock.city,
              country: mock.country,
              lat: 0,
              lng: 0,
              starRating: mock.starRating,
              status: mock.status,
              checkInTime: '15:00',
              checkOutTime: '11:00',
              coverImageUrl: mock.images[0]?.url ?? null,
              images: [],
              amenityIds: [...mock.amenityIds],
              rooms: mock.rooms.map((room, index) => ({
                id: room.id,
                name: room.name,
                description: room.description,
                bedType: room.bedType,
                maxGuests: room.maxGuests,
                totalInventory: 1,
                sortOrder: index,
                prices: [{ currency: 'USD', priceCents: room.pricePerNightCents }],
                images: [],
                blackoutDates: [],
              })),
              host: { id: '', name: '' },
            }
          : null,
      }
    }
  },
)

const hotel = computed(() => data.value?.hotel ?? null)
const isLoading = computed(() => fetchStatus.value === 'pending')
/** A hotel with an empty-string host id came from the fixtures, not the API. */
const isLive = computed(() => (hotel.value?.host.id ?? '') !== '')

interface Blackout {
  /** Null until the server returns an id for it. */
  id: string | null
  roomId: string | null
  from: string
  to: string
}

const hotelName = ref('')
const hotelCity = ref('')
const hotelDescription = ref('')
const hotelStatus = ref<HotelStatus>('PENDING')
/**
 * The status the server last reported. `status` is only sent when the host actually moved
 * it: an untouched field sent anyway makes every save of a live listing a 403
 * (`Only admins can publish listings`), and because the listing PATCH shares a `Promise.all`
 * with the room and blackout writes, those siblings succeed and the batch fails anyway.
 */
const savedStatus = ref<HotelStatus | null>(null)
const rooms = ref<RoomEdit[]>([])
const blackouts = ref<Blackout[]>([])
const newFrom = ref('')
const newTo = ref('')
const blackoutError = ref('')
const saved = ref(false)
const saving = ref(false)
const saveError = ref('')
const initialised = ref(false)

/** Seed the form once — from the API detail, or from the fixture in fallback mode. */
watch(
  hotel,
  (current) => {
    if (!current || initialised.value) return
    hotelName.value = current.name
    hotelCity.value = current.city
    hotelDescription.value = current.description
    hotelStatus.value = current.status
    savedStatus.value = current.status
    rooms.value = current.rooms.map(room => ({
      id: room.id,
      name: room.name,
      maxGuests: room.maxGuests,
      priceDollars: (room.prices.find(price => price.currency === 'USD')?.priceCents ?? 0) / 100,
    }))
    blackouts.value = current.rooms.flatMap(room =>
      room.blackoutDates.map(entry => ({ id: entry.id, roomId: room.id, from: entry.startsOn, to: entry.endsOn })),
    )
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
  // Hotel-scoped until a room picker exists: it closes the listing, not one room.
  blackouts.value.push({ id: null, roomId: null, from: newFrom.value, to: newTo.value })
  blackouts.value.sort((a, b) => a.from.localeCompare(b.from))
  newFrom.value = ''
  newTo.value = ''
}

function removeBlackout(entry: Blackout): void {
  blackouts.value = blackouts.value.filter(candidate => candidate !== entry)
}

/**
 * Persists everything in one batch — the listing, every room, and the blackout diff —
 * then re-reads the server so the form shows what stuck. New blackout ranges POST,
 * ranges removed from the list DELETE by their server id. A failure keeps the form
 * filled and names the problem; nothing is half-applied silently because the refresh
 * only runs after every write resolves.
 */
async function save(): Promise<void> {
  if (saving.value || !hotel.value) return
  saving.value = true
  saveError.value = ''
  try {
    if (!isLive.value) {
      saved.value = true
      return
    }
    const current = hotel.value
    const previousIds = new Set(
      current.rooms.flatMap(room => room.blackoutDates.map(entry => entry.id)),
    )
    const keptIds = new Set(
      blackouts.value.flatMap(entry => (entry.id === null ? [] : [entry.id])),
    )
    await Promise.all([
      updateHotel(current.id, {
        name: hotelName.value.trim(),
        description: hotelDescription.value.trim(),
        city: hotelCity.value.trim(),
        ...(hotelStatus.value === savedStatus.value ? {} : { status: hotelStatus.value }),
      }),
      ...rooms.value.map(room =>
        updateRoom(room.id, { name: room.name.trim(), maxGuests: room.maxGuests }),
      ),
      ...[...previousIds].filter(serverId => !keptIds.has(serverId)).map(serverId => deleteBlackout(serverId)),
      ...blackouts.value
        .filter(entry => entry.id === null)
        .map(entry =>
          createBlackout(current.id, { roomId: entry.roomId, startsOn: entry.from, endsOn: entry.to, reason: null }),
        ),
    ])
    await refresh()
    saved.value = true
  }
  catch (error: unknown) {
    saveError.value = isApiError(error) ? error.message : t('common.unexpectedError')
  }
  finally {
    saving.value = false
  }
}

const statusOptions = computed(() => {
  // The listing's current status stays in the list so an already-published listing shows
  // its real value instead of a blank control; it is a reading of the state, not a target
  // a host can pick. The only other choice is the one status they may set.
  const current = hotelStatus.value
  const options = [{ value: current, label: t(STATUS_LABEL_KEYS[current]) }]
  if (current !== HOST_SETTABLE_STATUS) {
    options.push({ value: HOST_SETTABLE_STATUS, label: t(STATUS_LABEL_KEYS[HOST_SETTABLE_STATUS]) })
  }
  return options
})

useSeoMeta({
  title: () => `${t('host.editTitle')} · ${t('common.brand')}`,
  robots: 'noindex, nofollow',
})
</script>

<template>
  <div>
    <BaseAlert
      v-if="fetchError"
      tone="danger"
      class="max-w-[720px]"
    >
      {{ $t('common.unexpectedError') }}
    </BaseAlert>

    <div v-else-if="isLoading">
      <BaseSkeleton :rows="8" />
    </div>

    <template v-else-if="hotel">
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
                <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                </div>
                <p class="tabular text-fg-muted mt-3 text-sm">
                  {{ usd(room.priceDollars * 100) }} {{ $t('hotel.perNight') }} ·
                  {{ $t('host.roomPriceLocked') }}
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
                  :key="entry.id ?? `new-${entry.from}-${entry.to}`"
                  class="border-rule bg-surface flex flex-wrap items-center justify-between gap-3 rounded-none border px-4 py-3"
                >
                  <span class="tabular text-sm">{{ formatStayDate(entry.from) }} – {{ formatStayDate(entry.to) }}</span>
                  <button
                    type="button"
                    class="text-danger px-2 py-1 text-sm underline-offset-4 hover:underline"
                    :aria-label="$t('host.removeBlackout', { from: entry.from, to: entry.to })"
                    @click="removeBlackout(entry)"
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
            <BaseAlert
              v-if="saveError"
              tone="danger"
              class="mb-4 max-w-[720px]"
            >
              {{ saveError }}
            </BaseAlert>
            <BaseButton
              variant="primary"
              size="lg"
              :loading="saving"
              :disabled="saving"
              @click="save"
            >
              {{ saving ? $t('host.saving') : $t('common.save') }}
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
