import { Inject, Injectable } from '@nestjs/common';
import { isPrismaKnownError } from '../common/errors/prisma-error.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from './prisma.service.js';
import {
  type BookingParties,
  type MessageRecord,
  type ThreadRecord,
  type ThreadsRepository,
} from './threads.repository.js';

const THREAD_SELECT = {
  id: true,
  bookingId: true,
  guestId: true,
  hostId: true,
  guestUnread: true,
  hostUnread: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ThreadSelect;

const MESSAGE_SELECT = {
  id: true,
  threadId: true,
  senderId: true,
  body: true,
  createdAt: true,
  readAt: true,
} satisfies Prisma.MessageSelect;

/**
 * T35 — Prisma implementation of `ThreadsRepository`.
 *
 * The duplicate thread insert is recognised HERE rather than in the service, so the
 * Prisma error code never leaves this file: a racing second `createThread` for the same
 * triple answers with the existing row, which is the "one thread per triple" rule made
 * structural (same shape as the favourites duplicate handling).
 */
export function isDuplicateThreadError(error: unknown): boolean {
  return isPrismaKnownError(error) && error.code === 'P2002';
}

@Injectable()
export class PrismaThreadsRepository implements ThreadsRepository {
  // Explicit `@Inject`: tsx/esbuild never emits `design:paramtypes`, so an
  // inferred token would be undefined in the OpenAPI preview (see PrismaService).
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findBookingParties(bookingId: string): Promise<BookingParties | null> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        guestId: true,
        room: { select: { hotel: { select: { hostId: true } } } },
      },
    });
    if (!booking) return null;
    return {
      bookingId: booking.id,
      guestId: booking.guestId,
      hostId: booking.room.hotel.hostId,
    };
  }

  async findThreadById(threadId: string): Promise<ThreadRecord | null> {
    return this.prisma.thread.findUnique({
      where: { id: threadId },
      select: THREAD_SELECT,
    });
  }

  async findThread(
    bookingId: string,
    guestId: string,
    hostId: string,
  ): Promise<ThreadRecord | null> {
    return this.prisma.thread.findUnique({
      where: {
        bookingId_guestId_hostId: { bookingId, guestId, hostId },
      },
      select: THREAD_SELECT,
    });
  }

  async findThreadsForUser(userId: string): Promise<ThreadRecord[]> {
    return this.prisma.thread.findMany({
      where: { OR: [{ guestId: userId }, { hostId: userId }] },
      orderBy: { updatedAt: 'desc' },
      select: THREAD_SELECT,
    });
  }

  async findLastMessageTimes(
    threadIds: readonly string[],
  ): Promise<Map<string, Date>> {
    if (threadIds.length === 0) return new Map();
    const rows = await this.prisma.message.groupBy({
      by: ['threadId'],
      where: { threadId: { in: [...threadIds] } },
      _max: { createdAt: true },
    });
    const times = new Map<string, Date>();
    for (const row of rows) {
      if (row._max.createdAt) times.set(row.threadId, row._max.createdAt);
    }
    return times;
  }

  async createThread(
    bookingId: string,
    guestId: string,
    hostId: string,
  ): Promise<ThreadRecord> {
    try {
      return await this.prisma.thread.create({
        data: { bookingId, guestId, hostId },
        select: THREAD_SELECT,
      });
    } catch (error) {
      if (isDuplicateThreadError(error)) {
        const existing = await this.findThread(bookingId, guestId, hostId);
        // The unique key is the authority, so a P2002 without a matching row is a
        // server state error, never a caller error.
        if (!existing) throw error;
        return existing;
      }
      throw error;
    }
  }

  async createMessage(
    threadId: string,
    senderId: string,
    body: string,
  ): Promise<MessageRecord> {
    const thread = await this.findThreadById(threadId);
    if (!thread) {
      throw new Error('THREAD_NOT_FOUND');
    }
    const counter =
      senderId === thread.guestId ? { hostUnread: { increment: 1 } } : { guestUnread: { increment: 1 } };
    const [message] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: { threadId, senderId, body },
        select: MESSAGE_SELECT,
      }),
      this.prisma.thread.update({
        where: { id: threadId },
        data: counter,
        select: THREAD_SELECT,
      }),
    ]);
    return message;
  }

  async findMessages(
    threadId: string,
    before: string | null,
    limit: number,
  ): Promise<MessageRecord[]> {
    let cursorCreatedAt: Date | null = null;
    if (before) {
      const cursor = await this.prisma.message.findUnique({
        where: { id: before },
        select: { threadId: true, createdAt: true },
      });
      // A cursor from another thread is not an answer, it is a probe: behave as if the
      // cursor was never sent rather than leaking whether that message exists.
      if (!cursor || cursor.threadId !== threadId) return [];
      cursorCreatedAt = cursor.createdAt;
    }
    const rows = await this.prisma.message.findMany({
      where: {
        threadId,
        ...(cursorCreatedAt ? { createdAt: { lt: cursorCreatedAt } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: MESSAGE_SELECT,
    });
    return rows.reverse();
  }

  async markThreadRead(
    threadId: string,
    readerId: string,
  ): Promise<ThreadRecord | null> {
    const thread = await this.findThreadById(threadId);
    if (!thread) return null;
    const isGuest = readerId === thread.guestId;
    const [updated] = await this.prisma.$transaction([
      this.prisma.thread.update({
        where: { id: threadId },
        data: isGuest ? { guestUnread: 0 } : { hostUnread: 0 },
        select: THREAD_SELECT,
      }),
      this.prisma.message.updateMany({
        where: {
          threadId,
          senderId: { not: readerId },
          readAt: null,
        },
        data: { readAt: new Date() },
      }),
    ]);
    return updated;
  }
}
