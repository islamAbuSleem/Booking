import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { io, type Socket as ClientSocket } from 'socket.io-client';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/bootstrap.js';
import { PasswordService } from '../src/modules/auth/password.service.js';
import {
  USERS_REPOSITORY,
  type UserRecord,
  type UsersRepository,
} from '../src/modules/users/users.repository.js';
import {
  THREADS_REPOSITORY,
  type BookingParties,
  type MessageRecord,
  type ThreadRecord,
  type ThreadsRepository,
} from '../src/prisma/threads.repository.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * T35 over real HTTP, with only the database replaced.
 *
 * The repository is a stub but the guard, the pipes, the envelope and the status codes
 * are all real. That is the point of this file: the ticket's promises are all about the
 * wire — a 403 a client can branch on for a thread it is not part of, and unread counts
 * that move independently per participant — and none of them are visible from a
 * service-level test.
 */

const GUEST_ID = '11111111-1111-4111-8111-111111111111';
const HOST_ID = '22222222-2222-4222-8222-222222222222';
const STRANGER_ID = '33333333-3333-4333-8333-333333333333';
const BOOKING_ID = '44444444-4444-4444-8444-444444444444';
const PASSWORD = 'correct-password-1';
const AT = new Date('2026-05-20T10:00:00.000Z');

class StubThreads implements ThreadsRepository {
  readonly threads = new Map<string, ThreadRecord>();
  readonly messages: MessageRecord[] = [];

  constructor(
    private readonly parties: Map<string, BookingParties> = new Map([
      [BOOKING_ID, { bookingId: BOOKING_ID, guestId: GUEST_ID, hostId: HOST_ID }],
    ]),
  ) {}

  private static key(bookingId: string, guestId: string, hostId: string): string {
    return `${bookingId}:${guestId}:${hostId}`;
  }

  async findBookingParties(bookingId: string): Promise<BookingParties | null> {
    return this.parties.get(bookingId) ?? null;
  }

  async findThreadById(threadId: string): Promise<ThreadRecord | null> {
    return [...this.threads.values()].find((row) => row.id === threadId) ?? null;
  }

  async findThread(
    bookingId: string,
    guestId: string,
    hostId: string,
  ): Promise<ThreadRecord | null> {
    return this.threads.get(StubThreads.key(bookingId, guestId, hostId)) ?? null;
  }

