import { Logger, ValidationPipe, type INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { EnvelopeInterceptor } from './common/interceptors/envelope.interceptor.js';
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

const DEFAULT_ORIGIN = 'http://localhost:3000';

/**
 * `FRONTEND_ORIGIN` is a comma-separated list (config/env.ts validates it that way), and
 * `cors` compares its `origin` option against the request header as a whole. Handing it
 * the raw string would make `http://a.test,https://b.test` a single origin that matches
 * nothing, so the list is split and the entries trimmed before it reaches the middleware.
 */
export function allowedOrigins(raw: string | undefined): string[] {
  const origins = (raw ?? DEFAULT_ORIGIN)
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  return origins.length > 0 ? origins : [DEFAULT_ORIGIN];
}
