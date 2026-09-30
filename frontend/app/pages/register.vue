<script setup lang="ts">
/**
 * /register — same narrow column as login, plus the name field and the
 * host-intent checkbox. Any well-formed registration signs in as a fake user
 * carrying the typed name, email, and host intent.
 */
import { registerSchema } from '~/utils/validation'
import type { FieldErrors } from '~/utils/validation'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const { signInRegistered } = useSession()

const name = ref('')
const email = ref('')
const password = ref('')
const wantsToHost = ref(false)
const fieldErrors = ref<FieldErrors>({})
const touched = ref({ name: false, email: false, password: false })
const pending = ref(false)

const redirectTarget = computed(() => {
  const raw = route.query.redirect
  return typeof raw === 'string' && raw.startsWith('/') ? raw : '/'
})

function validate(): boolean {
  const result = registerSchema.safeParse({
    name: name.value,
    email: email.value,
    password: password.value,
    wantsToHost: wantsToHost.value,
  })
  fieldErrors.value = { ...result.errors }
  return result.success
}

async function submit(): Promise<void> {
  touched.value = { name: true, email: true, password: true }
  if (!validate() || pending.value) return
  pending.value = true
  try {
    await new Promise(resolve => setTimeout(resolve, 500))
    signInRegistered(name.value.trim(), email.value.trim(), wantsToHost.value)
    await router.push(redirectTarget.value)
  }
  finally {
    pending.value = false
  }
}

function signInWith(provider: 'google' | 'github'): void {
  if (pending.value) return
  // Same mock as login: OAuth resolves to a fake user. The name is marked as
  // the provider account because there is no profile fetch in Phase 1.
  const label = provider === 'google' ? 'Google guest' : 'GitHub guest'
  signInRegistered(label, `${provider}-guest@example.com`, false)
  void router.push(redirectTarget.value)
}

useSeoMeta({
  title: () => `${t('auth.registerTitle')} · ${t('common.brand')}`,
  description: () => t('auth.registerDescription'),
  robots: 'noindex, nofollow',
})
</script>

<template>
  <div class="mx-auto w-full max-w-[420px] px-6 py-14 lg:py-20">
    <div class="border-rule border-t pt-10">
      <p class="font-display text-center text-xl">
        {{ $t('common.brand') }}
      </p>
      <h1 class="font-display mt-4 text-center text-display-l">
        {{ $t('auth.registerTitle') }}
      </h1>
      <p class="text-fg-muted mt-2 text-center text-sm">
        {{ $t('auth.registerSubtitle') }}
      </p>

      <form
        class="mt-8 flex flex-col gap-5"
        novalidate
        @submit.prevent="submit"
      >
        <BaseInput
          id="register-name"
          v-model="name"
          type="text"
          :label="$t('auth.fullName')"
          autocomplete="name"
          :error="touched.name && fieldErrors.name ? $t(fieldErrors.name) : ''"
          @blur="touched.name = true"
        />
        <BaseInput
          id="register-email"
          v-model="email"
          type="email"
          :label="$t('auth.email')"
          autocomplete="email"
          :error="touched.email && fieldErrors.email ? $t(fieldErrors.email) : ''"
          @blur="touched.email = true"
        />
        <BaseInput
          id="register-password"
          v-model="password"
          type="password"
          :label="$t('auth.password')"
          autocomplete="new-password"
          :hint="$t('auth.passwordHint')"
          :error="touched.password && fieldErrors.password ? $t(fieldErrors.password) : ''"
          @blur="touched.password = true"
        />

        <label class="border-rule bg-surface flex cursor-pointer items-start gap-3 rounded-sm border p-4">
          <input
            v-model="wantsToHost"
            type="checkbox"
            class="accent-accent mt-0.5 h-4 w-4 shrink-0 rounded-sm"
          >
          <span>
            <span class="block text-sm font-medium">{{ $t('auth.hostIntent') }}</span>
            <span class="text-fg-muted block text-sm">{{ $t('auth.hostIntentHint') }}</span>
          </span>
        </label>

        <BaseButton
          type="submit"
          variant="primary"
          size="lg"
          class="w-full"
          :loading="pending"
          :disabled="pending"
        >
          {{ pending ? $t('auth.creatingAccount') : $t('auth.createAccountButton') }}
        </BaseButton>
      </form>

      <div class="my-6 flex items-center gap-4">
        <span
          class="border-rule flex-1 border-t"
          aria-hidden="true"
        />
        <span class="text-fg-subtle text-sm">{{ $t('common.or') }}</span>
        <span
          class="border-rule flex-1 border-t"
          aria-hidden="true"
        />
      </div>

      <OAuthButtons
        :loading="pending"
        @oauth="signInWith"
      />

      <p class="text-fg-muted mt-8 text-center text-sm">
        {{ $t('auth.haveAccount') }}
        <NuxtLink
          :to="{ path: '/login', query: route.query.redirect ? { redirect: route.query.redirect } : {} }"
          class="text-link underline-offset-4 hover:underline"
        >
          {{ $t('auth.signIn') }}
        </NuxtLink>
      </p>
    </div>
  </div>
</template>
