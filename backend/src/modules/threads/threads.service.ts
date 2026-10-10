import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import {
  ApiError,
  badRequest,
  notFound,
} from '../../common/errors/api-error.js';
import {
  THREADS_REPOSITORY,
  type MessageRecord,
  type ThreadRecord,
  type ThreadsRepository,
} from '../../prisma/threads.repository.js';
import {
  MAX_MESSAGE_BODY,
  type CreateThread,
  type MessageDto,
  type MessageListData,
  type SendMessage,
  type ThreadDto,
  type ThreadListData,
  type ThreadReadData,
} from './dto/thread.dto.js';

/** One page of messages. The list is short-lived polling, not an archive view. */
const MESSAGE_PAGE_SIZE = 50;

/**
 * T35 — the messaging rules. `createThread` is the load-bearing one: the thread for a
 * `(bookingId, guestId, hostId)` triple is created on the first message and reused
 * thereafter, and the repository's unique key answers a racing second create with the
 * existing row rather than a duplicate.
 *
 * Every read and write is filtered by the caller's id, never by a request field (D4):
 * a thread names its two participants, and any route that names a thread id the caller
 * is not part of is a 403, never a 404 — same shape as T20's NOT_BOOKING_OWNER.
 *
 * Depends on repository interfaces, never on `PrismaService` (context/code-standards.md,
 * "Dependency inversion"), so every rule below is testable with fakes and no database.
 */
@Injectable()
export class ThreadsService {
  private readonly logger = new Logger(ThreadsService.name);

  constructor(
    @Inject(THREADS_REPOSITORY)
    private readonly threads: ThreadsRepository,
  ) {}

  /**
   * `POST /api/threads`. Resolves the booking's parties server-side — the body carries a
   * `bookingId` only, never a `guestId` or `hostId`, so a caller cannot conjure a thread
   * between strangers. Reuses the existing thread for the triple when there is one.
   */
  async createThread(callerId: string, request: CreateThread): Promise<ThreadDto> {
    const parties = await this.threads.findBookingParties(request.bookingId);
    if (!parties) throw notFound('BOOKING_NOT_FOUND', 'Booking not found');
    if (callerId !== parties.guestId && callerId !== parties.hostId) {
      throw new ApiError(
        HttpStatus.FORBIDDEN,
        'NOT_THREAD_PARTICIPANT',
        'This conversation is not yours',
      );
    }

    const thread = await this.threads.createThread(
      parties.bookingId,
      parties.guestId,
      parties.hostId,
    );
    await this.threads.createMessage(thread.id, callerId, request.body);

    this.logger.log(`[threads] message in ${thread.id} from ${callerId}`);
    return this.toDto(thread, callerId, new Date());
  }

  /**
   * `GET /api/threads` — the caller's threads, guest side and host side both, newest
   * first. The unread count on each row is the caller's own, never the peer's.
   */
  async list(callerId: string): Promise<ThreadListData> {
    const records = await this.threads.findThreadsForUser(callerId);
    const lastMessageAt = await this.threads.findLastMessageTimes(
      records.map((record) => record.id),
    );
    const items = records.map((record) =>
      this.toDto(record, callerId, lastMessageAt.get(record.id) ?? null),
    );
    return { items, total: items.length };
  }

  /**
   * `GET /api/threads/:id/messages` — oldest first, up to one page, ending before
   * `before` when given.
   */
  async listMessages(
    callerId: string,
    threadId: string,
    before: string | null,
  ): Promise<MessageListData> {
    const thread = await this.assertParticipant(callerId, threadId);
    const records = await this.threads.findMessages(
      thread.id,
      before,
      MESSAGE_PAGE_SIZE,
    );
    const items = records.map(toMessageDto);
    return { items, total: items.length };
  }

  /** `POST /api/threads/:id/messages` — appends and bumps the peer's unread counter. */
  async sendMessage(
    callerId: string,
    threadId: string,
    request: SendMessage,
  ): Promise<MessageDto> {
    const thread = await this.assertParticipant(callerId, threadId);
    if (request.body.length > MAX_MESSAGE_BODY) {
      throw badRequest(
        `Message body must be at most ${MAX_MESSAGE_BODY} characters`,
      );
    }
    const record = await this.threads.createMessage(
      thread.id,
      callerId,
      request.body,
    );
    return toMessageDto(record);
  }

  /**
   * `POST /api/threads/:id/read` — clears the reader's counter only. The peer's badge
   * is untouched, which is what makes the two unread counts independent.
   */
  async markRead(callerId: string, threadId: string): Promise<ThreadReadData> {
    const updated = await this.assertParticipant(callerId, threadId).then(
      (thread) => this.threads.markThreadRead(thread.id, callerId),
    );
    if (!updated) throw notFound('THREAD_NOT_FOUND', 'Thread not found');
    return { unreadCount: 0 };
  }

  /**
   * The participation rule, stated once: a missing thread is a 404, an existing thread
   * that names neither the guest nor the host is a 403 — never a 404, because a 404
   * would let a caller probe whether a thread id they do not own exists.
   *
   * Public because the Socket.IO gateway (T36) enforces the same rule before every
   * room join: a crafted `threadId` must never subscribe to someone else's thread.
   */
  async assertParticipant(callerId: string, threadId: string): Promise<ThreadRecord> {
    const thread = await this.threads.findThreadById(threadId);
    if (!thread) throw notFound('THREAD_NOT_FOUND', 'Thread not found');
    if (callerId !== thread.guestId && callerId !== thread.hostId) {
      throw new ApiError(
        HttpStatus.FORBIDDEN,
        'NOT_THREAD_PARTICIPANT',
        'This conversation is not yours',
      );
    }
    return thread;
  }

  private toDto(
    record: ThreadRecord,
    callerId: string,
    lastMessageAt: Date | null,
  ): ThreadDto {
    return {
      id: record.id,
      bookingId: record.bookingId,
      guestId: record.guestId,
      hostId: record.hostId,
      unreadCount:
        callerId === record.guestId ? record.guestUnread : record.hostUnread,
      lastMessageAt: lastMessageAt ? lastMessageAt.toISOString() : null,
      createdAt: record.createdAt.toISOString(),
    };
  }
}

function toMessageDto(record: MessageRecord): MessageDto {
  return {
    id: record.id,
    threadId: record.threadId,
    senderId: record.senderId,
    body: record.body,
    readAt: record.readAt ? record.readAt.toISOString() : null,
    createdAt: record.createdAt.toISOString(),
  };
}
