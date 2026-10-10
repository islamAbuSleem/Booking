import {
  type BookingParties,
  type MessageRecord,
  type ThreadRecord,
  type ThreadsRepository,
} from '../../prisma/threads.repository.js';
import { ThreadsService } from './threads.service.js';

const GUEST_ID = '11111111-1111-4111-8111-111111111111';
const HOST_ID = '22222222-2222-4222-8222-222222222222';
const STRANGER_ID = '33333333-3333-4333-8333-333333333333';
const BOOKING_ID = '44444444-4444-4444-8444-444444444444';
const MISSING_BOOKING_ID = '99999999-9999-4999-8999-999999999999';
const CREATED_AT = new Date('2026-05-20T10:00:00.000Z');

/**
 * Stands in for Prisma. The service talks to `ThreadsRepository`, not `PrismaService`,
 * so every rule in this file runs with no database and no Nest container.
 *
 * `threads` is keyed by the triple, which is what the unique key does: a second create
 * for the same triple returns the row, never a duplicate, and one triple's thread can
 * never be read as another's.
 */
class FakeThreadsRepository implements ThreadsRepository {
  readonly threads = new Map<string, ThreadRecord>();
  readonly messages: MessageRecord[] = [];
  readonly creates: string[] = [];

  constructor(
    private readonly bookings: Map<string, BookingParties> = new Map([
      [BOOKING_ID, { bookingId: BOOKING_ID, guestId: GUEST_ID, hostId: HOST_ID }],
    ]),
  ) {}

  private static key(bookingId: string, guestId: string, hostId: string): string {
    return `${bookingId}:${guestId}:${hostId}`;
  }

  async findBookingParties(bookingId: string): Promise<BookingParties | null> {
    return this.bookings.get(bookingId) ?? null;
  }

  async findThreadById(threadId: string): Promise<ThreadRecord | null> {
    return [...this.threads.values()].find((row) => row.id === threadId) ?? null;
  }

  async findThread(
    bookingId: string,
    guestId: string,
    hostId: string,
  ): Promise<ThreadRecord | null> {
    return (
      this.threads.get(FakeThreadsRepository.key(bookingId, guestId, hostId)) ??
      null
    );
  }

