/**
 * T35 — the messaging read/write contract, expressed in domain terms.
 *
 * Same shape as the other repositories: the service depends on this interface, never on
 * `PrismaService` (context/code-standards.md, "Dependency inversion"), and
 * `PrismaThreadsRepository` is the one implementation, the one place a Prisma type
 * appears.
 */

export const THREADS_REPOSITORY = Symbol('THREADS_REPOSITORY');

export interface ThreadRecord {
  id: string;
  bookingId: string;
  guestId: string;
  hostId: string;
  guestUnread: number;
  hostUnread: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface MessageRecord {
  id: string;
  threadId: string;
  senderId: string;
  body: string;
  createdAt: Date;
  readAt: Date | null;
}

export interface BookingParties {
  bookingId: string;
  guestId: string;
  hostId: string;
}

export interface ThreadsRepository {
  /**
   * The booking's `(guestId, hostId)` parties, or `null` when no such booking exists.
   * The host is resolved through the booking's room, so a booking id alone can never
   * conjure a thread between strangers.
   */
  findBookingParties(bookingId: string): Promise<BookingParties | null>;
  /** `null` when no thread has that id. */
  findThreadById(threadId: string): Promise<ThreadRecord | null>;
  /** The existing thread for the triple, or `null` when the first message is still to come. */
  findThread(
    bookingId: string,
    guestId: string,
    hostId: string,
  ): Promise<ThreadRecord | null>;
  /** The caller's threads — guest side or host side — newest first. */
  findThreadsForUser(userId: string): Promise<ThreadRecord[]>;
  /**
   * The newest message instant per thread, in ONE read, so listing threads does not
   * issue a query per row. Threads with no messages are simply absent from the result.
   */
  findLastMessageTimes(threadIds: readonly string[]): Promise<Map<string, Date>>;
  /**
   * Create the thread for the triple. A racing second create for the same triple is
   * answered with the existing row, never a duplicate: the unique key is the authority.
   */
  createThread(
    bookingId: string,
    guestId: string,
    hostId: string,
  ): Promise<ThreadRecord>;
  /** Append a message and bump the *other* participant's unread counter. */
  createMessage(
    threadId: string,
    senderId: string,
    body: string,
  ): Promise<MessageRecord>;
  /**
   * Up to `limit` messages for the thread, oldest first, ending before `before`
   * (exclusive cursor on the message id) when given.
   */
  findMessages(
    threadId: string,
    before: string | null,
    limit: number,
  ): Promise<MessageRecord[]>;
  /**
   * Clear one participant's unread counter and stamp their peer's messages read. Clearing
   * only the reader's side is what keeps the two badges independent.
   */
  markThreadRead(threadId: string, readerId: string): Promise<ThreadRecord | null>;
}
