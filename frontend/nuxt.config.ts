import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  modules: ['@nuxt/eslint', '@nuxtjs/i18n', '@nuxt/fonts'],

  css: ['~/assets/css/main.css'],

  future: {
    compatibilityVersion: 4,
  },

  // Tailwind v4's first-party Vite plugin. NOT @nuxtjs/tailwindcss, which pins
  // Tailwind v3 and would fight this.
  vite: {
    plugins: [tailwindcss()],
  },

  typescript: {
    strict: true,
    typeCheck: true,
  },

  // D33: @nuxt/fonts is actively developed and self-hosts, unlike the stale
  // @nuxtjs/google-fonts. It is ZERO-CONFIG in 0.14 — there is no `fonts` key in
  // NuxtConfig. It reads the families declared in main.css, downloads them, and
  // applies automatic metric fallbacks. Do not add a `fonts:` block here.

  i18n: {
    // T2 stands this up so later tickets extract strings as they build. T30
    // verifies rather than performs the extraction.
    strategy: 'no_prefix',
    defaultLocale: 'en',
    locales: [{ code: 'en', language: 'en-US', name: 'English', file: 'en.json' }],
    // One locale makes browser detection pointless and it can cause a surprise redirect.
    detectBrowserLanguage: false,
  },
})
