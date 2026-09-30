<script setup lang="ts">
/**
 * /hotels — the comparison surface.
 *
 * Deliberately denser and calmer than home. The task here is comparing properties,
 * not browsing them, so the filter rail is a 320px utility panel and the grid is the
 * quiet part.
 *
 * The query string is the state. `useRoute().query` is parsed on every read and
 * `router.replace` is the only writer, so a shared or reloaded URL reproduces the
 * exact result set, and back/forward through filter changes works without extra state.
 */
import {
  DEFAULT_GUESTS,
  DEFAULT_HOTEL_FILTERS,
  HOTEL_PAGE_SIZE,
  activeFilterCount,
  buildHotelQuery,
  parseHotelQuery,
  searchHotels,
} from '~/utils/hotels'
import type { HotelFilterState, HotelSort } from '~/utils/hotels'
import { localToday } from '~/utils/date'
import { fetchHotels, isEnvelopeError, toHotelListParams } from '~/utils/api'
import type { ApiHotelCard } from '~/utils/api'
import { mockHotelToCard } from '~/utils/hotelAdapters'
import { formatShortStayDate, wholeNumber } from '~/utils/format'
import { nightsBetween } from '~/utils/mock'

const route = useRoute()
const router = useRouter()
const requestUrl = useRequestURL()
const { t } = useI18n()

const today = localToday()

const query = computed(() => parseHotelQuery(route.query))

/** Defaults are omitted from the URL, so a no-op edit must not fire a navigation. */
function commit(patch: { filters?: HotelFilterState, sort?: HotelSort, page?: number }): void {
  const current = query.value
  const next = {
    filters: patch.filters ?? current.filters,
    sort: patch.sort ?? current.sort,
    page: patch.page ?? 1,
  }
  const raw = buildHotelQuery(next)
  if (JSON.stringify(raw) === JSON.stringify(buildHotelQuery(current))) return
  void router.replace({ path: '/hotels', query: raw })
}

const filters = computed<HotelFilterState>({
  get: () => query.value.filters,
  set: value => commit({ filters: value }),
})

const sort = computed<HotelSort>({
  get: () => query.value.sort,
  set: value => commit({ sort: value }),
})

const page = computed<number>({
  get: () => query.value.page,
  set: value => commit({ page: value }),
})

/**
 * A date range that cannot be used is reported in the rail, but it must not empty the
 * result set — the user keeps the properties and still sees what is wrong with the dates.
 */
const datesUsable = computed(() => {
  const { checkIn, checkOut } = query.value.filters
  if (!checkIn && !checkOut) return true
  if (checkIn && checkIn < today) return false
  return !(checkIn && checkOut && checkOut <= checkIn)
})

const request = computed(() => ({
  filters: datesUsable.value
    ? query.value.filters
    : { ...query.value.filters, checkIn: '', checkOut: '' },
  sort: query.value.sort,
}))

interface HotelSearchPayload {
  items: ApiHotelCard[]
  total: number
  live: boolean
  /** The page actually rendered — clamped when the URL names a page past the end. */
  page: number
}

/** `stars` has no API param, so it is applied to the returned page, not the query. */
function applyStars(items: ApiHotelCard[], stars: number[]): ApiHotelCard[] {
  if (stars.length === 0) return items
  return items.filter(item => stars.includes(item.starRating))
}

/**
 * The API total counts rows the star filter then hides, so a short filtered page
 * means the real total is unknowable from one page. Report the honest count so
 * the paginator never offers a page that cannot exist.
 */
function starFilteredTotal(items: ApiHotelCard[], apiTotal: number, stars: number[]): number {
  if (stars.length === 0) return apiTotal
  return items.length < HOTEL_PAGE_SIZE ? items.length : apiTotal
}

/**
 * Real list endpoint first. A transport failure means no backend is running, so
 * the search degrades to the mock pipeline with client-side paging; a real API
 * error is rethrown and drives the error state instead.
 */