  async findThreadsForUser(userId: string): Promise<ThreadRecord[]> {
    return [...this.threads.values()]
      .filter((row) => row.guestId === userId || row.hostId === userId)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  async findLastMessageTimes(threadIds: readonly string[]): Promise<Map<string, Date>> {
    const times = new Map<string, Date>();
    for (const message of this.messages) {
      if (threadIds.includes(message.threadId)) times.set(message.threadId, message.createdAt);
    }
    return times;
  }

  async createThread(
    bookingId: string,
    guestId: string,
    hostId: string,
  ): Promise<ThreadRecord> {
    const key = StubThreads.key(bookingId, guestId, hostId);
    const existing = this.threads.get(key);
    if (existing) return existing;
    const record: ThreadRecord = {
      id: `55555555-5555-4555-8555-5555555555${String(this.threads.size + 1).padStart(2, '0')}`,
      bookingId,
      guestId,
      hostId,
      guestUnread: 0,
      hostUnread: 0,
      createdAt: AT,
      updatedAt: AT,
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
      createdAt: AT,
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
      if (!cursor || cursor.threadId !== threadId) return [];
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
    return thread;
  }
}

/** Only what the JWT guard reads. */
class StubUsers implements UsersRepository {
  constructor(private readonly byEmail: Map<string, UserRecord>) {}

  async findByEmail(email: string): Promise<UserRecord | null> {
    return this.byEmail.get(email) ?? null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    for (const user of this.byEmail.values()) {
      if (user.id === id) return user;
    }
    return null;
  }

  async findByOAuth(): Promise<UserRecord | null> {
    return null;
  }

  async create(): Promise<UserRecord> {
    throw new Error('unused');
  }

  async update(): Promise<UserRecord> {
    throw new Error('unused');
  }
}

async function seededUser(
  passwords: PasswordService,
  id: string,
  email: string,
): Promise<UserRecord> {
  return {
    id,
    email,
    name: email,
    avatarUrl: null,
    passwordHash: await passwords.hash(PASSWORD),
    role: 'GUEST',
    status: 'ACTIVE',
    oauthProvider: null,
    oauthAccountId: null,
    createdAt: new Date(),
  };
}

describe('Threads API (e2e)', () => {
  let app: INestApplication;
  let threads: StubThreads;
  let guestCookie: string;
  let hostCookie: string;
  let strangerCookie: string;

  async function login(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return (response.headers['set-cookie'] as unknown as string[])[0] as string;
  }

  beforeAll(async () => {
    threads = new StubThreads();
    const passwords = new PasswordService();
    const guest = await seededUser(passwords, GUEST_ID, 'guest@example.com');
    const host = await seededUser(passwords, HOST_ID, 'host@example.com');
    const stranger = await seededUser(passwords, STRANGER_ID, 'stranger@example.com');
    const users = new StubUsers(
      new Map([
        [guest.email, guest],
        [host.email, host],
        [stranger.email, stranger],
      ]),
    );

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        $queryRaw: () => Promise.resolve([{ ok: 1 }]),
        $connect: () => Promise.resolve(),
      })
      .overrideProvider(USERS_REPOSITORY)
      .useValue(users)
      .overrideProvider(THREADS_REPOSITORY)
      .useValue(threads)
      .compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    // Real logins, so the cookies below are real JWTs and the guard does real work.
    guestCookie = await login(guest.email);
    hostCookie = await login(host.email);
    strangerCookie = await login(stranger.email);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    threads.threads.clear();
    threads.messages.length = 0;
  });

  describe('POST /api/threads', () => {
    it('creates the thread and answers 201 with it inside the envelope', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/threads')
        .set('Cookie', guestCookie)
        .send({ bookingId: BOOKING_ID, body: 'Hello, is check-in flexible?' })
        .expect(201);

      expect(response.body).toEqual({
        success: true,
        data: {
          id: expect.any(String),
          bookingId: BOOKING_ID,
          guestId: GUEST_ID,
          hostId: HOST_ID,
          unreadCount: 0,
          lastMessageAt: expect.stringMatching(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
          ),
          createdAt: expect.stringMatching(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
          ),
        },
      });
    });

    it('reuses the thread for the same triple instead of creating a second row', async () => {
      const first = await request(app.getHttpServer())
        .post('/api/threads')
        .set('Cookie', guestCookie)
        .send({ bookingId: BOOKING_ID, body: 'First.' })
        .expect(201);
      const second = await request(app.getHttpServer())
        .post('/api/threads')
        .set('Cookie', hostCookie)
        .send({ bookingId: BOOKING_ID, body: 'Second.' })
        .expect(201);

      expect(second.body.data.id).toBe(first.body.data.id);
      expect(threads.threads.size).toBe(1);
    });

    it('403s NOT_THREAD_PARTICIPANT for a caller outside the booking', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/threads')
        .set('Cookie', strangerCookie)
        .send({ bookingId: BOOKING_ID, body: 'Hi' })
        .expect(403);

      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'NOT_THREAD_PARTICIPANT',
          message: 'This conversation is not yours',
        },
      });
    });

    it('401s an anonymous caller', async () => {
      await request(app.getHttpServer())
        .post('/api/threads')
        .send({ bookingId: BOOKING_ID, body: 'Hi' })
        .expect(401);
    });

    it('400s a body over 5000 chars, never a silent truncation', async () => {
      await request(app.getHttpServer())
        .post('/api/threads')
        .set('Cookie', guestCookie)
        .send({ bookingId: BOOKING_ID, body: 'x'.repeat(5001) })
        .expect(400);
    });
  });

  describe('unread counts', () => {
    it('moves independently per participant across send and read', async () => {
      // The ticket's verify line, over the wire: host B cannot read the thread, and the
      // two badges move independently.
      const created = await request(app.getHttpServer())
        .post('/api/threads')
        .set('Cookie', guestCookie)
        .send({ bookingId: BOOKING_ID, body: 'Hi' })
        .expect(201);
      const threadId = created.body.data.id as string;

      const guestList = await request(app.getHttpServer())
        .get('/api/threads')
        .set('Cookie', guestCookie)
        .expect(200);
      const hostList = await request(app.getHttpServer())
        .get('/api/threads')
        .set('Cookie', hostCookie)
        .expect(200);
      expect(guestList.body.data.items[0].unreadCount).toBe(0);
      expect(hostList.body.data.items[0].unreadCount).toBe(1);

      await request(app.getHttpServer())
        .post(`/api/threads/${threadId}/messages`)
        .set('Cookie', hostCookie)
        .send({ body: 'Hello!' })
        .expect(201);

      const read = await request(app.getHttpServer())
        .post(`/api/threads/${threadId}/read`)
        .set('Cookie', guestCookie)
        .expect(200);
      expect(read.body).toEqual({ success: true, data: { unreadCount: 0 } });

      const afterGuest = await request(app.getHttpServer())
        .get('/api/threads')
        .set('Cookie', guestCookie)
        .expect(200);
      const afterHost = await request(app.getHttpServer())
        .get('/api/threads')
        .set('Cookie', hostCookie)
        .expect(200);
      expect(afterGuest.body.data.items[0].unreadCount).toBe(0);
      expect(afterHost.body.data.items[0].unreadCount).toBe(1);
    });

    it('403s NOT_THREAD_PARTICIPANT when host B reads a thread they are not part of', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/threads')
        .set('Cookie', guestCookie)
        .send({ bookingId: BOOKING_ID, body: 'Hi' })
        .expect(201);
      const threadId = created.body.data.id as string;

      const response = await request(app.getHttpServer())
        .get(`/api/threads/${threadId}/messages`)
        .set('Cookie', strangerCookie)
        .expect(403);

      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'NOT_THREAD_PARTICIPANT',
          message: 'This conversation is not yours',
        },
      });
    });
  });

  describe('live delivery (Socket.IO)', () => {
    let url: string;

    beforeAll(async () => {
      await app.listen(0);
      const address = app.getHttpServer().address() as { port: number };
      url = `http://127.0.0.1:${address.port}`;
    });

    function connect(cookie: string | null): ClientSocket {
      return io(url, {
        transports: ['websocket'],
        ...(cookie ? { extraHeaders: { cookie } } : {}),
      });
    }

    function join(
      client: ClientSocket,
      threadId: string,
    ): Promise<unknown> {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('join ack timed out')), 5000);
        client.emit('thread:join', { threadId }, (answer: unknown) => {
          clearTimeout(timer);
          resolve(answer);
        });
      });
    }

    it('refuses a join on a thread the socket is not part of', async () => {
      // The ticket's verify line, over a real socket: host B's join on host A's
      // thread is refused and subscribes to nothing.
      const created = await request(app.getHttpServer())
        .post('/api/threads')
        .set('Cookie', guestCookie)
        .send({ bookingId: BOOKING_ID, body: 'Hi' })
        .expect(201);
      const threadId = created.body.data.id as string;

      const stranger = connect(strangerCookie);
      try {
        const answer = await join(stranger, threadId);
        expect(answer).toEqual({ error: { code: 'NOT_THREAD_PARTICIPANT' } });
      } finally {
        stranger.disconnect();
      }
    });

    it('lets a participant join and fans out message:new to the room', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/threads')
        .set('Cookie', guestCookie)
        .send({ bookingId: BOOKING_ID, body: 'Hi' })
        .expect(201);
      const threadId = created.body.data.id as string;

      const guest = connect(guestCookie);
      const host = connect(hostCookie);
      try {
        expect(await join(guest, threadId)).toEqual({
          ok: true,
          room: `thread:${threadId}`,
        });
        expect(await join(host, threadId)).toEqual({
          ok: true,
          room: `thread:${threadId}`,
        });

        const received = new Promise<unknown>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('message:new timed out')), 5000);
          host.on('message:new', (message: unknown) => {
            clearTimeout(timer);
            resolve(message);
          });
        });
        await request(app.getHttpServer())
          .post(`/api/threads/${threadId}/messages`)
          .set('Cookie', guestCookie)
          .send({ body: 'Hello over the socket!' })
          .expect(201);

        expect(await received).toMatchObject({
          threadId,
          senderId: GUEST_ID,
          body: 'Hello over the socket!',
        });
      } finally {
        guest.disconnect();
        host.disconnect();
      }
    });

    it('disconnects a socket with no session before it can join anything', async () => {
      const anonymous = connect(null);
      try {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('disconnect timed out')), 5000);
          anonymous.on('disconnect', () => {
            clearTimeout(timer);
            resolve();
          });
          anonymous.on('connect_error', () => {
            clearTimeout(timer);
            resolve();
          });
        });
        expect(anonymous.connected).toBe(false);
      } finally {
        anonymous.disconnect();
      }
    });
  });
});
