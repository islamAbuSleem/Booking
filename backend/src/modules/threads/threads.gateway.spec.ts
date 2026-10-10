import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { UserRecord } from '../users/users.repository.js';
import {
  type BookingParties,
  type MessageRecord,
  type ThreadRecord,
  type ThreadsRepository,
} from '../../prisma/threads.repository.js';
import { ThreadsService } from './threads.service.js';
import { ThreadsGateway, threadRoom } from './threads.gateway.js';

const GUEST_ID = '11111111-1111-4111-8111-111111111111';
const HOST_ID = '22222222-2222-4222-8222-222222222222';
const STRANGER_ID = '33333333-3333-4333-8333-333333333333';
const BOOKING_ID = '44444444-4444-4444-8444-444444444444';
const THREAD_ID = '55555555-5555-4555-8555-555555555501';
const AT = new Date('2026-05-20T10:00:00.000Z');
const TOKEN = 'signed.jwt.token';

function thread(): ThreadRecord {
  return {
    id: THREAD_ID,
    bookingId: BOOKING_ID,
    guestId: GUEST_ID,
    hostId: HOST_ID,
    guestUnread: 0,
    hostUnread: 1,
    createdAt: AT,
    updatedAt: AT,
  };
}

/** Only the threads surface, backed by one fixed row. */
class FakeThreads implements ThreadsRepository {
  async findBookingParties(): Promise<BookingParties | null> {
    throw new Error('unused');
  }

  async findThreadById(threadId: string): Promise<ThreadRecord | null> {
    return threadId === THREAD_ID ? thread() : null;
  }

  async findThread(): Promise<ThreadRecord | null> {
    throw new Error('unused');
  }

  async findThreadsForUser(): Promise<ThreadRecord[]> {
    throw new Error('unused');
  }

  async findLastMessageTimes(): Promise<Map<string, Date>> {
    return new Map();
  }

  async createThread(): Promise<ThreadRecord> {
    throw new Error('unused');
  }

  async createMessage(): Promise<MessageRecord> {
    throw new Error('unused');
  }

  async findMessages(): Promise<MessageRecord[]> {
    throw new Error('unused');
  }

  async markThreadRead(): Promise<ThreadRecord | null> {
    throw new Error('unused');
  }
}

function activeUser(id: string): UserRecord {
  return {
    id,
    email: `${id}@example.com`,
    name: id,
    avatarUrl: null,
    passwordHash: null,
    role: 'GUEST',
    status: 'ACTIVE',
    oauthProvider: null,
    oauthAccountId: null,
    createdAt: AT,
  };
}

function setup(options: { userId?: string; token?: string } = {}): {
  gateway: ThreadsGateway;
} {
  const jwt = new JwtService();
  vi.spyOn(jwt, 'verifyAsync').mockImplementation(async () => ({ sub: options.userId ?? GUEST_ID }));
  const config = new ConfigService({
    JWT_SECRET: 'test-test-test-test-test-test-00',
    JWT_ISSUER: 'booking-api',
    JWT_AUDIENCE: 'booking-web',
  });
  const users = {
    findById: async (id: string) =>
      id === (options.userId ?? GUEST_ID) ? activeUser(id) : null,
  };
  const gateway = new ThreadsGateway(
    jwt,
    config,
    users as never,
    new ThreadsService(new FakeThreads()),
  );
  void options.token;
  return { gateway };
}

interface FakeSocket {
  handshake: { headers: { cookie?: string }; auth: Record<string, unknown> };
  data: Record<string, unknown>;
  joined: string[];
  disconnected: boolean;
  join: (room: string) => Promise<void>;
  disconnect: (close?: boolean) => void;
}

function socket(token: string | null): FakeSocket {
  const fake: FakeSocket = {
    handshake: {
      headers: token ? { cookie: `access_token=${token}` } : {},
      auth: {},
    },
    data: {},
    joined: [],
    disconnected: false,
    join: async (room: string) => {
      fake.joined.push(room);
    },
    disconnect: () => {
      fake.disconnected = true;
    },
  };
  return fake;
}

describe('ThreadsGateway authentication', () => {
  it('disconnects a socket with no token before it can join anything', async () => {
    const { gateway } = setup();
    const client = socket(null);

    await gateway.handleConnection(client as never);

    expect(client.disconnected).toBe(true);
    expect(client.data.userId).toBeUndefined();
  });

  it('attaches the verified user id and leaves the socket connected', async () => {
    const { gateway } = setup({ userId: GUEST_ID });
    const client = socket(TOKEN);

    await gateway.handleConnection(client as never);

    expect(client.disconnected).toBe(false);
    expect(client.data.userId).toBe(GUEST_ID);
  });
});

describe('ThreadsGateway thread:join', () => {
  it('joins the thread room for a participant and answers ok', async () => {
    const { gateway } = setup({ userId: GUEST_ID });
    const client = socket(TOKEN);
    await gateway.handleConnection(client as never);

    const answer = await gateway.handleJoin(client as never, { threadId: THREAD_ID });

    expect(answer).toEqual({ ok: true, room: threadRoom(THREAD_ID) });
    expect(client.joined).toEqual([threadRoom(THREAD_ID)]);
  });

  it('refuses a join from a caller outside the thread and joins nothing', async () => {
    // The ticket's verify line at the gateway level: a crafted threadId never
    // subscribes to someone else's thread.
    const { gateway } = setup({ userId: STRANGER_ID });
    const client = socket(TOKEN);
    await gateway.handleConnection(client as never);

    const answer = await gateway.handleJoin(client as never, { threadId: THREAD_ID });

    expect(answer).toEqual({ error: { code: 'NOT_THREAD_PARTICIPANT' } });
    expect(client.joined).toEqual([]);
  });

  it('404s a join for a thread id that does not exist', async () => {
    const { gateway } = setup({ userId: GUEST_ID });
    const client = socket(TOKEN);
    await gateway.handleConnection(client as never);

    const answer = await gateway.handleJoin(client as never, {
      threadId: '66666666-6666-4666-8666-666666666666',
    });

    expect(answer).toEqual({ error: { code: 'THREAD_NOT_FOUND' } });
    expect(client.joined).toEqual([]);
  });
});

describe('ThreadsGateway fan-out', () => {
  it('emits message:new and message:read to the thread room only', () => {
    const { gateway } = setup();
    const emitted: Array<{ room: string; event: string }> = [];
    (gateway as unknown as { server: unknown }).server = {
      to: (room: string) => ({
        emit: (event: string) => {
          emitted.push({ room, event });
        },
      }),
    };

    gateway.emitNewMessage(THREAD_ID, {
      id: 'm-1',
      threadId: THREAD_ID,
      senderId: GUEST_ID,
      body: 'Hi',
      readAt: null,
      createdAt: AT.toISOString(),
    });
    gateway.emitRead(THREAD_ID, GUEST_ID);

    expect(emitted).toEqual([
      { room: threadRoom(THREAD_ID), event: 'message:new' },
      { room: threadRoom(THREAD_ID), event: 'message:read' },
    ]);
  });
});
