/**
 * Side-effect import. Must be the FIRST import in `generate-openapi.ts`: ESM evaluates
 * imports in order, and `AppModule` validates the environment at import time.
 *
 * The API refuses to boot without a `DATABASE_URL` (context/code-standards.md,
 * "Configuration"), so regenerating `openapi.json` supplies a syntactically valid
 * placeholder. It is never dialled — the generator builds the app in Nest's `preview`
 * mode, which does not instantiate providers or run lifecycle hooks.
 */
import 'dotenv/config';

process.env['DATABASE_URL'] ??=
  'postgresql://preview:preview@localhost:5432/preview';
process.env['PORT'] ??= '3000';

export const PREVIEW_ENV_LOADED = true;
