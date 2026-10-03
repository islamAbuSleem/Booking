<script setup lang="ts">
/**
 * /dashboard/admin — the moderation console. Dense and tabular: three stat
 * cards, then Listings / Users / Reviews tabs. Every destructive action
 * (approve, reject, suspend, hide) sits behind one confirm modal that names
 * the item.
 *
 * T25: the API is the primary source. Stats, the filtered listing queue, users,
 * and reviews all read the admin endpoints; actions PATCH and re-fetch. A transport
 * failure or 401 degrades to the fixtures with the previous local-state behaviour —
 * but a real 403 (`ADMIN_REQUIRED`) is an answer, never fixtures: the mock console
 * must not stand in for access control.
 */
import { HOTELS, REVIEWS, USERS } from '~/utils/mock'
import {
  fetchAdminListings,
  fetchAdminReviews,
  fetchAdminStats,
  fetchAdminUsers,
  isApiError,
  isApiFailure,
  setAdminListingStatus,
  setAdminReviewStatus,
  setAdminUserStatus,
} from '~/utils/api'
import { wholeNumber } from '~/utils/format'

definePageMeta({ layout: 'dashboard', middleware: 'auth' })

const { t } = useI18n()
const { current } = useAuth()

type ListingStatus = 'PENDING' | 'PUBLISHED' | 'REJECTED' | 'SUSPENDED'
type AdminTab = 'listings' | 'users' | 'reviews'

/** What the template renders. Live rows and fixture rows flatten into the same fields. */
interface ListingView {
  id: string
  name: string
  city: string
  roomsCount: number
  status: ListingStatus
}

interface UserView {
  id: string
  name: string
  email: string
  role: 'GUEST' | 'HOST' | 'ADMIN'
  suspended: boolean
}

interface ReviewView {
  id: string
  authorName: string
  title: string
  body: string
  status: 'VISIBLE' | 'HIDDEN'
  /** Mock-only: no report system exists on the API, so live rows are never flagged. */
  flagged: boolean
  reportReasonKey: string | null
}

interface ConsolePayload {
  live: boolean
  pendingCount: number
  usersTotal: number
  hiddenCount: number
  listings: ListingView[]
  users: UserView[]
  reviews: ReviewView[]
}

const tab = ref<AdminTab>('listings')
const statusFilter = ref<'ALL' | ListingStatus>('PENDING')

/**
 * Local overrides for fixture mode only — the live path re-fetches instead. Declared
 * before the fetch below: the fallback branch reads them, and the `await` runs before
 * anything declared after it is initialised.
 */
const suspendedUsers = ref<string[]>([])
const hiddenReviews = ref<Record<string, 'VISIBLE' | 'HIDDEN'>>({})
const resolvedReports = ref<string[]>([])
const listingStatus = ref<Partial<Record<string, ListingStatus>>>({})

/**
 * Placeholder report reasons until a report system exists. Keyed by review id, so a
 * future flag endpoint replaces this map with data instead of reshaping the page.
 */
const REPORT_REASONS: Record<string, string> = {
  rev_2: 'admin.reportReasonContact',
  rev_4: 'admin.reportReasonSpam',
}

/**
 * The filter rides the request: `?status=` narrows server-side, and `ALL` omits the
 * param. The key carries the filter so each selection is its own cached payload.
 */
