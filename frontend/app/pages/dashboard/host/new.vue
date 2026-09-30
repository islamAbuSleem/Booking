<script setup lang="ts">
/**
 * /dashboard/host/new — the listing wizard: details → amenities → photos →
 * room types. Each step validates before advancing. The photo step renders
 * local previews only (`URL.createObjectURL`) — nothing is uploaded anywhere.
 * The finished listing lives in local state; the host API (T22) persists it.
 */
import { AMENITIES } from '~/utils/mock'
import { usd, wholeNumber } from '~/utils/format'

definePageMeta({ layout: 'dashboard', middleware: 'auth' })

const { t } = useI18n()

const STEPS = ['details', 'amenities', 'photos', 'rooms'] as const
type Step = (typeof STEPS)[number]

interface RoomDraft {
  key: number
  name: string
  maxGuests: number
  priceDollars: number
}

const step = ref<Step>('details')
const stepIndex = computed(() => STEPS.indexOf(step.value))

const stepLabels = computed<Record<Step, string>>(() => ({
  details: t('host.stepDetails'),
  amenities: t('host.stepAmenities'),
  photos: t('host.stepPhotos'),
  rooms: t('host.stepRooms'),
}))

const name = ref('')
const city = ref('')
const description = ref('')
const amenityIds = ref<string[]>([])
const previews = ref<{ url: string, name: string }[]>([])
const rooms = ref<RoomDraft[]>([])
const roomKey = ref(0)
const stepError = ref('')
const finished = ref(false)

onUnmounted(() => {
  for (const preview of previews.value) URL.revokeObjectURL(preview.url)
})

function toggleAmenity(id: string): void {
  amenityIds.value = amenityIds.value.includes(id)
    ? amenityIds.value.filter(entry => entry !== id)
    : [...amenityIds.value, id]
}

function onFiles(event: Event): void {
  const input = event.target as HTMLInputElement | null
  const files = input?.files ? [...input.files] : []
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue
    previews.value.push({ url: URL.createObjectURL(file), name: file.name })
  }
  if (input) input.value = ''
}

function removePreview(index: number): void {
  const removed = previews.value[index]
  if (removed) URL.revokeObjectURL(removed.url)
  previews.value.splice(index, 1)
}

function addRoom(): void {
  roomKey.value += 1
  rooms.value.push({ key: roomKey.value, name: '', maxGuests: 2, priceDollars: 0 })
}

function removeRoom(key: number): void {
  rooms.value = rooms.value.filter(room => room.key !== key)
}

function roomError(room: RoomDraft): string {
  if (!room.name.trim()) return t('host.roomNameRequired')
  if (!(room.maxGuests >= 1)) return t('host.roomGuestsRequired')
  if (!(room.priceDollars > 0)) return t('host.roomPriceRequired')
  return ''
}

/** Each step validates before the wizard advances. */
function validateStep(current: Step): boolean {
  if (current === 'details') {
    if (name.value.trim().length < 2) return false
    if (city.value.trim().length < 2) return false
    if (description.value.trim().length < 20) return false
    return true
  }
  if (current === 'rooms') {
    return rooms.value.length > 0 && rooms.value.every(room => !roomError(room))
  }
  return true
}

function next(): void {
  stepError.value = ''
  if (!validateStep(step.value)) {
    stepError.value = t(step.value === 'rooms' ? 'host.roomsInvalid' : 'host.detailsInvalid')
    return
  }
  const nextIndex = Math.min(STEPS.length - 1, stepIndex.value + 1)
  const nextStep = STEPS[nextIndex]
  if (nextStep) step.value = nextStep
}

function back(): void {
  stepError.value = ''
  const prevIndex = Math.max(0, stepIndex.value - 1)
  const prevStep = STEPS[prevIndex]
  if (prevStep) step.value = prevStep
}

function finish(): void {
  stepError.value = ''
  if (!validateStep('rooms')) {
    stepError.value = t('host.roomsInvalid')
    return
  }
  finished.value = true
}

useSeoMeta({
  title: () => `${t('host.newTitle')} · ${t('common.brand')}`,
  robots: 'noindex, nofollow',
})
</script>

