import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { zodPipe } from '../../common/pipes/zod-validation.pipe.js';
import { MUTATION_THROTTLE } from '../../common/throttle/app-throttler.guard.js';
import { contractRef } from '../hotels/dto/hotel-search.api.js';
import {
  createThreadSchema,
  sendMessageSchema,
  threadIdParam,
  threadMessagesQuery,
  type CreateThread,
  type MessageDto,
  type MessageListData,
  type SendMessage,
  type ThreadDto,
  type ThreadIdParam,
  type ThreadListData,
  type ThreadMessagesQuery,
  type ThreadReadData,
} from './dto/thread.dto.js';
import { ThreadsService } from './threads.service.js';

/**
 * T35 — the messaging routes. Thin on purpose: parse, delegate.
 *
 * No route reads a participant id from a body or a query string: the caller is the JWT
 * subject via `@CurrentUser('id')`, and the booking's parties are resolved server-side
 * from the `bookingId`, which is why no route can be talked into another guest's rows.
 */
@ApiTags('Threads')
@Controller('threads')
export class ThreadsController {
  // Explicit `@Inject`: tsx/esbuild never emits `design:paramtypes`
  // (see PrismaService), so inference would break the OpenAPI preview.
  constructor(
    @Inject(ThreadsService) private readonly threads: ThreadsService,
  ) {}

  @Post()
  @Throttle({ default: MUTATION_THROTTLE })
  @ApiOperation({
    summary: 'Start or reuse a conversation about a booking',
    description:
      'Creates the thread for the booking on the first message and reuses it ' +
      'thereafter: one thread per (booking, guest, host). The parties come from the ' +
      'booking itself, so the body carries a `bookingId` only — never a guest or host id.',
  })
  @ApiBody({ schema: { $ref: contractRef('CreateThread') } })
  @ApiResponse({
    status: 201,
    description: 'The thread (new or reused).',
    schema: { $ref: contractRef('ThreadEnvelope') },
  })
  @ApiResponse({
    status: 400,
    description: 'The body failed validation.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 401,
    description: 'No valid session.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 403,
    description: 'The booking belongs to a different guest and host.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 404,
    description: 'No such booking.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  create(
    @CurrentUser('id') callerId: string,
    @Body(zodPipe(createThreadSchema)) body: CreateThread,
  ): Promise<ThreadDto> {
    return this.threads.createThread(callerId, body);
  }

  @Get()
  @ApiOperation({
    summary: "List the caller's conversations",
    description:
      "Guest side and host side both, newest first. The unread count on each row is the " +
      "caller's own — never the peer's.",
  })
  @ApiResponse({
    status: 200,
    description: "The caller's threads, most recent first.",
    schema: { $ref: contractRef('ThreadListEnvelope') },
  })
  @ApiResponse({
    status: 401,
    description: 'No valid session.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  list(@CurrentUser('id') callerId: string): Promise<ThreadListData> {
    return this.threads.list(callerId);
  }

  @Get(':id/messages')
  @ApiOperation({
    summary: 'Read one page of a conversation',
    description:
      'Oldest first, up to one page, ending before `before` when given. A thread the ' +
      'caller is not part of is a 403, not a 404.',
  })
  @ApiParam({
    name: 'id',
    required: true,
    type: String,
    format: 'uuid',
    description: 'The thread, by uuid.',
  })
  @ApiResponse({
    status: 200,
    description: 'The page, oldest first.',
    schema: { $ref: contractRef('MessageListEnvelope') },
  })
  @ApiResponse({
    status: 401,
    description: 'No valid session.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 403,
    description: 'The thread exists but the caller is not part of it.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 404,
    description: 'No such thread.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  listMessages(
    @CurrentUser('id') callerId: string,
    @Param(zodPipe(threadIdParam)) params: ThreadIdParam,
    @Query(zodPipe(threadMessagesQuery)) query: ThreadMessagesQuery,
  ): Promise<MessageListData> {
    return this.threads.listMessages(callerId, params.id, query.before ?? null);
  }

  @Post(':id/messages')
  @Throttle({ default: MUTATION_THROTTLE })
  @ApiOperation({
    summary: 'Send a message in a conversation',
    description:
      'Appends the message and bumps the peer participant\u2019s unread counter. ' +
      'Bodies over 5000 chars are a 400.',
  })
  @ApiParam({
    name: 'id',
    required: true,
    type: String,
    format: 'uuid',
    description: 'The thread, by uuid.',
  })
  @ApiBody({ schema: { $ref: contractRef('SendMessage') } })
  @ApiResponse({
    status: 201,
    description: 'The message that was appended.',
    schema: { $ref: contractRef('MessageEnvelope') },
  })
  @ApiResponse({
    status: 400,
    description: 'The body failed validation.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 401,
    description: 'No valid session.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 403,
    description: 'The thread exists but the caller is not part of it.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 404,
    description: 'No such thread.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  send(
    @CurrentUser('id') callerId: string,
    @Param(zodPipe(threadIdParam)) params: ThreadIdParam,
    @Body(zodPipe(sendMessageSchema)) body: SendMessage,
  ): Promise<MessageDto> {
    return this.threads.sendMessage(callerId, params.id, body);
  }

  @Post(':id/read')
  @Throttle({ default: MUTATION_THROTTLE })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark a conversation read',
    description:
      'Clears the reader\u2019s unread counter only — the peer\u2019s badge is ' +
      'untouched. Answers 200 with the cleared count, not 204: the client renders the ' +
      'badge flip from the body.',
  })
  @ApiParam({
    name: 'id',
    required: true,
    type: String,
    format: 'uuid',
    description: 'The thread, by uuid.',
  })
  @ApiResponse({
    status: 200,
    description: 'The cleared counter (always 0).',
    schema: { $ref: contractRef('ThreadReadEnvelope') },
  })
  @ApiResponse({
    status: 401,
    description: 'No valid session.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 403,
    description: 'The thread exists but the caller is not part of it.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 404,
    description: 'No such thread.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  markRead(
    @CurrentUser('id') callerId: string,
    @Param(zodPipe(threadIdParam)) params: ThreadIdParam,
  ): Promise<ThreadReadData> {
    return this.threads.markRead(callerId, params.id);
  }
}
