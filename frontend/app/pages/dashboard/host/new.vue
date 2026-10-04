<script setup lang="ts">
/**
 * /dashboard/host/new — the listing wizard: details → amenities → photos →
 * room types. Each step validates before advancing. The photo step uploads for real
 * (T21): each file is signed by the API and posted straight to Cloudinary, with
 * per-file progress and a retry that re-signs. The Cloudinary results are staged on
 * the upload entries until T22 creates the listing below.
 *
 * T22: finishing creates the hotel (`PENDING`), attaches the staged photos, and
 * creates the room drafts — in that order, because every step needs the id the
 * previous one returned. A failure stops the chain with the form intact: the visitor
 * fixes nothing by retyping, and a half-built listing is resumed from the edit page.
 */
import { AMENITIES } from '~/utils/mock'
import { attachUpload, createHotel, createRoom, isApiError } from '~/utils/api'
import type { ApiCreateRoom } from '~/utils/api'
import { usd, wholeNumber } from '~/utils/format'

definePageMeta({ layout: 'dashboard', middleware: 'auth' })

const { t } = useI18n()

const STEPS = ['details', 'amenities', 'photos', 'rooms'] as const
type Step = (typeof STEPS)[number]

interface RoomDraft {
  key: number
  name: string
  description: string
  bedType: string
  maxGuests: number
  totalInventory: number
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
const addressLine = ref('')
const country = ref('')
/** `BaseSelect` is string-modelled, so the rating rides as text and converts on submit. */
const starRating = ref('3')
const checkInTime = ref('15:00')
const checkOutTime = ref('11:00')
const amenityIds = ref<string[]>([])
const rooms = ref<RoomDraft[]>([])
const roomKey = ref(0)
const stepError = ref('')
const submitError = ref('')
const submitting = ref(false)
const finished = ref(false)
const createdId = ref('')

const starOptions = computed(() => [1, 2, 3, 4, 5].map(stars => ({ value: String(stars), label: String(stars) })))

/** Owns the uploads and every object URL they make; the page only selects and forwards. */
const { uploads, addFiles, retry, remove } = usePhotoUploads()

/** Announced on change, so it must be a number the page computed, not one read per render. */
const uploadedCount = computed(() => uploads.value.filter(photo => photo.status === 'done').length)

/** The staged Cloudinary results, in tile order. The first done photo becomes the cover. */
const stagedPhotos = computed(() => uploads.value.filter(photo => photo.status === 'done' && photo.uploaded !== null))

function toggleAmenity(id: string): void {
  amenityIds.value = amenityIds.value.includes(id)
    ? amenityIds.value.filter(entry => entry !== id)
    : [...amenityIds.value, id]
}

function onFiles(event: Event): void {
  const input = event.target as HTMLInputElement | null
  addFiles(input?.files ? [...input.files] : [])
  // Clearing the input is what makes choosing the same file twice in a row fire
  // `change` at all; without it a retry after a failure looks like nothing happened.
  if (input) input.value = ''
}

function addRoom(): void {
  roomKey.value += 1
  rooms.value.push({ key: roomKey.value, name: '', description: '', bedType: '', maxGuests: 2, totalInventory: 1, priceDollars: 0 })
}

function removeRoom(key: number): void {
  rooms.value = rooms.value.filter(room => room.key !== key)
}

function roomError(room: RoomDraft): string {
  if (!room.name.trim()) return t('host.roomNameRequired')
  if (!room.description.trim()) return t('host.roomDescriptionRequired')
  if (!room.bedType.trim()) return t('host.roomBedTypeRequired')
  if (!(room.maxGuests >= 1)) return t('host.roomGuestsRequired')
  if (!(room.totalInventory >= 1)) return t('host.roomInventoryRequired')
  if (!(room.priceDollars > 0)) return t('host.roomPriceRequired')
  return ''
}

/** Each step validates before the wizard advances. */
function validateStep(current: Step): boolean {
  if (current === 'details') {
    if (name.value.trim().length < 2) return false
    if (city.value.trim().length < 2) return false
    if (description.value.trim().length < 20) return false
    if (addressLine.value.trim().length < 3) return false
    if (country.value.trim().length < 2) return false
    if (!checkInTime.value || !checkOutTime.value) return false
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
  void submit()
}

/**
 * Creates the listing and everything under it. The hotel first — photos and rooms
 * need its id — then the attaches and the rooms concurrently, since no room depends
 * on another. A failure leaves the form exactly as it was: retyping a description to
 * retry a network call is the failure mode the UX rules forbid, and a listing that
 * was created but not finished is resumed from its edit page, not rebuilt.
 *
 * The id is captured the moment `createHotel` resolves, before the second batch. Dropping
 * it on a later failure meant the visitor stayed on the last step with no way back to the
 * listing, and pressing "Finish listing" again built a second one.
 */
async function submit(): Promise<void> {
  if (submitting.value) return
  submitting.value = true
  submitError.value = ''
  try {
    let hotelId = createdId.value
    if (!hotelId) {
      const hotel = await createHotel({
        name: name.value.trim(),
        description: description.value.trim(),
        addressLine: addressLine.value.trim(),
        city: city.value.trim(),
        country: country.value.trim(),
        // No location picker yet (maps are a placeholder per D28), so the listing is
        // created at 0,0 rather than at an invented address. A real coordinate belongs
        // to the map seam, not to this form.
        lat: 0,
        lng: 0,
        starRating: Number(starRating.value),
        checkInTime: checkInTime.value,
        checkOutTime: checkOutTime.value,
        amenityIds: [...amenityIds.value],
      })
      hotelId = hotel.id
      // From here on the listing exists. A retry continues this one instead of orphaning it.
      createdId.value = hotel.id
    }

    const staged = stagedPhotos.value
    await Promise.all([
      ...staged.map((photo, index) => {
        const uploaded = photo.uploaded
        if (!uploaded) return Promise.resolve()
        // Attach order is creation order: the first done photo carries the cover flag.
        return attachUpload({
          hotelId,
          url: uploaded.url,
          publicId: uploaded.publicId,
          isCover: index === 0,
        })
      }),
      ...rooms.value.map((room, index) => {
        const body: ApiCreateRoom = {
          name: room.name.trim(),
          description: room.description.trim(),
          bedType: room.bedType.trim(),
          maxGuests: room.maxGuests,
          totalInventory: room.totalInventory,
          sortOrder: index,
          prices: [{ currency: 'USD', priceCents: Math.round(room.priceDollars * 100) }],
          images: [],
        }
        return createRoom(hotelId, body)
      }),
    ])

    finished.value = true
  }
  catch (error: unknown) {
    // The message is the API's (validation names the field); the code decides support
    // triage, so it is logged rather than shown.
    submitError.value = isApiError(error) ? error.message : t('common.unexpectedError')
  }
  finally {
    submitting.value = false
  }
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
        <span aria-hidden="true"> · </span>
        <NuxtLink
          :to="`/dashboard/host/${createdId}/edit`"
          class="text-link underline-offset-4 hover:underline"
        >
          {{ $t('host.editTitle') }}
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
          <BaseInput
            id="wizard-address"
            v-model="addressLine"
            type="text"
            :label="$t('host.fieldAddress')"
          />
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <BaseInput
              id="wizard-country"
              v-model="country"
              type="text"
              :label="$t('host.fieldCountry')"
            />
            <BaseSelect
              id="wizard-stars"
              v-model="starRating"
              :label="$t('host.fieldStarRating')"
              :options="starOptions"
            />
          </div>
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <BaseInput
              id="wizard-checkin"
              v-model="checkInTime"
              type="time"
              :label="$t('host.fieldCheckIn')"
            />
            <BaseInput
              id="wizard-checkout"
              v-model="checkOutTime"
              type="time"
              :label="$t('host.fieldCheckOut')"
            />
          </div>
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

        <!-- Step 3: photos. Real signed uploads to Cloudinary, per-file state. -->
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
          <p
            v-if="uploads.length"
            class="text-fg-muted mt-4 text-sm"
            aria-live="polite"
          >
            {{ $t('host.photosSummary', { done: uploadedCount, total: uploads.length }) }}
          </p>
          <ul
            v-if="uploads.length"
            class="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2"
          >
            <PhotoUploadTile
              v-for="photo in uploads"
              :key="photo.id"
              :photo="photo"
              @retry="retry"
              @remove="remove"
            />
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
              <div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-5">
                <div class="sm:col-span-2">
                  <BaseInput
                    :id="`wizard-room-description-${room.key}`"
                    v-model="room.description"
                    type="text"
                    :label="$t('host.roomDescription')"
                  />
                </div>
                <div class="sm:col-span-2">
                  <BaseInput
                    :id="`wizard-room-bed-${room.key}`"
                    v-model="room.bedType"
                    type="text"
                    :label="$t('host.roomBedType')"
                  />
                </div>
                <BaseInput
                  :id="`wizard-room-inventory-${room.key}`"
                  v-model="room.totalInventory"
                  type="number"
                  :label="$t('host.roomInventory')"
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

        <BaseAlert
          v-if="submitError"
          tone="danger"
          class="mt-4"
        >
          <p>{{ submitError }}</p>
          <!--
            The listing already exists, so the way out is its edit page rather than another
            "Finish listing" press. Shown only once there is an id to link to.
          -->
          <p
            v-if="createdId"
            class="mt-3"
          >
            <NuxtLink
              :to="`/dashboard/host/${createdId}/edit`"
              class="text-link underline-offset-4 hover:underline"
            >
              {{ $t('host.editTitle') }}
            </NuxtLink>
          </p>
        </BaseAlert>

        <div class="mt-6 flex flex-wrap gap-3">
          <BaseButton
            v-if="stepIndex > 0"
            variant="secondary"
            size="md"
            :disabled="submitting"
            @click="back"
          >
            {{ $t('common.back') }}
          </BaseButton>
          <BaseButton
            v-if="step !== 'rooms'"
            variant="primary"
            size="md"
            :disabled="submitting"
            @click="next"
          >
            {{ $t('common.next') }}
          </BaseButton>
          <BaseButton
            v-else
            variant="primary"
            size="md"
            :loading="submitting"
            :disabled="submitting"
            @click="finish"
          >
            {{ submitting ? $t('host.creatingListing') : $t('host.finishListing') }}
          </BaseButton>
        </div>
      </div>
    </template>
  </div>
</template>
