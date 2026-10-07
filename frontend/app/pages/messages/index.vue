<script setup lang="ts">
/**
 * /messages — the guest's conversations. A calm list: one row per thread with the
 * peer, the booking reference, and the unread badge. Polls every 10s so a host
 * reply lands without a reload; the poll only refreshes, never resets scroll.
 *
 * T35: the API is the only source. A 401 (anonymous) or a transport failure degrades
 * to an empty list with the empty state; any other envelope error is a real answer
 * and drives the error state.
 */
import { fetchThreads, isApiError, isApiFailure } from '~/utils/api'
import type { ApiThread } from '~/utils/api'
import { formatStayDate, wholeNumber } from '~/utils/format'

const { t } = useI18n()

/** The 10s poll the ticket specifies. Cleared on unmount so no timer leaks. */
const POLL_MS = 10_000

interface ThreadsPayload {
  threads: ApiThread[]
}

const {
  data,
  status,
  error,
  refresh,
} = await useAsyncData<ThreadsPayload>(
  'messages:threads',
  async (): Promise<ThreadsPayload> => {
    try {
      const list = await fetchThreads()
      return { threads: list.items }
    }
    catch (fetchError: unknown) {
      if (isApiFailure(fetchError) && (!isApiError(fetchError) || fetchError.code !== 'UNAUTHORIZED')) {
        throw fetchError
      }
      return { threads: [] }
    }
  },
)

const threads = computed(() => data.value?.threads ?? [])
const totalUnread = computed(() =>
  threads.value.reduce((sum, thread) => sum + thread.unreadCount, 0),
)

/** Skeletons only when there is nothing to show — never on a background refresh. */
const isLoading = computed(() => status.value === 'pending' && !data.value)
const hasFailed = computed(() => status.value === 'error')
const isEmpty = computed(() => !isLoading.value && !hasFailed.value && threads.value.length === 0)

let timer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  timer = setInterval(() => {
    void refresh()
  }, POLL_MS)
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
})

useSeoMeta({
  title: () => `${t('messages.title')} · ${t('common.brand')}`,
  description: () => t('messages.metaDescription'),
  robots: 'noindex, nofollow',
})
</script>

<template>
  <div class="mx-auto max-w-[1280px] px-6 py-10 lg:py-14">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <h1 class="font-display text-display-l">
        {{ $t('messages.title') }}
      </h1>
      <p
        v-if="totalUnread > 0"
        class="bg-accent text-surface text-label rounded-sm px-2 py-1 uppercase"
        role="status"
      >
        {{ totalUnread === 1 ? $t('messages.unreadOne') : $t('messages.unread', { count: wholeNumber(totalUnread) }) }}
      </p>
    </div>
    <div class="border-rule mt-4 border-b" />

    <div
      class="mt-6"
      :aria-busy="isLoading"
    >
      <!-- Loading. A static block, no shimmer. -->
      <div
        v-if="isLoading"
        class="border-rule bg-surface rounded-none border p-5"
      >
        <p
          class="sr-only"
          role="status"
        >
          {{ $t('messages.loadingThreads') }}
        </p>
        <BaseSkeleton :rows="4" />
      </div>

      <!-- Error. The retry is a retry, not a restart. -->
      <BaseAlert
        v-else-if="hasFailed"
        tone="danger"
        :title="$t('messages.loadError')"
      >
        <p>{{ $t('messages.loadErrorHint') }}</p>
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

      <BaseEmptyState
        v-else-if="isEmpty"
        :title="$t('messages.emptyTitle')"
        :hint="$t('messages.emptyHint')"
        class="mt-8"
      >
        <BaseButton
          to="/hotels"
          variant="primary"
          size="md"
        >
          {{ $t('messages.browseStays') }}
        </BaseButton>
      </BaseEmptyState>

      <!-- Conversation list. Newest first, unread badge per row. -->
      <ul
        v-else
        class="border-rule divide-rule flex flex-col divide-y border-y"
      >
        <li
          v-for="thread in threads"
          :key="thread.id"
        >
          <NuxtLink
            :to="`/messages/${thread.id}`"
            class="hover:bg-surface flex items-center gap-4 px-4 py-4 transition-colors duration-150"
            :aria-label="$t('messages.openThread')"
          >
            <div class="min-w-0 flex-1">
              <p class="font-mono text-sm">
                {{ thread.bookingId.slice(0, 8) }}
              </p>
              <p
                v-if="thread.lastMessageAt"
                class="text-fg-muted tabular mt-1 text-sm"
              >
                {{ $t('messages.lastMessage', { date: formatStayDate(thread.lastMessageAt.slice(0, 10)) }) }}
              </p>
            </div>
            <span
              v-if="thread.unreadCount > 0"
              class="bg-accent text-surface tabular rounded-sm px-2 py-1 text-sm"
              role="status"
            >
              {{ wholeNumber(thread.unreadCount) }}
            </span>
          </NuxtLink>
        </li>
      </ul>
    </div>
  </div>
</template>
