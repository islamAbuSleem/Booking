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

  runtimeConfig: {
    public: {
      apiBase: 'http://localhost:3000',
      stripePublishableKey: '',
    },
  },

  future: {
    compatibilityVersion: 4,
  },

  vite: {
    plugins: [tailwindcss()],
  },

  typescript: {
    strict: true,
    typeCheck: true,
  },

  fonts: {},

  i18n: {
    strategy: 'no_prefix',
    defaultLocale: 'en',
    locales: [{ code: 'en', language: 'en-US', name: 'English', file: 'en.json' }],
    detectBrowserLanguage: false,
  },

  robots: {
    disallow: ['/dashboard', '/dashboard/', '/login', '/register'],
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
})
