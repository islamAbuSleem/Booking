<script setup lang="ts">
/**
 * /dashboard/admin — the moderation console. Dense and tabular: three stat
 * cards, then Listings / Users / Reviews tabs. Every destructive action
 * (approve, reject, suspend, hide) sits behind one confirm modal that names
 * the item. All state is local; the admin API (T25) is the real enforcement.
 */
import { HOTELS, REVIEWS, USERS } from '~/utils/mock'
import { wholeNumber } from '~/utils/format'

definePageMeta({ layout: 'dashboard', middleware: 'auth' })

const { t } = useI18n()

type ListingStatus = 'PENDING' | 'PUBLISHED' | 'REJECTED' | 'SUSPENDED'
type AdminTab = 'listings' | 'users' | 'reviews'

const tab = ref<AdminTab>('listings')
const statusFilter = ref<'ALL' | ListingStatus>('PENDING')

/** Local overrides on the fixture statuses. */
const listingStatus = ref<Record<string, ListingStatus>>(
  Object.fromEntries(HOTELS.map(hotel => [hotel.id, hotel.status])),
)
const suspendedUsers = ref<string[]>([])
const hiddenReviews = ref<Record<string, 'VISIBLE' | 'HIDDEN'>>(
  Object.fromEntries(REVIEWS.map(review => [review.id, review.status])),
)
/**
 * Placeholder report reasons until the reviews API (T24) supplies real flags.
 * Keyed by review id, so the wiring ticket replaces this map with data.
 */
const REPORT_REASONS: Record<string, string> = {
  rev_2: 'admin.reportReasonContact',
  rev_4: 'admin.reportReasonSpam',
}
const resolvedReports = ref<string[]>([])

const pendingCount = computed(
  () => Object.values(listingStatus.value).filter(status => status === 'PENDING').length,
)
const reportsOpen = computed(
  () => REVIEWS.filter(review => REPORT_REASONS[review.id] && !resolvedReports.value.includes(review.id)).length,
)

const filteredListings = computed(() =>
  HOTELS.filter(hotel => statusFilter.value === 'ALL' || listingStatus.value[hotel.id] === statusFilter.value),
)

const reviewQueue = computed(() =>
  REVIEWS.filter(review => REPORT_REASONS[review.id] && !resolvedReports.value.includes(review.id)),
)

interface ConfirmState {
  title: string
  body: string
  confirmLabel: string
  run: () => void
}

const confirmOpen = ref(false)
const confirmState = ref<ConfirmState | null>(null)

function ask(state: ConfirmState): void {
  confirmState.value = state
  confirmOpen.value = true
}

function doConfirm(): void {
  confirmState.value?.run()
  confirmOpen.value = false
  confirmState.value = null
}

function approveListing(hotelId: string, name: string): void {
  ask({
    title: t('admin.approveTitle', { name }),
    body: t('admin.approveBody', { name }),
    confirmLabel: t('admin.approveConfirm'),
    run: () => {
      listingStatus.value[hotelId] = 'PUBLISHED'
    },
  })
}

function rejectListing(hotelId: string, name: string): void {
  ask({
    title: t('admin.rejectTitle', { name }),
    body: t('admin.rejectBody', { name }),
    confirmLabel: t('admin.rejectConfirm'),
    run: () => {
      listingStatus.value[hotelId] = 'REJECTED'
    },
  })
}

function toggleSuspend(userId: string, name: string): void {
  const suspending = !suspendedUsers.value.includes(userId)
  ask({
    title: suspending ? t('admin.suspendTitle', { name }) : t('admin.unsuspendTitle', { name }),
    body: suspending ? t('admin.suspendBody', { name }) : t('admin.unsuspendBody', { name }),
    confirmLabel: suspending ? t('admin.suspendConfirm') : t('admin.unsuspendConfirm'),
    run: () => {
      suspendedUsers.value = suspending
        ? [...suspendedUsers.value, userId]
        : suspendedUsers.value.filter(id => id !== userId)
    },
  })
}

function hideReview(reviewId: string, author: string): void {
  ask({
    title: t('admin.hideTitle', { name: author }),
    body: t('admin.hideBody', { name: author }),
    confirmLabel: t('admin.hideConfirm'),
    run: () => {
      hiddenReviews.value[reviewId] = 'HIDDEN'
      resolvedReports.value.push(reviewId)
    },
  })
}

