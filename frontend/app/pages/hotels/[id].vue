<script setup lang="ts">
/**
 * /hotels/[id] — the browsing surface, so it breathes. Discovery is airy; the booking
 * flow (T7) is the screen that gets tight.
 *
 * The data key is derived from the route param. Without that, `useAsyncData` reuses one
 * payload across `/hotels/lisbon` and `/hotels/oaxaca` and the second guest is shown
 * the first property. T17c swaps the handler for a `$fetch` and the key stays.
 */
import { AMENITY_BY_ID, getHotelDetail } from '~/utils/mock'
import { usd } from '~/utils/format'
import { cheapestNightlyCents } from '~/utils/hotels'

const route = useRoute()
const requestUrl = useRequestURL()
const { t } = useI18n()

const slug = computed(() => String(route.params.id ?? ''))

const { data: hotel, error } = await useAsyncData(
  () => `hotel:${slug.value}`,
  async () => getHotelDetail(slug.value),
)

/** A missing slug is a 404, not an exception — render the not-found state in place. */
if (!hotel.value) {
  setResponseStatus(404, 'Hotel not found')
}

const notFound = computed(() => !hotel.value)

const canonical = computed(() => `${requestUrl.origin}/hotels/${slug.value}`)

const nightlyCents = computed(() => (hotel.value ? cheapestNightlyCents(hotel.value) : null))

const rooms = computed(() => hotel.value?.rooms ?? [])

const amenities = computed(() =>
  (hotel.value?.amenityIds ?? [])
    .map(id => AMENITY_BY_ID.get(id)?.name)
    .filter((name): name is string => Boolean(name)),
)

/** Newest first, per the ticket. `localeCompare` on the ISO string is a date order. */
const reviews = computed(() =>
  [...(hotel.value?.reviews ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
)

const lightboxOpen = ref(false)
const lightboxStart = ref(0)

function openLightbox(index: number): void {
  lightboxStart.value = index
  lightboxOpen.value = true
}

useSeoMeta({
  title: () =>
    hotel.value ? `${hotel.value.name}, ${hotel.value.city} · ${t('common.brand')}` : t('detail.notFoundTitle'),
  description: () =>
    hotel.value
      ? t('detail.metaDescription', {
          name: hotel.value.name,
          city: hotel.value.city,
          price: nightlyCents.value === null ? '—' : usd(nightlyCents.value),
        })
      : t('detail.notFoundBody'),
  ogTitle: () => (hotel.value ? hotel.value.name : t('detail.notFoundTitle')),
  ogDescription: () =>
    hotel.value
      ? t('detail.metaDescription', {
          name: hotel.value.name,
          city: hotel.value.city,
          price: nightlyCents.value === null ? '—' : usd(nightlyCents.value),
        })
      : t('detail.notFoundBody'),
  ogType: 'website',
  ogUrl: () => canonical.value,
  ogImage: () => hotel.value?.images[0]?.url,
})

useHead({
  link: [{ rel: 'canonical', href: canonical }],
  script: [
    {
      type: 'application/ld+json',
      // Fixture content only — nothing user-supplied reaches this string.
      innerHTML: () => {
        if (!hotel.value) return '{}'
        return JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'Hotel',
          'name': hotel.value.name,
          'description': hotel.value.description,
          'url': canonical.value,
          'image': hotel.value.images.map(image => image.url),
          'address': {
            '@type': 'PostalAddress',
            'streetAddress': hotel.value.addressLine,
            'addressLocality': hotel.value.city,
            'addressCountry': hotel.value.country,
          },
          'aggregateRating': {
            '@type': 'AggregateRating',
            'ratingValue': hotel.value.rating.average,
            'reviewCount': hotel.value.rating.totalReviews,
          },
        })
      },
    },
  ],
})
</script>

<template>
  <div
    v-if="notFound"
    class="mx-auto max-w-[1280px] px-6 py-20 lg:py-28"
  >
    <p class="text-accent-bright text-label uppercase">
      {{ $t('nav.stays') }}
    </p>
    <h1 class="font-display mt-4 text-display-l">
      {{ $t('detail.notFoundTitle') }}
    </h1>
    <p class="prose-70 text-fg-muted mt-4">
      {{ $t('detail.notFoundBody') }}
    </p>
    <p
      v-if="error"
      class="text-fg-subtle font-mono mt-4 text-sm"
    >
      {{ slug }}
    </p>
    <BaseButton
      to="/hotels"
      variant="primary"
      size="lg"
      class="mt-8"
    >
      {{ $t('detail.browseStays') }}
    </BaseButton>
  </div>

  <div
    v-else-if="hotel"
    class="mx-auto max-w-[1280px] px-6 pt-10 pb-32 lg:pt-14 lg:pb-28"
  >
    <BaseAlert
      v-if="hotel.status !== 'PUBLISHED'"
      tone="warning"
      class="mb-6"
    >
      {{ $t('detail.pendingNotice') }}
    </BaseAlert>

    <!-- 7/5. The booking panel is the sticky half; the photography is the airy half. -->
    <section class="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-8">
      <div class="lg:col-span-7">
        <HotelGallery
          :images="hotel.images"
          @open="openLightbox"
        />
      </div>

      <div class="lg:col-span-5">
        <HotelBookingPanel :hotel="hotel" />
      </div>
    </section>

    <section class="mt-16 lg:mt-24">
      <div class="border-rule mb-8 border-b pb-4">
        <h2 class="font-display text-display-l">
          {{ $t('detail.roomsHeading') }}
        </h2>
        <p class="prose-70 text-fg-muted mt-2 text-sm">
          {{ $t('detail.roomsHint') }}
        </p>
      </div>

      <ul class="grid grid-cols-1 gap-6 md:grid-cols-2">
        <li
          v-for="room in rooms"
          :key="room.id"
        >
          <RoomCard
            :room="room"
            :hotel-slug="hotel.slug"
          />
        </li>
      </ul>
    </section>

    <section class="mt-16 lg:mt-24">
      <div class="border-rule mb-8 border-b pb-4">
        <h2 class="font-display text-display-l">
          {{ $t('detail.reviewsHeading') }}
        </h2>
      </div>

      <div class="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-8">
        <div class="lg:col-span-4">
          <RatingBreakdown :breakdown="hotel.rating" />

          <div class="mt-8">
            <h3 class="text-fg-muted text-label uppercase">
              {{ $t('detail.amenitiesHeading') }}
            </h3>
            <ul class="mt-3 flex flex-wrap gap-x-2 gap-y-1 text-sm">
              <li
                v-for="name in amenities"
                :key="name"
              >
                {{ name }}
              </li>
            </ul>
          </div>
        </div>

        <div class="lg:col-span-8">
          <div
            v-if="reviews.length"
            class="flex flex-col gap-6"
          >
            <ReviewCard
              v-for="review in reviews.slice(0, 3)"
              :key="review.id"
              :review="review"
            />
          </div>

          <BaseEmptyState
            v-else
            :title="$t('detail.noReviewsTitle')"
            :hint="$t('detail.noReviewsHint')"
          />
        </div>
      </div>
    </section>

    <section class="mt-16 lg:mt-24">
      <div class="border-rule mb-8 border-b pb-4">
        <h2 class="font-display text-display-l">
          {{ $t('detail.locationHeading') }}
        </h2>
      </div>

      <div class="max-w-[640px]">
        <HotelLocation :hotel="hotel" />
      </div>
    </section>

    <HotelLightbox
      v-model:open="lightboxOpen"
      :images="hotel.images"
      :start-index="lightboxStart"
    />
  </div>
</template>
