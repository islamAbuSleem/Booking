import { io, type Socket } from 'socket.io-client'
import type { ApiThreadMessage } from '~/utils/api'

/**
 * T36 — the live thread connection. Joins the thread's room on connect and
 * re-joins on every reconnect, so a dropped socket resubscribes by itself.
 *
 * The socket is the fast path, never the only path: `connected === false` means
 * the page's 10s HTTP poll owns delivery (and shows the reconnect banner), and
 * every reconnect refetches missed messages over HTTP via `?before=` rather than
 * trusting a replay buffer.
 */
export function useThreadSocket(options: {
  threadId: string
  onMessage: (message: ApiThreadMessage) => void
  onRead: (readerId: string) => void
  onReconnect: () => void
}): {
  connected: Readonly<Ref<boolean>>
  disconnect: () => void
} {
  const connected = ref(false)
  let socket: Socket | null = null

  function join(): void {
    socket?.emit(
      'thread:join',
      { threadId: options.threadId },
      (answer: unknown) => {
        // A refusal (not a participant) leaves `connected` as-is: the HTTP poll
        // below still renders the thread, and the ack shape is the server's 403.
        if (
          typeof answer === 'object'
          && answer !== null
          && 'ok' in answer
          && (answer as { ok: unknown }).ok === true
        ) {
          connected.value = true
        }
      },
    )
  }

  onMounted(() => {
    const { apiBase } = useRuntimeConfig().public
    const base
      = typeof apiBase === 'string' && apiBase.length > 0 ? apiBase : 'http://localhost:3000'
    socket = io(base, { withCredentials: true, transports: ['websocket', 'polling'] })

    socket.on('message:new', (message: ApiThreadMessage) => {
      options.onMessage(message)
    })
    socket.on('message:read', (payload: { readerId: string }) => {
      options.onRead(payload.readerId)
    })
    socket.on('connect', () => {
      join()
    })
    // Reconnect: rejoin the room, then refetch anything the drop swallowed.
    socket.on('reconnect', () => {
      join()
      options.onReconnect()
    })
    socket.on('disconnect', () => {
      connected.value = false
    })
  })

  onUnmounted(() => {
    socket?.disconnect()
    socket = null
    connected.value = false
  })

  return {
    connected: readonly(connected),
    disconnect: () => {
      socket?.disconnect()
    },
  }
}