<template>
  <div>
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
      <span aria-current="page">{{ $t('host.newTitle') }}</span>
    </nav>

    <h1 class="font-display mt-4 text-display-l">
      {{ $t('host.newTitle') }}
    </h1>

    <BaseAlert
      v-if="finished"
      tone="success"
      :title="$t('host.createdTitle')"
      class="mt-8 max-w-[720px]"
    >
      <p>
        {{
          $t('host.createdBody', {
            name: name.trim(),
            count: wholeNumber(rooms.length),
          })
        }}
      </p>
      <p class="mt-3">
        <NuxtLink
          to="/dashboard/host"
          class="text-link underline-offset-4 hover:underline"
        >
          {{ $t('host.backToProperties') }}
        </NuxtLink>
      </p>
    </BaseAlert>

    <template v-else>
      <!-- Step indicator. -->
      <ol class="border-rule mt-8 flex flex-wrap gap-x-8 gap-y-2 border-b">
        <li
          v-for="(entry, index) in STEPS"
          :key="entry"
          class="text-label border-b-2 px-1 py-3 uppercase"
          :class="index === stepIndex ? 'border-accent text-fg' : 'text-fg-muted border-transparent'"
          :aria-current="index === stepIndex ? 'step' : undefined"
        >
          {{ index + 1 }}. {{ stepLabels[entry] }}
        </li>
      </ol>

      <div class="mt-8 max-w-[720px]">
        <!-- Step 1: details. -->
        <div
          v-if="step === 'details'"
          class="flex flex-col gap-4"
        >
          <BaseInput
            id="wizard-name"
            v-model="name"
            type="text"
            :label="$t('host.fieldName')"
          />
          <BaseInput
            id="wizard-city"
            v-model="city"
            type="text"
            :label="$t('host.fieldCity')"
          />
          <div class="flex flex-col gap-2">
            <label
              for="wizard-description"
              class="text-fg-muted text-label uppercase"
            >{{ $t('host.fieldDescription') }}</label>
            <textarea
              id="wizard-description"
              v-model="description"
              rows="5"
              class="text-fg placeholder:text-fg-subtle border-rule-strong bg-surface w-full rounded-sm border px-3 py-3 text-sm focus:border-fg focus:outline-none"
            />
          </div>
        </div>

        <!-- Step 2: amenities. -->
        <fieldset v-if="step === 'amenities'">
          <legend class="text-fg-muted text-label uppercase">
            {{ $t('host.amenitiesHeading') }}
          </legend>
          <ul class="mt-3 grid grid-cols-1 gap-1 sm:grid-cols-2">
            <li
              v-for="amenity in AMENITIES"
              :key="amenity.id"
            >
              <label class="hover:bg-surface-alt flex min-h-11 cursor-pointer items-center gap-3 rounded-sm px-2 transition-colors duration-150">
                <input
                  type="checkbox"
                  class="accent-accent h-4 w-4 shrink-0 rounded-sm"
                  :checked="amenityIds.includes(amenity.id)"
                  @change="toggleAmenity(amenity.id)"
                >
                <span class="text-sm">{{ amenity.name }}</span>
              </label>
            </li>
          </ul>
        </fieldset>

        <!-- Step 3: photos. Local previews only — no upload. -->
        <div v-if="step === 'photos'">
          <label
            for="wizard-photos"
            class="text-fg-muted text-label uppercase"
          >{{ $t('host.photosHeading') }}</label>
          <input
            id="wizard-photos"
            type="file"
            accept="image/*"
            multiple
            class="border-rule-strong bg-surface mt-3 block w-full rounded-sm border px-3 py-3 text-sm"
            @change="onFiles"
          >
          <p class="text-fg-subtle mt-2 text-sm">
            {{ $t('host.photosHint') }}
          </p>
          <ul
            v-if="previews.length"
            class="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3"
          >
            <li
              v-for="(preview, index) in previews"
              :key="preview.url"
              class="border-rule bg-surface rounded-none border"
            >
              <img
                :src="preview.url"
                :alt="preview.name"
                width="400"
                height="300"
                class="aspect-[4/3] w-full object-cover"
              >
              <div class="flex items-center justify-between gap-2 p-2">
                <span class="min-w-0 truncate text-sm">{{ preview.name }}</span>
                <button
                  type="button"
                  class="text-danger shrink-0 px-2 py-1 text-sm underline-offset-4 hover:underline"
                  :aria-label="$t('host.removePhoto', { name: preview.name })"
                  @click="removePreview(index)"
                >
                  {{ $t('common.remove') }}
                </button>
              </div>
            </li>
          </ul>
          <BaseEmptyState
            v-else
            :title="$t('host.noPhotosTitle')"
            :hint="$t('host.noPhotosHint')"
            class="mt-4"
          />
        </div>

        <!-- Step 4: room types. -->
        <div v-if="step === 'rooms'">
          <ul
            v-if="rooms.length"
            class="flex flex-col gap-4"
          >
            <li
              v-for="room in rooms"
              :key="room.key"
              class="border-rule bg-surface rounded-none border p-4"
            >
              <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <BaseInput
                  :id="`wizard-room-name-${room.key}`"
                  v-model="room.name"
                  type="text"
                  :label="$t('host.roomName')"
                />
                <BaseInput
                  :id="`wizard-room-guests-${room.key}`"
                  v-model="room.maxGuests"
                  type="number"
                  :label="$t('host.roomGuests')"
                />
                <BaseInput
                  :id="`wizard-room-price-${room.key}`"
                  v-model="room.priceDollars"
                  type="number"
                  :label="$t('host.roomPrice')"
                />
              </div>
              <div class="mt-3 flex items-center justify-between gap-3">
                <p
                  v-if="roomError(room)"
                  role="alert"
                  class="text-danger text-sm"
                >
                  {{ roomError(room) }}
                </p>
                <p
                  v-else
                  class="tabular text-fg-muted text-sm"
                >
                  {{ usd(room.priceDollars * 100) }} {{ $t('hotel.perNight') }}
                </p>
                <button
                  type="button"
                  class="text-danger shrink-0 px-2 py-1 text-sm underline-offset-4 hover:underline"
                  @click="removeRoom(room.key)"
                >
                  {{ $t('common.remove') }}
                </button>
              </div>
            </li>
          </ul>
          <button
            type="button"
            class="border-rule-strong text-fg hover:border-fg mt-4 flex h-12 w-full items-center justify-center rounded-sm border text-sm"
            @click="addRoom"
          >
            {{ $t('host.addRoom') }}
          </button>
        </div>

        <p
          v-if="stepError"
          role="alert"
          class="text-danger mt-4 text-sm"
        >
          {{ stepError }}
        </p>

        <div class="mt-6 flex flex-wrap gap-3">
          <BaseButton
            v-if="stepIndex > 0"
            variant="secondary"
            size="md"
            @click="back"
          >
            {{ $t('common.back') }}
          </BaseButton>
          <BaseButton
            v-if="step !== 'rooms'"
            variant="primary"
            size="md"
            @click="next"
          >
            {{ $t('common.next') }}
          </BaseButton>
          <BaseButton
            v-else
            variant="primary"
            size="md"
            @click="finish"
          >
            {{ $t('host.finishListing') }}
          </BaseButton>
        </div>
      </div>
    </template>
  </div>
</template>
