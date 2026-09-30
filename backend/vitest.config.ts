import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  // Resolves the path aliases declared in tsconfig.json, including the ones
  // added by `nest g library`.
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    // Runs before the module graph, so `AppModule` sees a `DATABASE_URL` at import time.
    setupFiles: ['test/setup-env.ts'],
    // `*.e2e-spec.ts` does NOT match `*.spec.ts` (hyphen, not dot), so the pattern from
    // the scaffold collects unit tests only. Both are listed here so `npm run test` runs
    // every suite and a green report cannot mean "the e2e tests were never collected".
    include: ['**/*.spec.ts', '**/*.e2e-spec.ts'],
    // The e2e suites hash an Argon2id password in `beforeAll`, and Argon2id is
    // deliberately expensive — roughly a second of CPU per hash. Vitest runs the suites in
    // parallel, so three files hashing at once while the machine is also finishing a Nuxt
    // build can cross the 10s default and fail a suite that is not actually broken. The
    // budget is raised rather than the hash cost lowered: weakening the parameters to make
    // a test faster is how a test stops testing the thing that matters.
    hookTimeout: 60_000,
  },
});
