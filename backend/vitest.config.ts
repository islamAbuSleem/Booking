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
  },
});
