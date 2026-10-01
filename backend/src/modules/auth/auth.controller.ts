import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { SkipEnvelope } from '../../common/envelope.js';
import { zodPipe } from '../../common/pipes/zod-validation.pipe.js';
import { contractRef } from '../hotels/dto/hotel-search.api.js';
import type { PublicUser } from '../users/dto/user.dto.js';
import { AuthService, type Session } from './auth.service.js';
import { clearAuthCookie, expiresInToMs, setAuthCookie } from './cookie.js';
import {
  loginSchema,
  registerSchema,
  type LoginInput,
  type RegisterInput,
} from './dto/auth.dto.js';
import {
  allowedOrigins,
  clearOAuthOrigin,
  readOAuthOrigin,
} from './oauth-origin.js';

/**
 * T14 + T15 — auth routes. Thin on purpose: parse, delegate, set the cookie.
 *
 * Sessions are a JWT in an httpOnly `SameSite=Lax` cookie (`Secure` in
 * production). The token is also returned in the body for non-browser clients.
 * `register`/`login`/OAuth entry + callbacks are `@Public()`; `me` defaults
 * to authenticated through the global `JwtAuthGuard`.
 */
@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  // Explicit `@Inject`: tsx/esbuild never emits `design:paramtypes`
  // (see PrismaService), so inference would break the OpenAPI preview.
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  @Post('register')
  @Public()
  @ApiOperation({
    summary: 'Register with email and password',
    description:
      '`wantsToHost` promotes the new account to HOST, otherwise it is a GUEST. ' +
      'The password is hashed with Argon2id and never returned.',
  })
  @ApiResponse({
    status: 201,
    description: 'The new user and the session token (also set as a cookie).',
    schema: { $ref: contractRef('AuthEnvelope') },
  })
  @ApiResponse({
    status: 409,
    description: 'The email is already registered.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  async register(
    @Body(zodPipe(registerSchema)) body: RegisterInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Session> {
    const session = await this.auth.register(body);
    this.setCookie(res, session.token);
    return session;
  }

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log in with email and password',
    description:
      'A missing email and a wrong password both return the same ' +
      '`INVALID_CREDENTIALS` 401, so the response never leaks which one failed.',
  })
  @ApiOkResponse({
    description: 'The user and the session token (also set as a cookie).',
    schema: { $ref: contractRef('AuthEnvelope') },
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid email or password.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  async login(
    @Body(zodPipe(loginSchema)) body: LoginInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Session> {
    const session = await this.auth.login(body);
    this.setCookie(res, session.token);
    return session;
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @SkipEnvelope()
  @ApiOperation({ summary: 'Clear the session cookie' })
  @ApiNoContentResponse({ description: 'The cookie was cleared.' })
  logout(@Res({ passthrough: true }) res: Response): void {
    // Authenticated on purpose: clearing a session that was never presented
    // is a no-op the client can treat as logged-out, while the 401 keeps the
    // envelope codes honest (no token → UNAUTHORIZED, like every other
    // guarded route). `@SkipEnvelope()` leaves the 204 body empty.
    clearAuthCookie(res, { secure: this.isSecure() });
  }

  @Get('me')
  @ApiOperation({ summary: 'The current session user' })
  @ApiOkResponse({
    description: 'The user attached by the JWT guard.',
    schema: { $ref: contractRef('MeEnvelope') },
  })
  @ApiResponse({
    status: 401,
    description: 'No valid session cookie.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  me(@CurrentUser() user: PublicUser): { user: PublicUser } {
    return { user };
  }

  // T15 — OAuth. The entry routes 302 to the provider via Passport; the
  // callbacks exchange the code, upsert keyed on the provider tuple (linking
  // on email), set the same cookie as login, and redirect to the frontend.

  @Get('google')
  @Public()
  @SkipEnvelope()
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Start Google OAuth (302 to Google)' })
  @ApiResponse({ status: 302, description: 'Redirects to Google.' })
  googleEntry(): void {
    // Passport issues the redirect; the handler never runs.
  }

  @Get('google/callback')
  @Public()
  @SkipEnvelope()
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Google OAuth callback' })
  @ApiResponse({
    status: 302,
    description:
      'Sets the session cookie and redirects to the frontend origin.',
  })
  googleCallback(
    @Req() req: Request & { user?: Session },
    @Res() res: Response,
  ): void {
    this.finishOAuth(req, res);
  }

  @Get('github')
  @Public()
  @SkipEnvelope()
  @UseGuards(AuthGuard('github'))
  @ApiOperation({ summary: 'Start GitHub OAuth (302 to GitHub)' })
  @ApiResponse({ status: 302, description: 'Redirects to GitHub.' })
  githubEntry(): void {
    // Passport issues the redirect; the handler never runs.
  }

  @Get('github/callback')
  @Public()
  @SkipEnvelope()
  @UseGuards(AuthGuard('github'))
  @ApiOperation({ summary: 'GitHub OAuth callback' })
  @ApiResponse({
    status: 302,
    description:
      'Sets the session cookie and redirects to the frontend origin.',
  })
  githubCallback(
    @Req() req: Request & { user?: Session },
    @Res() res: Response,
  ): void {
    this.finishOAuth(req, res);
  }

  private finishOAuth(req: Request & { user?: Session }, res: Response): void {
    // `request.user` is the `Session` the strategy's `validate` returned.
    const session = req.user;
    // The origin the entry route recorded, not just the first configured one:
    // in a multi-origin deployment the first entry is often the wrong host, and
    // the user would land there logged out. See `oauth-origin.ts`.
    const origin = this.frontendOrigin(req);
    clearOAuthOrigin(res, { secure: this.isSecure() });
    if (!session || !session.token) {
      res.redirect(origin);
      return;
    }
    this.setCookie(res, session.token);
    res.redirect(origin);
  }

  private setCookie(res: Response, token: string): void {
    const maxAge = expiresInToMs(
      this.config.get<string>('JWT_EXPIRES_IN') ?? '7d',
    );
    // Express `res.cookie` takes milliseconds — see `cookie.ts`.
    setAuthCookie(res, token, maxAge, { secure: this.isSecure() });
  }

  private isSecure(): boolean {
    return this.config.get<string>('NODE_ENV') === 'production';
  }

  private frontendOrigin(req: Request): string {
    return readOAuthOrigin(
      req,
      allowedOrigins(this.config.get<string>('FRONTEND_ORIGIN')),
    );
  }
}
