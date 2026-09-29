<script setup lang="ts">
const nav = [
  { to: '/host', label: 'Properties' },
  { to: '/host/bookings', label: 'Bookings' },
  { to: '/host/analytics', label: 'Analytics' },
]
</script>

<template>
  <div class="flex min-h-screen bg-bg text-fg">
    <a
      href="#main"
      class="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-accent focus:px-4 focus:py-2 focus:text-surface"
    >
      {{ $t('common.skipToContent') }}
    </a>

    <aside class="bg-surface-inv text-fg-inv hidden w-60 shrink-0 flex-col lg:flex">
      <div class="border-rule border-b px-6 py-5">
        <div class="font-display text-lg">
          {{ $t('common.brand') }}
        </div>
      </div>

      <nav
        class="flex flex-1 flex-col gap-1 p-3"
        :aria-label="$t('nav.menu')"
      >
        <NuxtLink
          v-for="item in nav"
          :key="item.to"
          :to="item.to"
          class="border-rule hover:border-accent hover:text-fg-inv border-l-2 px-3 py-2 text-sm opacity-60 transition-colors duration-150"
          active-class="border-accent opacity-100"
        >
          {{ item.label }}
        </NuxtLink>
      </nav>
    </aside>

    <div class="flex min-w-0 flex-1 flex-col">
      <header class="border-rule border-b lg:hidden">
        <div class="px-6 py-4">
          <span class="font-display">{{ $t('common.brand') }}</span>
        </div>
      </header>

      <main
        id="main"
        class="flex-1 p-6 lg:p-10"
      >
        <slot />
      </main>
    </div>
  </div>
</template>
