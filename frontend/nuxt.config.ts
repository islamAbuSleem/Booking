import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxtjs/i18n',
    '@nuxt/fonts',
    '@nuxtjs/sitemap',
    '@nuxtjs/robots',
  ],

  css: ['~/assets/css/main.css'],

  // The API base the client (`app/utils/api.ts`) prefixes every request with.
  // `NUXT_PUBLIC_API_BASE` overrides this in deploy environments; the default
  // matches the `servers` entry in backend/openapi.json.
  runtimeConfig: {
    public: {
      apiBase: 'http://localhost:3000',
      /**
       * T28 — Stripe publishable key (test mode: `pk_test_...`). Public by design: it
       * identifies the account to Stripe.js and cannot charge anything alone. Empty
       * disables the card form with a configuration notice instead of failing obscurely
       * at confirm time. Secret keys never leave the API.
       */
      stripePublishableKey: '',
    },
  },

  /**
   * T31 — `/sitemap.xml` covers `/`, `/hotels`, and every PUBLISHED hotel detail
   * URL. Static routes come from the app itself; detail locs come from
   * `server/api/__sitemap__/urls.ts`, which reads `GET /api/sitemap/urls` and
   * degrades to nothing (not to fixtures) when the backend is unreachable at
   * generation time. Account, dashboard, and booking-flow routes never index.
   *
   * No `site.url` is set: with the SSR preset the modules resolve the public origin
   * from the incoming request host at runtime, so deploy domains need no rebuild.
   * Crawlable locs stay correct behind proxies via `x-forwarded-host`.
   */
  future: {
    compatibilityVersion: 4,
  },

  sitemap: {
    sources: ['/api/__sitemap__/urls'],
    exclude: [
      '/dashboard',
      '/dashboard/**',
      '/login',
      '/register',
      '/bookings',
      '/bookings/**',
      '/hotels/**/book',
    ],
  },

  /**
   * T31 — crawlers stay out of account and dashboard surfaces. Both dashboard forms
   * are listed so the intent reads plainly (`/dashboard` alone already prefixes
   * children). The module appends the `Sitemap:` reference from `site.url` itself.
   */
  robots: {
    disallow: ['/dashboard', '/dashboard/', '/login', '/register'],
  },

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
  fonts: {},

  i18n: {
    // T2 stands this up so later tickets extract strings as they build. T30
    // verifies rather than performs the extraction.
    strategy: 'no_prefix',
    defaultLocale: 'en',
    locales: [{ code: 'en', language: 'en-US', name: 'English', file: 'en.json' }],
    // One locale makes browser detection pointless and it can cause a surprise redirect.
    detectBrowserLanguage: false
  },
}
)