  async findThreadsForUser(userId: string): Promise<ThreadRecord[]> {
    return [...this.threads.values()]
      .filter((row) => row.guestId === userId || row.hostId === userId)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  async findLastMessageTimes(threadIds: readonly string[]): Promise<Map<string, Date>> {
    const times = new Map<string, Date>();
    for (const message of this.messages) {
      if (!threadIds.includes(message.threadId)) continue;
      const current = times.get(message.threadId);
      if (!current || message.createdAt > current) {
        times.set(message.threadId, message.createdAt);
      }
    }
    return times;
  }

  async createThread(
    bookingId: string,
    guestId: string,
    hostId: string,
  ): Promise<ThreadRecord> {
    const key = FakeThreadsRepository.key(bookingId, guestId, hostId);
    const existing = this.threads.get(key);
    if (existing) return existing;
    this.creates.push(key);
    const record: ThreadRecord = {
      id: `thread-${this.threads.size + 1}`,
      bookingId,
      guestId,
      hostId,
      guestUnread: 0,
      hostUnread: 0,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    };
    this.threads.set(key, record);
    return record;
  }

  async createMessage(
    threadId: string,
    senderId: string,
    body: string,
  ): Promise<MessageRecord> {
    const thread = await this.findThreadById(threadId);
    if (!thread) throw new Error('THREAD_NOT_FOUND');
    if (senderId === thread.guestId) thread.hostUnread += 1;
    else thread.guestUnread += 1;
    const record: MessageRecord = {
      id: `message-${this.messages.length + 1}`,
      threadId,
      senderId,
      body,
      createdAt: new Date(CREATED_AT.getTime() + this.messages.length * 1000),
      readAt: null,
    };
    this.messages.push(record);
    return record;
  }

  async findMessages(
    threadId: string,
    before: string | null,
    limit: number,
  ): Promise<MessageRecord[]> {
    let rows = this.messages.filter((row) => row.threadId === threadId);
    if (before) {
      const cursor = rows.find((row) => row.id === before);
      if (!cursor) return [];
      rows = rows.filter((row) => row.createdAt < cursor.createdAt);
    }
    return rows.slice(-limit);
  }

  async markThreadRead(
    threadId: string,
    readerId: string,
  ): Promise<ThreadRecord | null> {
    const thread = await this.findThreadById(threadId);
    if (!thread) return null;
    if (readerId === thread.guestId) thread.guestUnread = 0;
    else thread.hostUnread = 0;
    for (const message of this.messages) {
      if (
        message.threadId === threadId &&
        message.senderId !== readerId &&
        !message.readAt
      ) {
        message.readAt = new Date();
      }
    }
    return thread;
  }
}

function service(repository = new FakeThreadsRepository()): {
  threads: ThreadsService;
  repository: FakeThreadsRepository;
} {
  return { threads: new ThreadsService(repository), repository };
}

describe('ThreadsService.createThread', () => {
  it('creates the thread and the first message, reusing the triple on the second call', async () => {
    const { threads, repository } = service();

    const first = await threads.createThread(GUEST_ID, {
      bookingId: BOOKING_ID,
      body: 'Hello, is check-in flexible?',
    });
    const second = await threads.createThread(GUEST_ID, {
      bookingId: BOOKING_ID,
      body: 'A second opener on the same booking.',
    });

    expect(first.id).toBe(second.id);
    expect(repository.creates).toEqual([
      `${BOOKING_ID}:${GUEST_ID}:${HOST_ID}`,
    ]);
    expect(repository.messages.map((row) => row.body)).toEqual([
      'Hello, is check-in flexible?',
      'A second opener on the same booking.',
    ]);
  });

  it('404s BOOKING_NOT_FOUND for a booking that does not exist, and writes nothing', async () => {
    const { threads, repository } = service();

    await expect(
      threads.createThread(GUEST_ID, { bookingId: MISSING_BOOKING_ID, body: 'Hi' }),
    ).rejects.toMatchObject({
      status: 404,
      response: { code: 'BOOKING_NOT_FOUND' },
    });
    expect(repository.creates).toEqual([]);
    expect(repository.messages).toEqual([]);
  });

  it('403s NOT_THREAD_PARTICIPANT when the caller is neither the guest nor the host', async () => {
    // The parties come from the booking, so a stranger with a valid booking id still
    // cannot conjure a thread between other people.
    const { threads, repository } = service();

    await expect(
      threads.createThread(STRANGER_ID, { bookingId: BOOKING_ID, body: 'Hi' }),
    ).rejects.toMatchObject({
      status: 403,
      response: { code: 'NOT_THREAD_PARTICIPANT' },
    });
    expect(repository.creates).toEqual([]);
  });

  it('lets the host open the thread, not just the guest', async () => {
    const { threads } = service();

    const thread = await threads.createThread(HOST_ID, {
      bookingId: BOOKING_ID,
      body: 'Welcome — what time do you arrive?',
    });

    expect(thread.guestId).toBe(GUEST_ID);
    expect(thread.hostId).toBe(HOST_ID);
  });
});

describe('ThreadsService.list', () => {
  it('returns only the caller\u2019s threads with the caller\u2019s own unread count', async () => {
    const { threads } = service();
    await threads.createThread(GUEST_ID, { bookingId: BOOKING_ID, body: 'Hi' });

    const guest = await threads.list(GUEST_ID);
    const host = await threads.list(HOST_ID);
    const stranger = await threads.list(STRANGER_ID);

    expect(guest.total).toBe(1);
    expect(guest.items[0]?.unreadCount).toBe(0);
    expect(host.total).toBe(1);
    expect(host.items[0]?.unreadCount).toBe(1);
    expect(stranger).toEqual({ items: [], total: 0 });
  });
});

describe('ThreadsService messaging', () => {
  it('bumps the peer\u2019s counter on every message, independently per side', async () => {
    const { threads } = service();
    const thread = await threads.createThread(GUEST_ID, {
      bookingId: BOOKING_ID,
      body: 'Hi',
    });
    await threads.sendMessage(HOST_ID, thread.id, { body: 'Hello!' });

    const guest = await threads.list(GUEST_ID);
    const host = await threads.list(HOST_ID);

    expect(guest.items[0]?.unreadCount).toBe(1);
    expect(host.items[0]?.unreadCount).toBe(1);
  });

  it('marks read for the reader only, leaving the peer\u2019s badge untouched', async () => {
    // The ticket's verify line, at the service level: independent counters.
    const { threads } = service();
    const thread = await threads.createThread(GUEST_ID, {
      bookingId: BOOKING_ID,
      body: 'Hi',
    });
    await threads.sendMessage(HOST_ID, thread.id, { body: 'Hello!' });

    const cleared = await threads.markRead(GUEST_ID, thread.id);
    const guest = await threads.list(GUEST_ID);
    const host = await threads.list(HOST_ID);

    expect(cleared).toEqual({ unreadCount: 0 });
    expect(guest.items[0]?.unreadCount).toBe(0);
    expect(host.items[0]?.unreadCount).toBe(1);
  });

  it('403s NOT_THREAD_PARTICIPANT for a stranger on every thread route', async () => {
    const { threads } = service();
    const thread = await threads.createThread(GUEST_ID, {
      bookingId: BOOKING_ID,
      body: 'Hi',
    });

    await expect(threads.listMessages(STRANGER_ID, thread.id, null)).rejects.toMatchObject(
      { status: 403, response: { code: 'NOT_THREAD_PARTICIPANT' } },
    );
    await expect(
      threads.sendMessage(STRANGER_ID, thread.id, { body: 'Hi' }),
    ).rejects.toMatchObject({
      status: 403,
      response: { code: 'NOT_THREAD_PARTICIPANT' },
    });
    await expect(threads.markRead(STRANGER_ID, thread.id)).rejects.toMatchObject(
      { status: 403, response: { code: 'NOT_THREAD_PARTICIPANT' } },
    );
  });

  it('404s THREAD_NOT_FOUND for a thread id that does not exist', async () => {
    const { threads } = service();

    await expect(
      threads.listMessages(GUEST_ID, 'no-such-thread', null),
    ).rejects.toMatchObject({
      status: 404,
      response: { code: 'THREAD_NOT_FOUND' },
    });
  });
});
