import { Logger, ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { EnvelopeInterceptor } from './common/interceptors/envelope.interceptor.js';
import {
  AppThrottlerGuard,
  createThrottleStorage,
  READ_THROTTLE,
} from './common/throttle/app-throttler.guard.js';
import { JwtAuthGuard } from './modules/auth/jwt-auth.guard.js';
import { allowedOrigins } from './modules/auth/oauth-origin.js';
import { RolesGuard } from './modules/auth/roles.guard.js';
import type { UsersRepository } from './modules/users/users.repository.js';
import { USERS_REPOSITORY } from './modules/users/users.repository.js';
import {
  buildOpenApiDocument,
  OPENAPI_JSON_PATH,
  OPENAPI_UI_PATH,
} from './openapi/document.js';

/** Every route lives under this prefix. The OpenAPI document reflects it too. */
export const API_PREFIX = 'api';

/**
 * T13 / T13a — everything that makes an `INestApplication` the Booking API.
 *
 * Separate from `main.ts` so it can be applied to a test application: the raw-body flag
 * and `listen` belong to the entry point, but the prefix, the pipes, the envelope on
 * both sides and the OpenAPI routes are behaviour worth asserting over real HTTP.
 */
export function configureApp(app: INestApplication): OpenAPIObject {
  app.setGlobalPrefix(API_PREFIX);

  // T14 — the JWT guard reads `request.cookies`, so the parser runs before
  // every route. No secret is passed: we only read, never sign, cookies here.
  app.use(cookieParser());

  app.enableCors({
    origin: allowedOrigins(process.env['FRONTEND_ORIGIN']),
    credentials: true,
  });

  // Kept from the scaffold: class-validator DTOs, for a module that ever needs one. Zod
  // schemas go through `ZodValidationPipe` at the parameter.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // One envelope on the success side and on the error side, on every route.
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new EnvelopeInterceptor(new Reflector()));

  // T14 — every route defaults to authenticated; `@Public()` opts out and
  // `@Roles()` narrows to a role. Wired manually (like the filter and the
  // interceptor above) rather than via `APP_GUARD`, so the OpenAPI preview
  // build — which never calls `configureApp` — does not resolve them.
  // Authentication first, authorization second, throttling last: order is
  // registration order, and the throttle guard needs `request.user` populated
  // to key authenticated callers by id rather than by IP.
  const reflector = new Reflector();
  const throttler = new AppThrottlerGuard(
    [{ name: 'default', limit: READ_THROTTLE.limit, ttl: READ_THROTTLE.ttl }],
    createThrottleStorage(),
    reflector,
  );
  // Fire-and-forget on purpose: it only sorts the one configured throttler (no I/O),
  // and `configureApp` stays synchronous so `main.ts` needs no restructuring.
  void throttler.onModuleInit();
  app.useGlobalGuards(
    new JwtAuthGuard(
      reflector,
      app.get(JwtService),
      app.get(ConfigService),
      app.get<UsersRepository>(USERS_REPOSITORY),
    ),
    new RolesGuard(reflector),
    throttler,
  );

  // The raw specification is served from a plain adapter route, not a controller, so it
  // is exactly the OpenAPI document: a controller return value would be wrapped by the
  // envelope interceptor and `openapi-typescript` could not read it.
  //
  // Registered before `listen` on purpose — Nest installs its not-found fallback during
  // `init`, and anything registered after that would never be reached.
  const document = buildOpenApiDocument(app);
  app.getHttpAdapter().get(OPENAPI_JSON_PATH, (_request, response) => {
    response.json(document);
  });
  SwaggerModule.setup(OPENAPI_UI_PATH, app, document);

  return document;
}

export function logListening(port: number): void {
  new Logger('bootstrap').log(
    `[bootstrap] api listening on :${port} — ${OPENAPI_JSON_PATH}, ${OPENAPI_UI_PATH}`,
  );
}
