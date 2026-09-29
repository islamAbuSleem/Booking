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
})
