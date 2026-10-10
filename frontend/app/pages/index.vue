<script setup lang="ts">
import { HOTELS } from '~/utils/mock'
import { fetchHotels, isApiFailure } from '~/utils/api'
import type { ApiHotelCard } from '~/utils/api'
import { mockHotelToCard } from '~/utils/hotelAdapters'

const requestUrl = useRequestURL()

useSeoMeta({
  title: () => $t('common.brand'),
  description: () => $t('home.subtitle'),
  ogTitle: () => $t('common.brand'),
  ogDescription: () => $t('home.subtitle'),
  ogType: 'website',
})

// The home page has no query state, so its own origin root is the canonical URL.
useHead({ link: [{ rel: 'canonical', href: `${requestUrl.origin}/` }] })

const HOME_PAGE_SIZE = 6

/**
 * Real list endpoint first. A transport failure means no backend is running, so
 * the page degrades to the mock fixtures; a real API error is rethrown and
 * surfaces instead of being hidden behind fixtures.
 */
const { data: cards } = await useAsyncData<ApiHotelCard[]>(
  'home:featured',
  async () => {
    try {
      const live = await fetchHotels({ page: 1, pageSize: HOME_PAGE_SIZE })
      return live.items
    }
    catch (error: unknown) {
      if (isApiFailure(error)) throw error
      return HOTELS
        .filter(hotel => hotel.status === 'PUBLISHED')
        .slice(0, HOME_PAGE_SIZE)
        .map(mockHotelToCard)
    }
  },
)

const featured = computed(() => (cards.value ?? []).slice(0, 3))

/** Unequal on purpose. A 1:1:1 strip is the generic look this system is arguing with. */
const destinations = computed(() => {
  const seen = new Set<string>()
  const picks: ApiHotelCard[] = []
  for (const card of cards.value ?? []) {
    if (seen.has(card.city)) continue
    seen.add(card.city)
    picks.push(card)
    if (picks.length >= 3) break
  }
  return picks
})

const heroImage = computed(() => featured.value[0]?.coverImage ?? null)
const heroAlt = computed(() => heroImage.value?.altText ?? featured.value[0]?.name ?? '')
</script>

<template>
  <div>
    <!-- Asymmetric 5/7 hero. Text never centred; the image bleeds past the grid edge. -->
    <section class="mx-auto max-w-[1280px] px-6 pt-16 pb-20 lg:pt-24 lg:pb-28">
      <div class="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-8">
        <div class="lg:col-span-5">
          <p class="text-accent-bright text-label uppercase">
            {{ $t('home.eyebrow') }}
          </p>

          <h1 class="font-display mt-4 text-[3.5rem] leading-[0.95] tracking-[-0.02em]">
            {{ $t('home.title') }}
          </h1>

          <p class="prose-70 text-fg-muted mt-6 text-lg">
            {{ $t('home.subtitle') }}
          </p>

          <!-- The primary conversion control, given the room it needs. -->
          <div class="mt-10">
            <SearchWidget />
          </div>
        </div>

        <div class="lg:col-span-7 lg:pl-6">
          <figure
            v-if="heroImage"
            class="relative"
          >
            <img
              :src="heroImage.url"
              :alt="heroAlt"
              :width="heroImage.width"
              :height="heroImage.height"
              fetchpriority="high"
              decoding="async"
              class="aspect-[16/9] w-full object-cover"
            >
            <div class="absolute inset-0 bg-surface-inv/60" />
            <figcaption
              class="absolute right-3 bottom-3 left-3 text-sm text-white"
            >
              {{ heroAlt }}
            </figcaption>
          </figure>
        </div>
      </div>
    </section>

    <section class="mx-auto max-w-[1280px] px-6 pb-24">
      <div class="border-rule mb-8 flex items-end justify-between gap-6 border-b pb-4">
        <div>
          <h2 class="font-display text-display-l">
            {{ $t('home.featured') }}
          </h2>
          <p class="text-fg-muted mt-2 text-sm">
            {{ $t('home.featuredHint') }}
          </p>
        </div>
        <NuxtLink
          to="/hotels"
          class="text-link shrink-0 text-sm underline-offset-4 hover:underline"
        >
          {{ $t('home.browseAll') }}
        </NuxtLink>
      </div>

      <div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        <HotelCard
          v-for="hotel in featured"
          :key="hotel.id"
          :hotel="hotel"
        />
      </div>
    </section>

    <section class="mx-auto max-w-[1280px] px-6 pb-24">
      <div class="mb-8">
        <h2 class="font-display text-display-l">
          {{ $t('home.destinations') }}
        </h2>
        <p class="prose-70 text-fg-muted mt-3 text-sm">
          {{ $t('home.destinationsHint') }}
        </p>
      </div>

      <div class="grid grid-cols-1 gap-6 md:grid-cols-5">
        <NuxtLink
          v-for="(hotel, index) in destinations"
          :key="hotel.id"
          :to="`/hotels?city=${encodeURIComponent(hotel.city)}`"
          class="group relative block overflow-hidden"
          :class="index === 0 ? 'md:col-span-3' : 'md:col-span-1'"
        >
          <img
            v-if="hotel.coverImage"
            :src="hotel.coverImage.url"
            :alt="`${hotel.city}, ${hotel.country}`"
            :width="hotel.coverImage.width"
            :height="hotel.coverImage.height"
            loading="lazy"
            decoding="async"
            class="aspect-[4/3] w-full object-cover"
          >
          <div class="absolute inset-0 bg-surface-inv/75" />
          <div class="absolute right-0 bottom-0 left-0 p-5 text-white">
            <p class="text-label uppercase">{{ hotel.country }}</p>
            <p class="font-display mt-1 text-2xl">{{ hotel.city }}</p>
          </div>
        </NuxtLink>
      </div>
    </section>
  </div>
</template>
