// Side-effect import: must stay first, see the file for why.
import './preview-env.js';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module.js';
import { API_PREFIX } from '../src/bootstrap.js';
import { buildOpenApiDocument } from '../src/openapi/document.js';

/**
 * T13a — writes `backend/openapi.json` from the application's route metadata and the Zod
 * contract schemas.
 *
 * Run it after any DTO or route change and commit the result:
 *
 *     npm run openapi
 *
 * `preview: true` builds the DI container without instantiating providers, so this
 * opens no database connection. It needs no `DATABASE_URL`; only a booted API does.
 */
const app = await NestFactory.create(AppModule, {
  preview: true,
  abortOnError: true,
  logger: ['error'],
});

// The prefix has to be applied here too: Swagger bakes it into every path key, so a
// document generated without it would not match the one the running API serves.
app.setGlobalPrefix(API_PREFIX);

const document = buildOpenApiDocument(app);
await app.close();

const target = fileURLToPath(new URL('../openapi.json', import.meta.url));
await writeFile(target, `${JSON.stringify(document, null, 2)}\n`, 'utf8');

const paths = Object.keys(document.paths ?? {});
process.stdout.write(
  `[openapi] wrote openapi.json — ${paths.length} paths (${paths.join(', ')}), ` +
    `${Object.keys(document.components?.schemas ?? {}).length} component schemas\n`,
);