const {
  data,
  status: fetchStatus,
  refresh,
} = await useAsyncData<ConsolePayload>(
  () => `admin:console:${statusFilter.value}`,
  async (): Promise<ConsolePayload> => {
    try {
      const [stats, listings, users, reviews] = await Promise.all([
        fetchAdminStats(),
        fetchAdminListings(statusFilter.value),
        fetchAdminUsers(),
        fetchAdminReviews(),
      ])
      return {
        live: true,
        pendingCount: stats.hotelsByStatus.PENDING,
        usersTotal: stats.usersTotal,
        hiddenCount: stats.reviewsHidden,
        listings: listings.map(item => ({
          id: item.id,
          name: item.name,
          city: item.city,
          roomsCount: item.roomsCount,
          status: item.status,
        })),
        users: users.map(user => ({
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          suspended: user.status === 'SUSPENDED',
        })),
        reviews: reviews.map(review => ({
          id: review.id,
          authorName: review.author.name,
          title: review.title,
          body: review.body,
          status: review.status,
          flagged: false,
          reportReasonKey: null,
        })),
      }
    }
    catch (fetchError: unknown) {
      if (isApiFailure(fetchError) && (!isApiError(fetchError) || fetchError.code !== 'UNAUTHORIZED')) {
        throw fetchError
      }
      return {
        live: false,
        pendingCount: HOTELS.filter(hotel => (listingStatus.value[hotel.id] ?? hotel.status) === 'PENDING').length,
        usersTotal: USERS.length,
        hiddenCount: 0,
        listings: HOTELS.filter((hotel) => {
          const effective = listingStatus.value[hotel.id] ?? hotel.status
          return statusFilter.value === 'ALL' || effective === statusFilter.value
        }).map(hotel => ({
          id: hotel.id,
          name: hotel.name,
          city: hotel.city,
          roomsCount: hotel.rooms.length,
          status: listingStatus.value[hotel.id] ?? hotel.status,
        })),
        users: USERS.map(user => ({
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          suspended: suspendedUsers.value.includes(user.id),
        })),
        reviews: REVIEWS.filter(review => REPORT_REASONS[review.id] && !resolvedReports.value.includes(review.id)).map(review => ({
          id: review.id,
          authorName: review.authorName,
          title: review.title,
          body: review.body,
          status: hiddenReviews.value[review.id] ?? 'VISIBLE',
          flagged: true,
          reportReasonKey: REPORT_REASONS[review.id] ?? 'admin.reportReasonOther',
        })),
      }
    }
  },
)

const isLive = computed(() => data.value?.live === true)
const isLoading = computed(() => fetchStatus.value === 'pending')
const hasFailed = computed(() => fetchStatus.value === 'error')

const listings = computed(() => data.value?.listings ?? [])
const users = computed(() => data.value?.users ?? [])
const reviewQueue = computed(() => data.value?.reviews ?? [])
const pendingCount = computed(() => data.value?.pendingCount ?? 0)
const usersTotal = computed(() => data.value?.usersTotal ?? 0)
const hiddenCount = computed(() => data.value?.hiddenCount ?? 0)
/** Fixture mode counts open reports; the live console counts hidden reviews instead. */
const reportsOpen = computed(
  () => REVIEWS.filter(review => REPORT_REASONS[review.id] && !resolvedReports.value.includes(review.id)).length,
)

/** Refetch when the filter moves — fixture mode filters locally in the fetch above. */
watch(statusFilter, () => {
  if (isLive.value) void refresh()
})

interface ConfirmState {
  title: string
  body: string
  confirmLabel: string
  run: () => void | Promise<void>
}

const confirmOpen = ref(false)
const confirmState = ref<ConfirmState | null>(null)
const actionError = ref('')

function ask(state: ConfirmState): void {
  confirmState.value = state
  confirmOpen.value = true
}

/**
 * Actions run through the confirm modal, so the runner is async: a rejected PATCH
 * names the problem above the tabs instead of closing the modal silently, and the
 * form underneath is never cleared.
 */
async function doConfirm(): Promise<void> {
  const state = confirmState.value
  confirmOpen.value = false
  confirmState.value = null
  if (!state) return
  actionError.value = ''
  try {
    await state.run()
  }
  catch (error: unknown) {
    actionError.value = isApiError(error) ? error.message : t('common.unexpectedError')
  }
}

function refreshAfterWrite(): Promise<void> {
  // Re-read rather than patching local rows: the write already succeeded, and the
  // list must show what stuck — including a status another admin changed meanwhile.
  return refresh()
}

function approveListing(hotelId: string, name: string): void {
  ask({
    title: t('admin.approveTitle', { name }),
    body: t('admin.approveBody', { name }),
    confirmLabel: t('admin.approveConfirm'),
    run: () => {
      if (!isLive.value) {
        listingStatus.value[hotelId] = 'PUBLISHED'
        return refresh()
      }
      return setAdminListingStatus(hotelId, 'PUBLISHED').then(() => refreshAfterWrite())
    },
  })
}

function rejectListing(hotelId: string, name: string): void {
  ask({
    title: t('admin.rejectTitle', { name }),
    body: t('admin.rejectBody', { name }),
    confirmLabel: t('admin.rejectConfirm'),
    run: () => {
      if (!isLive.value) {
        listingStatus.value[hotelId] = 'REJECTED'
        return refresh()
      }
      return setAdminListingStatus(hotelId, 'REJECTED').then(() => refreshAfterWrite())
    },
  })
}

