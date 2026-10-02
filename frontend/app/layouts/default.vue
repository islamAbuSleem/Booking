<script setup lang="ts">
const route = useRoute()
const { current: user, isSignedIn, isHost, logout } = useAuth()

const nav = computed(() => [
  { to: '/', label: 'nav.stays' },
  { to: '/hotels', label: 'nav.destinations' },
  { to: '/bookings', label: 'nav.trips' },
  ...(isHost.value ? [{ to: '/dashboard/host', label: 'nav.dashboard' }] : []),
])

/** `LOGOUT` is a plain function so the form never renders a real submit button. */
async function onLogout(): Promise<void> {
  await logout()
  await navigateTo('/')
}
</script>

<template>
  <div class="flex min-h-screen flex-col bg-bg text-fg">
    <a
      href="#main"
      class="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-accent focus:px-4 focus:py-2 focus:text-surface"
    >
      {{ $t('common.skipToContent') }}
    </a>

    <header class="border-rule bg-bg border-b">
      <div class="mx-auto flex max-w-[1280px] items-center justify-between px-6 py-5">
        <NuxtLink
          to="/"
          class="flex flex-col leading-none"
        >
          <span class="font-display text-xl">{{ $t('common.brand') }}</span>
          <span class="text-fg-subtle text-label mt-1">{{ $t('common.brandSince') }}</span>
        </NuxtLink>

        <nav
          class="hidden items-center gap-8 md:flex"
          :aria-label="$t('nav.menu')"
        >
          <NuxtLink
            v-for="item in nav"
            :key="item.to"
            :to="item.to"
            class="text-fg-muted hover:text-fg text-sm transition-colors duration-150"
            active-class="text-fg"
          >
            {{ $t(item.label) }}
          </NuxtLink>
        </nav>

        <div class="flex items-center gap-5">
          <template v-if="isSignedIn">
            <NuxtLink
              to="/dashboard/host/new"
              class="text-link text-sm underline-offset-4 hover:underline"
            >
              {{ $t('nav.listYourProperty') }}
            </NuxtLink>
            <span class="text-fg-muted text-sm">
              {{ user?.name }}
            </span>
            <BaseButton
              variant="secondary"
              size="sm"
              @click="onLogout"
            >
              {{ $t('nav.signOut') }}
            </BaseButton>
          </template>
          <template v-else>
            <NuxtLink
              to="/dashboard/host/new"
              class="text-link text-sm underline-offset-4 hover:underline"
            >
              {{ $t('nav.listYourProperty') }}
            </NuxtLink>
            <BaseButton
              variant="primary"
              size="sm"
              to="/login"
            >
              {{ $t('nav.signIn') }}
            </BaseButton>
          </template>
        </div>
      </div>
    </header>

    <main
      id="main"
      class="flex-1"
    >
      <slot />
    </main>

    <footer class="bg-surface-inv text-fg-inv mt-24">
      <div class="mx-auto max-w-[1280px] px-6 py-16">
        <div class="font-display text-lg">
          {{ $t('common.brand') }}
        </div>
        <p class="text-fg-subtle mt-2 text-sm">
          {{ $t('common.brandSince') }} · {{ route.path }}
        </p>
      </div>
    </footer>
  </div>
</template>
