// @ts-check
import { createConfigForNuxt } from '@nuxt/eslint-config/flat'

export default createConfigForNuxt({
  features: {
    // Enforces the house style that keeps templates free of scattered utilities.
    stylistic: true,
  },
}).append({
  // Scoped to TS and Vue. Applying type-aware rules to this config file itself fails,
  // because it has no parserOptions.project.
  files: ['**/*.ts', '**/*.vue'],
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/consistent-type-imports': 'error',
    // One component per file, and the name must say what the component is.
    'vue/multi-word-component-names': 'error',
  },
  // Nuxt resolves layouts and pages BY FILENAME, so `default.vue` and `index.vue` are
  // the required names, not a naming slip. The rule cannot apply to them.
  ignores: ['app/pages/**', 'app/layouts/**'],
}).append({
  // Generated from backend/openapi.json via `npm run gen:api`. Never hand-edit,
  // so house style does not apply to it.
  ignores: ['app/types/api.ts'],
})