function toggleSuspend(userId: string, name: string, suspended: boolean): void {
  ask({
    title: suspended ? t('admin.unsuspendTitle', { name }) : t('admin.suspendTitle', { name }),
    body: suspended ? t('admin.unsuspendBody', { name }) : t('admin.suspendBody', { name }),
    confirmLabel: suspended ? t('admin.unsuspendConfirm') : t('admin.suspendConfirm'),
    run: () => {
      if (!isLive.value) {
        suspendedUsers.value = suspended
          ? suspendedUsers.value.filter(id => id !== userId)
          : [...suspendedUsers.value, userId]
        return refresh()
      }
      const status = suspended ? 'ACTIVE' : 'SUSPENDED'
      return setAdminUserStatus(userId, status).then(() => refreshAfterWrite())
    },
  })
}

function hideReview(reviewId: string, author: string): void {
  ask({
    title: t('admin.hideTitle', { name: author }),
    body: t('admin.hideBody', { name: author }),
    confirmLabel: t('admin.hideConfirm'),
    run: () => {
      if (!isLive.value) {
        hiddenReviews.value[reviewId] = 'HIDDEN'
        resolvedReports.value.push(reviewId)
        return refresh()
      }
      return setAdminReviewStatus(reviewId, 'HIDDEN').then(() => refreshAfterWrite())
    },
  })
}

function unhideReview(reviewId: string, author: string): void {
  ask({
    title: t('admin.unhideTitle', { name: author }),
    body: t('admin.unhideBody', { name: author }),
    confirmLabel: t('admin.unhideConfirm'),
    run: () => {
      if (!isLive.value) {
        hiddenReviews.value[reviewId] = 'VISIBLE'
        return refresh()
      }
      return setAdminReviewStatus(reviewId, 'VISIBLE').then(() => refreshAfterWrite())
    },
  })
}

function keepReview(reviewId: string, author: string): void {
  ask({
    title: t('admin.keepTitle', { name: author }),
    body: t('admin.keepBody', { name: author }),
    confirmLabel: t('admin.keepConfirm'),
    run: () => {
      // Reports exist only in fixture mode — there is nothing to dismiss on the API.
      if (!isLive.value) {
        resolvedReports.value.push(reviewId)
        return refresh()
      }
    },
  })
}

/** The suspend button yields for admins by role, and for the admin themselves. */
function suspendDisabled(user: UserView): boolean {
  if (user.role === 'ADMIN') return true
  return isLive.value && !!current.value && user.id === current.value.id
}

const statusOptions = computed(() => [
  { value: 'ALL', label: t('admin.filterAll') },
  { value: 'PENDING', label: t('status.pending') },
  { value: 'PUBLISHED', label: t('status.published') },
  { value: 'REJECTED', label: t('status.rejected') },
  { value: 'SUSPENDED', label: t('status.suspended') },
])

const tabLabels = computed<Record<AdminTab, string>>(() => ({
  listings: t('admin.tabListings'),
  users: t('admin.tabUsers'),
  reviews: t('admin.tabReviews'),
}))

const roleLabels: Record<string, string> = {
  GUEST: 'admin.roleGuest',
  HOST: 'admin.roleHost',
  ADMIN: 'admin.roleAdmin',
}

const roleTone: Record<string, 'neutral' | 'success' | 'warning' | 'danger' | 'accent'> = {
  GUEST: 'neutral',
  HOST: 'accent',
  ADMIN: 'success',
}

useSeoMeta({
  title: () => `${t('admin.title')} · ${t('common.brand')}`,
  robots: 'noindex, nofollow',
})
</script>