const {
  data,
  status,
  error,
  refresh,
} = await useAsyncData<HotelSearchPayload>(
  'hotels:search',
  async (): Promise<HotelSearchPayload> => {
    const { filters, sort } = request.value
    try {
      const first = await fetchHotels(toHotelListParams(filters, sort, page.value, HOTEL_PAGE_SIZE))
      if (first.items.length === 0 && first.total > 0 && page.value > 1) {
        const last = Math.max(1, Math.ceil(first.total / HOTEL_PAGE_SIZE))
        const clamped = await fetchHotels(toHotelListParams(filters, sort, last, HOTEL_PAGE_SIZE))
        const items = applyStars(clamped.items, filters.stars)
        return { items, total: starFilteredTotal(items, clamped.total, filters.stars), live: true, page: last }
      }
      const items = applyStars(first.items, filters.stars)
      return { items, total: starFilteredTotal(items, first.total, filters.stars), live: true, page: page.value }
    }
    catch (fetchError: unknown) {
      if (isEnvelopeError(fetchError)) throw fetchError
      const matched = searchHotels(filters, sort)
      const pages = Math.max(1, Math.ceil(matched.total / HOTEL_PAGE_SIZE))
      const current = Math.min(Math.max(page.value, 1), pages)
      const start = (current - 1) * HOTEL_PAGE_SIZE
      return {
        items: matched.hotels.map(mockHotelToCard).slice(start, start + HOTEL_PAGE_SIZE),
        total: matched.total,
        live: false,
        page: current,
      }
    }
  },
  { watch: [request] },
)

const total = computed(() => data.value?.total ?? 0)

const visible = computed(() => data.value?.items ?? [])
const currentPage = computed(() => data.value?.page ?? page.value)

/** Skeletons only when there is nothing to show — never on a background refresh. */
const isLoading = computed(() => status.value === 'pending' && !data.value)
const hasFailed = computed(() => status.value === 'error')
const isEmpty = computed(() => !isLoading.value && !hasFailed.value && total.value === 0)

const heading = computed(() =>
  query.value.filters.city
    ? t('hotels.headingIn', { city: query.value.filters.city })
    : t('hotels.heading'),
)

const nights = computed(() => {
  const { checkIn, checkOut } = query.value.filters
  return checkIn && checkOut ? nightsBetween(checkIn, checkOut) : 0
})

const summary = computed(() => {
  const current = query.value.filters
  const parts = [
    total.value === 1 ? t('hotels.resultCountOne') : t('hotels.resultCount', { count: total.value }),
  ]

  if (nights.value > 0 && current.checkIn && current.checkOut) {
    parts.push(
      t('hotels.summaryDates', {
        nights: wholeNumber(nights.value),
        checkIn: formatShortStayDate(current.checkIn),
        checkOut: formatShortStayDate(current.checkOut),
      }),
    )
  }
  if (current.guests !== DEFAULT_GUESTS) {
    parts.push(
      current.guests === 1
        ? t('search.guestsOne')
        : t('hotels.summaryGuests', { count: wholeNumber(current.guests) }),
    )
  }
  return parts
})

const sortOptions = computed(() => [
  { value: 'recommended', label: t('hotels.sortRecommended') },
  { value: 'price-asc', label: t('hotels.sortPriceAsc') },
  { value: 'price-desc', label: t('hotels.sortPriceDesc') },
  { value: 'rating', label: t('hotels.sortRating') },
  { value: 'name', label: t('hotels.sortName') },
])

const activeCount = computed(() => activeFilterCount(query.value.filters))

const filterButtonLabel = computed(() =>
  activeCount.value
    ? t('hotels.openFiltersActive', { count: wholeNumber(activeCount.value) })
    : t('hotels.openFilters'),
)

const drawerOpen = ref(false)

useSeoMeta({
  title: () => `${heading.value} · ${t('common.brand')}`,
  description: () => t('hotels.metaDescription'),
  ogTitle: () => `${heading.value} · ${t('common.brand')}`,
  ogDescription: () => t('hotels.metaDescription'),
  ogType: 'website',
})

// Filter permutations are the same page. The canonical drops the query string so only
// /hotels is indexed.
useHead({ link: [{ rel: 'canonical', href: `${requestUrl.origin}/hotels` }] })
</script>

