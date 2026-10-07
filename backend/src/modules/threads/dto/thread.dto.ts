import { z } from 'zod';
import { envelopeSchema } from '../../../common/envelope.js';

/**
 * T35 — the messaging contract, as Zod schemas.
 *
 * The backend owns the API shape, so these schemas ARE the contract: `openapi.json` is
 * generated from them (`src/openapi/schemas.ts`). A field cannot drift between what the
 * API validates and what the frontend generates from.
 *
 * Things a generated frontend type must know:
 *   * A `Thread` names its `bookingId` and both participants, and carries the *caller's*
 *     unread count only — the other side's badge is none of this client's business.
 *   * A `Message` carries a `readAt` receipt: null until the peer marks the thread read.
 *   * `body` is capped at 5000 chars: longer is a 400, never a silent truncation.
 *   * `createdAt` is an ISO 8601 instant. The messages list pages by `before` (exclusive
 *     message-id cursor), newest page last in the response so the client appends.
 */

/** Bodies over 5000 chars are a 400, never a silent truncation. */
export const MAX_MESSAGE_BODY = 5000;

export const createThreadSchema = z.object({
  bookingId: z.uuid().describe('The booking the conversation is about, by uuid.'),
  body: z
    .string()
    .min(1)
    .max(MAX_MESSAGE_BODY)
    .describe('The first message. Creates the thread when none exists for the triple.'),
});

export type CreateThread = z.infer<typeof createThreadSchema>;

export const sendMessageSchema = z.object({
  body: z
    .string()
    .min(1)
    .max(MAX_MESSAGE_BODY)
    .describe('The message text, 1-5000 chars.'),
});

export type SendMessage = z.infer<typeof sendMessageSchema>;

/** `GET /api/threads/:id/messages` and the `:id` routes — the same uuid, in the path. */
export const threadIdParam = z.object({
  id: z.uuid().describe('The thread, by uuid.'),
});

export type ThreadIdParam = z.infer<typeof threadIdParam>;

export const threadMessagesQuery = z.object({
  before: z
    .uuid()
    .optional()
    .describe(
      'Exclusive cursor: the page ends before this message id. Omit for the latest page.',
    ),
});

export type ThreadMessagesQuery = z.infer<typeof threadMessagesQuery>;

const threadSchema = z.object({
  id: z.uuid(),
  bookingId: z.uuid().describe('The booking the conversation is about.'),
  guestId: z.uuid(),
  hostId: z.uuid(),
  unreadCount: z
    .int()
    .describe("The caller's unread count in this thread — never the other side's."),
  lastMessageAt: z
    .string()
    .nullable()
    .describe('ISO 8601 instant of the newest message, or null when empty.'),
  createdAt: z.string().describe('ISO 8601 instant the thread was created.'),
});

const threadListDataSchema = z.object({
  items: z.array(threadSchema),
  total: z.int().describe('Always `items.length` until the list is paginated.'),
});

const messageSchema = z.object({
  id: z.uuid(),
  threadId: z.uuid(),
  senderId: z.uuid().describe('The author, by user uuid. The client renders own vs peer.'),
  body: z.string(),
  readAt: z
    .string()
    .nullable()
    .describe('ISO 8601 read receipt, or null until the peer marks the thread read.'),
  createdAt: z.string().describe('ISO 8601 instant the message was sent.'),
});

const messageListDataSchema = z.object({
  items: z.array(messageSchema).describe('Oldest first, so the client appends.'),
  total: z.int().describe('Always `items.length` until the list is paginated.'),
});

const threadReadDataSchema = z.object({
  unreadCount: z
    .int()
    .describe("Always 0: the reader's counter after the clear."),
});

export const threadEnvelopeSchema = envelopeSchema(threadSchema);
export const threadListEnvelopeSchema = envelopeSchema(threadListDataSchema);
export const messageEnvelopeSchema = envelopeSchema(messageSchema);
export const messageListEnvelopeSchema = envelopeSchema(messageListDataSchema);
export const threadReadEnvelopeSchema = envelopeSchema(threadReadDataSchema);

export type ThreadDto = z.infer<typeof threadSchema>;
export type ThreadListData = z.infer<typeof threadListDataSchema>;
export type MessageDto = z.infer<typeof messageSchema>;
export type MessageListData = z.infer<typeof messageListDataSchema>;
export type ThreadReadData = z.infer<typeof threadReadDataSchema>;

/** Named so the OpenAPI components are stable, readable identifiers. */
export const DTO_SCHEMAS = {
  CreateThread: createThreadSchema,
  SendMessage: sendMessageSchema,
  Thread: threadSchema,
  ThreadEnvelope: threadEnvelopeSchema,
  ThreadListData: threadListDataSchema,
  ThreadListEnvelope: threadListEnvelopeSchema,
  Message: messageSchema,
  MessageEnvelope: messageEnvelopeSchema,
  MessageListData: messageListDataSchema,
  MessageListEnvelope: messageListEnvelopeSchema,
  ThreadReadData: threadReadDataSchema,
  ThreadReadEnvelope: threadReadEnvelopeSchema,
} as const satisfies Record<string, z.ZodType>;