<template>
  <div>
    <h1 class="font-display text-display-l">
      {{ $t('admin.title') }}
    </h1>

    <BaseAlert
      v-if="hasFailed"
      tone="danger"
      class="mt-8"
    >
      {{ $t('common.unexpectedError') }}
    </BaseAlert>

    <div
      v-else-if="isLoading"
      class="mt-8"
    >
      <BaseSkeleton :rows="8" />
    </div>

    <template v-else>
      <dl class="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          :label="$t('admin.statPending')"
          :value="wholeNumber(pendingCount)"
        />
        <StatCard
          :label="$t('admin.statUsers')"
          :value="wholeNumber(usersTotal)"
        />
        <StatCard
          v-if="isLive"
          :label="$t('admin.statHidden')"
          :value="wholeNumber(hiddenCount)"
        />
        <StatCard
          v-else
          :label="$t('admin.statReports')"
          :value="wholeNumber(reportsOpen)"
        />
      </dl>

      <div
        role="tablist"
        class="border-rule mt-10 flex gap-8 border-b"
        :aria-label="$t('admin.title')"
      >
        <button
          v-for="entry in (['listings', 'users', 'reviews'] as const)"
          :key="entry"
          type="button"
          role="tab"
          :aria-selected="tab === entry"
          class="text-label border-b-2 px-1 py-3 uppercase transition-colors duration-150"
          :class="tab === entry ? 'border-accent text-fg' : 'text-fg-muted hover:text-fg border-transparent'"
          @click="tab = entry"
        >
          {{ tabLabels[entry] }}
        </button>
      </div>

      <BaseAlert
        v-if="actionError"
        tone="danger"
        class="mt-6"
      >
        {{ actionError }}
      </BaseAlert>

      <!-- Listings queue. -->
      <section
        v-if="tab === 'listings'"
        aria-labelledby="admin-listings"
        class="mt-6"
      >
        <h2
          id="admin-listings"
          class="sr-only"
        >
          {{ $t('admin.tabListings') }}
        </h2>
        <div class="max-w-[320px]">
          <BaseSelect
            id="admin-status-filter"
            v-model="statusFilter"
            :label="$t('admin.filterByStatus')"
            :options="statusOptions"
          />
        </div>

        <BaseEmptyState
          v-if="!listings.length"
          :title="$t('admin.queueEmptyTitle')"
          :hint="$t('admin.queueEmptyHint')"
          class="mt-6"
        />

        <table
          v-else
          class="mt-4 hidden w-full border-collapse lg:table"
        >
          <caption class="sr-only">
            {{ $t('admin.tabListings') }}
          </caption>
          <thead>
            <tr class="bg-surface-alt text-fg-muted text-left text-label uppercase">
              <th
                scope="col"
                class="px-4 py-3 font-medium"
              >
                {{ $t('host.colProperty') }}
              </th>
              <th
                scope="col"
                class="px-4 py-3 font-medium"
              >
                {{ $t('host.colCity') }}
              </th>
              <th
                scope="col"
                class="px-4 py-3 text-right font-medium"
              >
                {{ $t('host.colRooms') }}
              </th>
              <th
                scope="col"
                class="px-4 py-3 font-medium"
              >
                {{ $t('host.colStatus') }}
              </th>
              <th
                scope="col"
                class="w-64 px-4 py-3 font-medium"
              >
                <span class="sr-only">{{ $t('host.colAction') }}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="hotel in listings"
              :key="hotel.id"
              class="border-rule h-16 border-b"
            >
              <td class="max-w-[280px] truncate px-4 py-2 font-display text-lg">
                {{ hotel.name }}
              </td>
              <td class="px-4 py-2 text-sm">
                {{ hotel.city }}
              </td>
              <td class="tabular px-4 py-2 text-right text-sm">
                {{ wholeNumber(hotel.roomsCount) }}
              </td>
              <td class="px-4 py-2">
                <HotelStatusBadge :status="hotel.status" />
              </td>
              <td class="px-4 py-2">
                <span class="flex gap-2">
                  <button
                    type="button"
                    class="bg-success text-surface flex h-10 flex-1 items-center justify-center rounded-sm px-4 text-sm font-medium transition-colors duration-150 disabled:opacity-40"
                    :disabled="hotel.status === 'PUBLISHED'"
                    @click="approveListing(hotel.id, hotel.name)"
                  >
                    {{ $t('admin.approve') }}
                  </button>
                  <button
                    type="button"
                    class="border-danger text-danger flex h-10 flex-1 items-center justify-center rounded-sm border px-4 text-sm font-medium transition-colors duration-150 disabled:opacity-40"
                    :disabled="hotel.status === 'REJECTED'"
                    @click="rejectListing(hotel.id, hotel.name)"
                  >
                    {{ $t('admin.reject') }}
                  </button>
                </span>
              </td>
            </tr>
          </tbody>
        </table>

        <ul class="flex flex-col lg:hidden">
          <li
            v-for="hotel in listings"
            :key="hotel.id"
            class="border-rule border-b py-5"
          >
            <p class="truncate font-display text-xl">
              {{ hotel.name }}
            </p>
            <p class="text-fg-muted text-sm">
              {{ hotel.city }}
            </p>
            <div class="mt-3 flex flex-wrap items-center gap-3">
              <HotelStatusBadge :status="hotel.status" />
            </div>
            <div class="mt-3 flex gap-2">
              <button
                type="button"
                class="bg-success text-surface flex h-11 flex-1 items-center justify-center rounded-sm px-4 text-sm font-medium disabled:opacity-40"
                :disabled="hotel.status === 'PUBLISHED'"
                @click="approveListing(hotel.id, hotel.name)"
              >
                {{ $t('admin.approve') }}
              </button>
              <button
                type="button"
                class="border-danger text-danger flex h-11 flex-1 items-center justify-center rounded-sm border px-4 text-sm font-medium disabled:opacity-40"
                :disabled="hotel.status === 'REJECTED'"
                @click="rejectListing(hotel.id, hotel.name)"
              >
                {{ $t('admin.reject') }}
              </button>
            </div>
          </li>
        </ul>
      </section>

      <!-- Users. -->
      <section
        v-if="tab === 'users'"
        aria-labelledby="admin-users"
        class="mt-6"
      >
        <h2
          id="admin-users"
          class="sr-only"
        >
          {{ $t('admin.tabUsers') }}
        </h2>
        <table class="hidden w-full border-collapse lg:table">
          <caption class="sr-only">
            {{ $t('admin.tabUsers') }}
          </caption>
          <thead>
            <tr class="bg-surface-alt text-fg-muted text-left text-label uppercase">
              <th
                scope="col"
                class="px-4 py-3 font-medium"
              >
                {{ $t('admin.colName') }}
              </th>
              <th
                scope="col"
                class="px-4 py-3 font-medium"
              >
                {{ $t('admin.colEmail') }}
              </th>
              <th
                scope="col"
                class="px-4 py-3 font-medium"
              >
                {{ $t('admin.colRole') }}
              </th>
              <th
                scope="col"
                class="px-4 py-3 font-medium"
              >
                {{ $t('admin.colState') }}
              </th>
              <th
                scope="col"
                class="w-40 px-4 py-3 font-medium"
              >
                <span class="sr-only">{{ $t('host.colAction') }}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="user in users"
              :key="user.id"
              class="border-rule h-16 border-b"
            >
              <td class="max-w-[220px] truncate px-4 py-2 text-sm font-medium">
                {{ user.name }}
              </td>
              <td class="px-4 py-2 text-sm">
                {{ user.email }}
              </td>
              <td class="px-4 py-2">
                <BaseBadge :status="roleTone[user.role] ?? 'neutral'">
                  {{ $t(roleLabels[user.role] ?? 'admin.roleGuest') }}
                </BaseBadge>
              </td>
              <td class="px-4 py-2">
                <BaseBadge :status="user.suspended ? 'danger' : 'success'">
                  {{
                    user.suspended ? $t('admin.suspended') : $t('admin.active')
                  }}
                </BaseBadge>
              </td>
              <td class="px-4 py-2">
                <button
                  type="button"
                  class="border-rule-strong text-fg hover:border-fg flex h-10 w-full items-center justify-center rounded-sm border px-4 text-sm disabled:opacity-40"
                  :disabled="suspendDisabled(user)"
                  :title="suspendDisabled(user) ? $t('admin.cannotSuspendSelf') : undefined"
                  @click="toggleSuspend(user.id, user.name, user.suspended)"
                >
                  {{
                    user.suspended ? $t('admin.unsuspend') : $t('admin.suspend')
                  }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>

        <ul class="flex flex-col lg:hidden">
          <li
            v-for="user in users"
            :key="user.id"
            class="border-rule border-b py-5"
          >
            <p class="text-sm font-medium">
              {{ user.name }}
            </p>
            <p class="text-fg-muted text-sm">
              {{ user.email }}
            </p>
            <div class="mt-3 flex flex-wrap gap-2">
              <BaseBadge :status="roleTone[user.role] ?? 'neutral'">
                {{ $t(roleLabels[user.role] ?? 'admin.roleGuest') }}
              </BaseBadge>
              <BaseBadge :status="user.suspended ? 'danger' : 'success'">
                {{ user.suspended ? $t('admin.suspended') : $t('admin.active') }}
              </BaseBadge>
            </div>
            <button
              type="button"
              class="border-rule-strong text-fg hover:border-fg mt-3 flex h-11 w-full items-center justify-center rounded-sm border px-4 text-sm disabled:opacity-40"
              :disabled="suspendDisabled(user)"
              @click="toggleSuspend(user.id, user.name, user.suspended)"
            >
              {{ user.suspended ? $t('admin.unsuspend') : $t('admin.suspend') }}
            </button>
          </li>
        </ul>
      </section>

      <!-- Review moderation. -->
      <section
        v-if="tab === 'reviews'"
        aria-labelledby="admin-reviews"
        class="mt-6"
      >
        <h2
          id="admin-reviews"
          class="sr-only"
        >
          {{ $t('admin.tabReviews') }}
        </h2>
        <BaseEmptyState
          v-if="!reviewQueue.length"
          :title="$t('admin.reviewsEmptyTitle')"
          :hint="$t('admin.reviewsEmptyHint')"
        />
        <ul
          v-else
          class="flex max-w-[860px] flex-col gap-4"
        >
          <li
            v-for="review in reviewQueue"
            :key="review.id"
            class="border-rule bg-surface rounded-none border p-5"
          >
            <div class="flex flex-wrap items-center justify-between gap-2">
              <p class="text-sm font-medium">
                {{ review.authorName }}
              </p>
              <BaseBadge
                v-if="review.flagged"
                status="warning"
              >
                {{ $t('admin.reported') }}
              </BaseBadge>
              <BaseBadge
                v-else
                :status="review.status === 'HIDDEN' ? 'danger' : 'success'"
              >
                {{ $t(review.status === 'HIDDEN' ? 'admin.hiddenState' : 'admin.visibleState') }}
              </BaseBadge>
            </div>
            <p class="font-display mt-2 text-lg">
              {{ review.title }}
            </p>
            <p class="prose-70 text-fg-muted mt-1 text-sm">
              {{ review.body }}
            </p>
            <p
              v-if="review.reportReasonKey"
              class="text-fg-subtle mt-3 text-sm"
            >
              {{ $t(review.reportReasonKey) }}
            </p>
            <div class="mt-4 flex gap-2">
              <button
                v-if="review.flagged"
                type="button"
                class="border-rule-strong text-fg hover:border-fg flex h-10 flex-1 items-center justify-center rounded-sm border px-4 text-sm sm:flex-none sm:px-6"
                @click="keepReview(review.id, review.authorName)"
              >
                {{ $t('admin.keep') }}
              </button>
              <button
                v-if="review.status === 'VISIBLE'"
                type="button"
                class="border-danger text-danger flex h-10 flex-1 items-center justify-center rounded-sm border px-4 text-sm sm:flex-none sm:px-6"
                @click="hideReview(review.id, review.authorName)"
              >
                {{ $t('admin.hide') }}
              </button>
              <button
                v-else
                type="button"
                class="border-rule-strong text-fg hover:border-fg flex h-10 flex-1 items-center justify-center rounded-sm border px-4 text-sm sm:flex-none sm:px-6"
                @click="unhideReview(review.id, review.authorName)"
              >
                {{ $t('admin.unhide') }}
              </button>
            </div>
          </li>
        </ul>
      </section>

      <BaseModal
        v-model:open="confirmOpen"
        :title="confirmState?.title ?? ''"
      >
        <p class="text-fg-muted text-sm">
          {{ confirmState?.body }}
        </p>
        <div class="mt-6 flex flex-wrap gap-3">
          <BaseButton
            variant="secondary"
            size="md"
            @click="confirmOpen = false"
          >
            {{ $t('common.back') }}
          </BaseButton>
          <button
            type="button"
            class="bg-accent text-surface hover:bg-accent-hover flex h-12 items-center justify-center rounded-sm px-6 text-sm font-medium transition-colors duration-150"
            @click="doConfirm"
          >
            {{ confirmState?.confirmLabel }}
          </button>
        </div>
      </BaseModal>
    </template>
  </div>
</template>
