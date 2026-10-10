import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayInit,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { ApiError } from '../../common/errors/api-error.js';
import { SkipEnvelope } from '../../common/envelope.js';
import { AUTH_COOKIE_NAME } from '../auth/cookie.js';
import {
  USERS_REPOSITORY,
  type UsersRepository,
} from '../users/users.repository.js';
import type { MessageDto } from './dto/thread.dto.js';
import { ThreadsService } from './threads.service.js';

/** Rooms are keyed by thread id: one room per conversation, nothing else. */
export function threadRoom(threadId: string): string {
  return `thread:${threadId}`;
}

interface JoinPayload {
  threadId?: unknown;
}

interface JoinAnswer {
  ok: true;
  room: string;
}

/**
 * T36 — live delivery for messaging. The gateway adds no HTTP routes: it lives at
 * `/socket.io` and speaks two events, `message:new` and `message:read`.
 *
 * Authentication is the same JWT cookie as HTTP (`access_token`, falling back to an
 * `auth.token` handshake field for non-browser clients): an unauthenticated socket is
 * disconnected on connect, before it can join anything. Authorization is the same
 * participation rule as the HTTP routes, enforced server-side before every join, so a
 * crafted `threadId` never subscribes to someone else's thread.
 *
 * CORS reflects the request origin with credentials (the cookie is the credential, so
 * the origin gate is the browser's, not the security boundary — the JWT and the
 * membership check are). Reconnection refetches missed messages over HTTP via
 * `?before=` rather than trusting a replay buffer; the client owns that, this gateway
 * only guarantees the room only ever carries the member's own threads.
 */
@WebSocketGateway({ cors: { origin: true, credentials: true } })
@SkipEnvelope()
@Injectable()
export class ThreadsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(ThreadsGateway.name);

  @WebSocketServer()
  private readonly server!: Server;

  // Every dependency is explicit (`@Inject`): tsx/esbuild never emits
  // `design:paramtypes`, so inference would break the container here too.
  constructor(
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(USERS_REPOSITORY) private readonly users: UsersRepository,
    @Inject(ThreadsService) private readonly threads: ThreadsService,
  ) {}

  afterInit(): void {
    this.logger.log('[threads] socket gateway listening on /socket.io');
  }

  async handleConnection(client: Socket): Promise<void> {
    const userId = await this.authenticate(client);
    if (!userId) {
      client.disconnect(true);
      return;
    }
    client.data.userId = userId;
    this.logger.log(`[threads] socket connected for ${userId}`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(
      `[threads] socket disconnected for ${client.data?.userId ?? 'anonymous'}`,
    );
  }

  /**
   * `thread:join` — subscribe this socket to one conversation. The membership check
   * runs first, on the authenticated user id, never on a client-supplied one: a
   * refusal answers `{ error: { code } }` on the ack and joins nothing.
   */
  @SubscribeMessage('thread:join')
  async handleJoin(
    client: Socket,
    payload: JoinPayload,
  ): Promise<JoinAnswer | { error: { code: string } }> {
    const userId = client.data?.userId as string | undefined;
    if (!userId || typeof payload?.threadId !== 'string' || payload.threadId.length === 0) {
      return { error: { code: 'UNAUTHORIZED' } };
    }
    try {
      const thread = await this.threads.assertParticipant(userId, payload.threadId);
      const room = threadRoom(thread.id);
      await client.join(room);
      return { ok: true as const, room };
    } catch (error) {
      if (error instanceof ApiError) {
        const body = error.getResponse() as { code?: string };
        return { error: { code: body.code ?? 'FORBIDDEN' } };
      }
      throw error;
    }
  }

  /** Fan a newly stored message to the thread's room. Called by the HTTP path. */
  emitNewMessage(threadId: string, message: MessageDto): void {
    this.server?.to(threadRoom(threadId)).emit('message:new', message);
  }

  /** Fan a read receipt to the thread's room. Called by the HTTP path. */
  emitRead(threadId: string, readerId: string): void {
    this.server?.to(threadRoom(threadId)).emit('message:read', { threadId, readerId });
  }

  /**
   * The same JWT cookie as HTTP. `auth.token` is the non-browser fallback, matching
   * the guard's `Authorization: Bearer` second source. A resolved `sub` is checked
   * against the users table so a deleted account's socket is refused like its HTTP.
   */
  private async authenticate(client: Socket): Promise<string | null> {
    const cookieHeader = client.handshake.headers.cookie ?? '';
    const fromCookie = readCookie(cookieHeader, AUTH_COOKIE_NAME);
    const fromAuth =
      typeof client.handshake.auth?.token === 'string'
        ? (client.handshake.auth.token as string)
        : null;
    const token = fromCookie ?? fromAuth;
    if (!token) return null;
    let sub: string;
    try {
      const payload = await this.jwt.verifyAsync<{ sub?: unknown }>(token, {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
        issuer: this.config.get<string>('JWT_ISSUER') ?? 'booking-api',
        audience: this.config.get<string>('JWT_AUDIENCE') ?? 'booking-web',
      });
      if (typeof payload.sub !== 'string' || payload.sub.length === 0) return null;
      sub = payload.sub;
    } catch {
      return null;
    }
    const user = await this.users.findById(sub);
    if (!user || user.status !== 'ACTIVE') return null;
    return user.id;
  }
}

/** Minimal `Cookie`-header parse: the guard's `cookie-parser` is HTTP-only. */
function readCookie(header: string, name: string): string | null {
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) {
      const value = part.slice(index + 1).trim().replace(/^"|"$/g, '');
      return decodeURIComponent(value);
    }
  }
  return null;
}