function keepReview(reviewId: string, author: string): void {
  ask({
    title: t('admin.keepTitle', { name: author }),
    body: t('admin.keepBody', { name: author }),
    confirmLabel: t('admin.keepConfirm'),
    run: () => {
      resolvedReports.value.push(reviewId)
    },
  })
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

    <dl class="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
      <StatCard
        :label="$t('admin.statPending')"
        :value="wholeNumber(pendingCount)"
      />
      <StatCard
        :label="$t('admin.statUsers')"
        :value="wholeNumber(USERS.length)"
      />
      <StatCard
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
        v-if="!filteredListings.length"
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
            v-for="hotel in filteredListings"
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
              {{ wholeNumber(hotel.rooms.length) }}
            </td>
            <td class="px-4 py-2">
              <HotelStatusBadge :status="listingStatus[hotel.id] ?? 'PENDING'" />
            </td>
            <td class="px-4 py-2">
              <span class="flex gap-2">
                <button
                  type="button"
                  class="bg-success text-surface flex h-10 flex-1 items-center justify-center rounded-sm px-4 text-sm font-medium transition-colors duration-150 disabled:opacity-40"
                  :disabled="(listingStatus[hotel.id] ?? 'PENDING') === 'PUBLISHED'"
                  @click="approveListing(hotel.id, hotel.name)"
                >
                  {{ $t('admin.approve') }}
                </button>
                <button
                  type="button"
                  class="border-danger text-danger flex h-10 flex-1 items-center justify-center rounded-sm border px-4 text-sm font-medium transition-colors duration-150 disabled:opacity-40"
                  :disabled="(listingStatus[hotel.id] ?? 'PENDING') === 'REJECTED'"
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
          v-for="hotel in filteredListings"
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
            <HotelStatusBadge :status="listingStatus[hotel.id] ?? 'PENDING'" />
          </div>
          <div class="mt-3 flex gap-2">
            <button
              type="button"
              class="bg-success text-surface flex h-11 flex-1 items-center justify-center rounded-sm px-4 text-sm font-medium disabled:opacity-40"
              :disabled="(listingStatus[hotel.id] ?? 'PENDING') === 'PUBLISHED'"
              @click="approveListing(hotel.id, hotel.name)"
            >
              {{ $t('admin.approve') }}
            </button>
            <button
              type="button"
              class="border-danger text-danger flex h-11 flex-1 items-center justify-center rounded-sm border px-4 text-sm font-medium disabled:opacity-40"
              :disabled="(listingStatus[hotel.id] ?? 'PENDING') === 'REJECTED'"
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
            v-for="user in USERS"
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
              <BaseBadge :status="suspendedUsers.includes(user.id) ? 'danger' : 'success'">
                {{
                  suspendedUsers.includes(user.id) ? $t('admin.suspended') : $t('admin.active')
                }}
              </BaseBadge>
            </td>
            <td class="px-4 py-2">
              <button
                type="button"
                class="border-rule-strong text-fg hover:border-fg flex h-10 w-full items-center justify-center rounded-sm border px-4 text-sm disabled:opacity-40"
                :disabled="user.role === 'ADMIN'"
                :title="user.role === 'ADMIN' ? $t('admin.cannotSuspendSelf') : undefined"
                @click="toggleSuspend(user.id, user.name)"
              >
                {{
                  suspendedUsers.includes(user.id) ? $t('admin.unsuspend') : $t('admin.suspend')
                }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <ul class="flex flex-col lg:hidden">
        <li
          v-for="user in USERS"
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
            <BaseBadge :status="suspendedUsers.includes(user.id) ? 'danger' : 'success'">
              {{ suspendedUsers.includes(user.id) ? $t('admin.suspended') : $t('admin.active') }}
            </BaseBadge>
          </div>
          <button
            type="button"
            class="border-rule-strong text-fg hover:border-fg mt-3 flex h-11 w-full items-center justify-center rounded-sm border px-4 text-sm disabled:opacity-40"
            :disabled="user.role === 'ADMIN'"
            @click="toggleSuspend(user.id, user.name)"
          >
            {{ suspendedUsers.includes(user.id) ? $t('admin.unsuspend') : $t('admin.suspend') }}
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
            <BaseBadge status="warning">
              {{ $t('admin.reported') }}
            </BaseBadge>
          </div>
          <p class="font-display mt-2 text-lg">
            {{ review.title }}
          </p>
          <p class="prose-70 text-fg-muted mt-1 text-sm">
            {{ review.body }}
          </p>
          <p class="text-fg-subtle mt-3 text-sm">
            {{ $t(REPORT_REASONS[review.id] ?? 'admin.reportReasonOther') }}
          </p>
          <div class="mt-4 flex gap-2">
            <button
              type="button"
              class="border-rule-strong text-fg hover:border-fg flex h-10 flex-1 items-center justify-center rounded-sm border px-4 text-sm sm:flex-none sm:px-6"
              @click="keepReview(review.id, review.authorName)"
            >
              {{ $t('admin.keep') }}
            </button>
            <button
              type="button"
              class="border-danger text-danger flex h-10 flex-1 items-center justify-center rounded-sm border px-4 text-sm sm:flex-none sm:px-6"
              @click="hideReview(review.id, review.authorName)"
            >
              {{ $t('admin.hide') }}
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
  </div>
</template>
