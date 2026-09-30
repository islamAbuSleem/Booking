import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    // Same reason as the unit config: `AppModule` validates the environment when it is
    // imported, so a `DATABASE_URL` has to exist before the module graph is built.
    setupFiles: ['test/setup-env.ts'],
    include: ['**/*.e2e-spec.ts'],
  },
});