<template>
  <div class="mx-auto max-w-[1280px] px-6 py-10 lg:py-14">
    <div class="flex gap-6 xl:gap-8">
      <!-- 320px utility panel. Hairline right border, no card treatment. -->
      <aside class="hidden w-[320px] shrink-0 lg:block">
        <div class="border-rule sticky top-6 max-h-[calc(100dvh-3rem)] overflow-y-auto border-r pr-6 pb-2">
          <HotelFilters
            v-model="filters"
            :result-count="total"
          />
        </div>
      </aside>

      <div class="min-w-0 flex-1">
        <div class="border-rule flex flex-wrap items-end justify-between gap-4 border-b pb-4">
          <div>
            <h1 class="font-display text-display-m">
              {{ heading }}
            </h1>
            <p
              class="text-fg-muted mt-2 flex flex-wrap items-center gap-x-2 text-sm"
              aria-live="polite"
            >
              <template
                v-for="(part, index) in summary"
                :key="part"
              >
                <span
                  v-if="index > 0"
                  aria-hidden="true"
                  class="text-fg-subtle"
                >·</span>
                <span :class="index === 0 ? 'tabular' : ''">{{ part }}</span>
              </template>
            </p>
          </div>

          <div class="w-full sm:w-56">
            <BaseSelect
              id="hotels-sort"
              :model-value="sort"
              :label="$t('hotels.sortBy')"
              :options="sortOptions"
              @update:model-value="sort = $event as HotelSort"
            />
          </div>
        </div>

        <div class="mt-6 lg:hidden">
          <button
            type="button"
            class="border-rule-strong text-fg hover:border-fg flex h-12 w-full items-center justify-between rounded-sm border px-4 text-sm"
            @click="drawerOpen = true"
          >
            <span>{{ filterButtonLabel }}</span>
            <svg
              viewBox="0 0 16 16"
              width="14"
              height="14"
              aria-hidden="true"
              focusable="false"
            >
              <path
                d="M2 4h12M4 8h8M6 12h4"
                stroke="currentColor"
                stroke-width="1.5"
              />
            </svg>
          </button>
        </div>

        <div
          class="mt-6"
          :aria-busy="isLoading"
        >
          <!-- Loading. Static blocks, no shimmer. -->
          <div
            v-if="isLoading"
            class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3"
          >
            <p
              class="sr-only"
              role="status"
            >
              {{ $t('hotels.loadingResults') }}
            </p>
            <div
              v-for="slot in HOTEL_PAGE_SIZE"
              :key="`skeleton-${slot}`"
              aria-hidden="true"
              class="border-rule bg-surface rounded-none border"
            >
              <div class="bg-surface-alt aspect-[3/2] border-b border-rule" />
              <div class="p-5">
                <BaseSkeleton :rows="3" />
              </div>
            </div>
          </div>

          <!-- Error. Filters are untouched, so the retry is a retry, not a restart. -->
          <BaseAlert
            v-else-if="hasFailed"
            tone="danger"
            :title="$t('hotels.loadError')"
          >
            <p>{{ $t('hotels.loadErrorHint') }}</p>
            <p
              v-if="error"
              class="font-mono text-xs"
            >
              {{ error.message }}
            </p>
            <button
              type="button"
              class="border-danger text-danger mt-2 inline-flex h-11 items-center rounded-sm border px-4 text-sm"
              @click="refresh()"
            >
              {{ $t('common.retry') }}
            </button>
          </BaseAlert>

          <!-- Empty. Always with the way out. -->
          <BaseEmptyState
            v-else-if="isEmpty"
            :title="$t('hotels.emptyTitle')"
            :hint="$t('hotels.emptyHint')"
          >
            <BaseButton
              variant="secondary"
              size="md"
              @click="commit({ filters: { ...DEFAULT_HOTEL_FILTERS } })"
            >
              {{ $t('hotels.clearAll') }}
            </BaseButton>
          </BaseEmptyState>

          <template v-else>
            <ul class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              <li
                v-for="hotel in visible"
                :key="hotel.id"
              >
                <HotelCard :hotel="hotel" />
              </li>
            </ul>

            <div class="border-rule mt-12 flex justify-center border-t pt-6">
              <BasePagination
                :page="currentPage"
                :page-size="HOTEL_PAGE_SIZE"
                :total="total"
                @update:page="page = $event"
              />
            </div>
          </template>
        </div>
      </div>
    </div>

    <HotelFilterDrawer
      v-model:open="drawerOpen"
      v-model:filters="filters"
      :result-count="total"
    />
  </div>
</template>
