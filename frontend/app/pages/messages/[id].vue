<script setup lang="ts">
/**
 * /messages/[id] — one conversation. The message list polls every 10s; opening the
 * thread marks it read, and every poll that finds peer messages marks read again,
 * so the badge clears without the guest doing anything. The composer keeps its
 * value on a failed send: a failed submit keeps the form filled.
 *
 * Read receipts render per message: `readAt` set means the peer has seen it.
 */
import {
  fetchThreadMessages,
  fetchThreads,
  isApiError,
  isApiFailure,
  markThreadRead,
  sendThreadMessage,
} from '~/utils/api'
import type { ApiThread, ApiThreadMessage } from '~/utils/api'
import { useAuth } from '~/composables/useAuth'
import { useThreadSocket } from '~/composables/useThreadSocket'

const { t } = useI18n()
const route = useRoute()
const { current: user } = useAuth()

/** The 10s poll the ticket specifies. Cleared on unmount so no timer leaks. */
const POLL_MS = 10_000
const MAX_BODY = 5000

const threadId = computed(() => String(route.params.id ?? ''))

interface ThreadPayload {
  thread: ApiThread | null
  failed: boolean
  forbidden: boolean
}

const {
  data: threadPayload,
  status: threadStatus,
  refresh: refreshThread,
} = await useAsyncData<ThreadPayload>(
  () => `messages:thread:${threadId.value}`,
  async (): Promise<ThreadPayload> => {
    try {
      const list = await fetchThreads()
      const thread = list.items.find(item => item.id === threadId.value) ?? null
      if (!thread) return { thread: null, failed: false, forbidden: false }
      return { thread, failed: false, forbidden: false }
    }
    catch (fetchError: unknown) {
      if (isApiError(fetchError) && fetchError.code === 'NOT_THREAD_PARTICIPANT') {
        return { thread: null, failed: false, forbidden: true }
      }
      if (isApiFailure(fetchError)) {
        return { thread: null, failed: true, forbidden: false }
      }
      return { thread: null, failed: false, forbidden: false }
    }
  },
)

interface MessagesPayload {
  messages: ApiThreadMessage[]
  failed: boolean
  forbidden: boolean
}

const {
  data: messagesPayload,
  status: messagesStatus,
  refresh: refreshMessages,
} = await useAsyncData<MessagesPayload>(
  () => `messages:thread:${threadId.value}:messages`,
  async (): Promise<MessagesPayload> => {
    try {
      const page = await fetchThreadMessages(threadId.value)
      return { messages: page.items, failed: false, forbidden: false }
    }
    catch (fetchError: unknown) {
      if (isApiError(fetchError) && fetchError.code === 'NOT_THREAD_PARTICIPANT') {
        return { messages: [], failed: false, forbidden: true }
      }
      if (isApiFailure(fetchError)) {
        return { messages: [], failed: true, forbidden: false }
      }
      return { messages: [], failed: true, forbidden: false }
    }
  },
)

const thread = computed(() => threadPayload.value?.thread ?? null)
const fetched = computed(() => messagesPayload.value?.messages ?? [])

/**
 * T36 — live arrivals the latest HTTP page does not cover yet. Merged below by id,
 * so a message that arrives over both the socket and the 10s poll renders once.
 * A successful poll drops the entries it already covers.
 */
const live = ref<ApiThreadMessage[]>([])

const messages = computed(() => {
  const seen = new Set(fetched.value.map(message => message.id))
  const merged = [...fetched.value]
  for (const message of live.value) {
    if (!seen.has(message.id)) {
      seen.add(message.id)
      merged.push(message)
    }
  }
  return merged.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
})
const hasFailed = computed(
  () => threadPayload.value?.failed === true || messagesPayload.value?.failed === true,
)
const isForbidden = computed(
  () => threadPayload.value?.forbidden === true || messagesPayload.value?.forbidden === true,
)
const notFound = computed(
  () => !hasFailed.value && !isForbidden.value && threadStatus.value !== 'pending' && !thread.value,
)
const isLoading = computed(
  () => (threadStatus.value === 'pending' || messagesStatus.value === 'pending') && !thread.value && messages.value.length === 0,
)

const draft = ref('')
const sending = ref(false)
const sendFailed = ref(false)
const myId = computed(() => user.value?.id ?? '')

function isMine(message: ApiThreadMessage): boolean {
  return myId.value !== '' && message.senderId === myId.value
}

async function markRead(): Promise<void> {
  if (!thread.value) return
  try {
    await markThreadRead(thread.value.id)
  }
  catch {
    // Read receipts are best-effort: a failed mark must never break the thread view.
  }
}

async function send(): Promise<void> {
  const body = draft.value.trim()
  if (!body || sending.value || !thread.value) return
  sending.value = true
  sendFailed.value = false
  try {
    const message = await sendThreadMessage(thread.value.id, { body: body.slice(0, MAX_BODY) })
    // Optimistic, id-keyed: the socket fan-out and the next poll dedupe on render.
    live.value.push(message)
    draft.value = ''
    await refreshMessages()
    pruneLive()
    await markRead()
  }
  catch {
    // The draft stays: a failed submit keeps the form filled.
    sendFailed.value = true
  }
  finally {
    sending.value = false
  }
}

/** Drops live arrivals the latest fetched page already covers. */
function pruneLive(): void {
  const fetchedIds = new Set(fetched.value.map(message => message.id))
  live.value = live.value.filter(message => !fetchedIds.has(message.id))
}

/**
 * T36 — the live connection. Socket arrivals append instantly; the 10s HTTP poll
 * below keeps running as the fallback, and a reconnect refetches anything the drop
 * swallowed rather than trusting a replay buffer.
 */
const { connected } = useThreadSocket({
  threadId: threadId.value,
  onMessage: (message) => {
    if (message.threadId !== threadId.value) return
    live.value.push(message)
    if (myId.value === '' || message.senderId !== myId.value) {
      void markRead()
    }
  },
  onRead: () => {
    void refreshMessages().then(() => pruneLive())
  },
  onReconnect: () => {
    void refreshMessages().then(() => {
      pruneLive()
      void markRead()
    })
  },
})

/** The banner shows on a drop, not on first load: no backend WS means quiet polling. */
const everConnected = ref(false)
watch(connected, (value) => {
  if (value) everConnected.value = true
})
const showReconnect = computed(() => everConnected.value && !connected.value)

let timer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  void markRead()
  timer = setInterval(() => {
    void refreshMessages().then(() => {
      pruneLive()
      void markRead()
    })
  }, POLL_MS)
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
})

function retry(): void {
  void refreshThread()
  void refreshMessages()
}

useSeoMeta({
  title: () => `${t('messages.title')} · ${t('common.brand')}`,
  description: () => t('messages.metaDescription'),
  robots: 'noindex, nofollow',
})
</script>

<template>
  <div class="mx-auto w-full max-w-[720px] px-6 py-10 lg:py-14">
    <NuxtLink
      to="/messages"
      class="text-link text-sm underline-offset-4 hover:underline"
    >
      {{ $t('messages.backToMessages') }}
    </NuxtLink>

    <h1 class="font-display text-display-l mt-4">
      {{ $t('messages.title') }}
    </h1>
    <div class="border-rule mt-4 border-b" />

    <!-- T36: live updates paused. The 10s poll below still delivers. -->
    <BaseAlert
      v-if="showReconnect"
      tone="warning"
      :title="$t('messages.reconnecting')"
      class="mt-4"
    >
      {{ $t('messages.reconnectHint') }}
    </BaseAlert>

    <div
      class="mt-6"
      :aria-busy="isLoading"
    >
      <div
        v-if="isLoading"
        class="border-rule bg-surface rounded-none border p-5"
      >
        <p
          class="sr-only"
          role="status"
        >
          {{ $t('messages.loadingMessages') }}
        </p>
        <BaseSkeleton :rows="4" />
      </div>

      <BaseAlert
        v-else-if="hasFailed"
        tone="danger"
        :title="$t('messages.loadError')"
      >
        <p>{{ $t('messages.loadErrorHint') }}</p>
        <button
          type="button"
          class="border-danger text-danger mt-2 inline-flex h-11 items-center rounded-sm border px-4 text-sm"
          @click="retry()"
        >
          {{ $t('common.retry') }}
        </button>
      </BaseAlert>

      <BaseEmptyState
        v-else-if="isForbidden || notFound"
        :title="$t('messages.threadNotFound')"
        :hint="$t('messages.threadNotFoundHint')"
      >
        <BaseButton
          to="/messages"
          variant="secondary"
          size="md"
        >
          {{ $t('messages.backToMessages') }}
        </BaseButton>
      </BaseEmptyState>

      <template v-else>
        <!-- Message list. Own messages right, peer messages left. -->
        <ul
          class="flex flex-col gap-4"
          aria-live="polite"
        >
          <li
            v-for="message in messages"
            :key="message.id"
            class="flex"
            :class="isMine(message) ? 'justify-end' : 'justify-start'"
          >
            <div
              class="max-w-[80%] rounded-sm border px-4 py-3"
              :class="isMine(message)
                ? 'border-accent bg-accent-wash'
                : 'border-rule bg-surface'"
            >
              <p class="text-sm">
                {{ message.body }}
              </p>
              <p class="text-fg-muted tabular mt-1 text-right text-xs">
                <template v-if="isMine(message)">
                  {{ message.readAt ? $t('messages.readReceipt') : $t('messages.delivered') }}
                  ·
                </template>
                {{ message.createdAt.slice(11, 16) }}
              </p>
            </div>
          </li>
        </ul>

        <p
          v-if="messages.length === 0"
          class="text-fg-muted mt-4 text-sm"
        >
          {{ $t('messages.noMessages') }}
        </p>

        <!-- Composer. The draft survives a failed send. -->
        <form
          class="border-rule bg-surface mt-6 rounded-none border p-4"
          @submit.prevent="send()"
        >
          <label
            for="message-composer"
            class="text-fg-muted text-label uppercase"
          >
            {{ $t('messages.composerLabel') }}
          </label>
          <textarea
            id="message-composer"
            v-model="draft"
            rows="3"
            :maxlength="MAX_BODY"
            :placeholder="$t('messages.composerPlaceholder')"
            class="border-rule-strong bg-surface mt-2 w-full rounded-sm border px-3 py-3 text-sm focus:border-fg focus:outline-none"
          />
          <p
            v-if="sendFailed"
            class="text-danger mt-2 text-sm"
            role="alert"
          >
            {{ $t('messages.sendError') }}
          </p>
          <div class="mt-3 flex justify-end">
            <BaseButton
              type="submit"
              variant="primary"
              size="md"
              :loading="sending"
              :disabled="sending || draft.trim().length === 0"
            >
              {{ sending ? $t('messages.sending') : $t('messages.send') }}
            </BaseButton>
          </div>
        </form>
      </template>
    </div>
  </div>
</template>
