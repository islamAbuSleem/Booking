<script setup lang="ts">
/**
 * /login — narrow and calm, directly on the paper. Inline field errors from
 * the shared schema; a top banner only for a sign-in that validation passed
 * but the mock account lookup failed. Submit honours `?redirect=` or `/`.
 *
 * Mock rule: the three fixture accounts (guest/host/admin @example.com) sign
 * in as themselves; anything else is an unknown account. The API (T14) is the
 * real check — this just exercises both states without a backend.
 */
import { USERS } from '~/utils/mock'
import { loginSchema } from '~/utils/validation'
import type { FieldErrors } from '~/utils/validation'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const { signInAs } = useSession()

const email = ref('')
const password = ref('')
const remember = ref(false)
const fieldErrors = ref<FieldErrors>({})
const touched = ref({ email: false, password: false })
const formError = ref('')
const pending = ref(false)

const redirectTarget = computed(() => {
  const raw = route.query.redirect
  return typeof raw === 'string' && raw.startsWith('/') ? raw : '/'
})

function validate(): boolean {
  const result = loginSchema.safeParse({ email: email.value, password: password.value })
  fieldErrors.value = { ...result.errors }
  return result.success
}

async function submit(): Promise<void> {
  touched.value = { email: true, password: true }
  formError.value = ''
  if (!validate() || pending.value) return
  pending.value = true
  try {
    await new Promise(resolve => setTimeout(resolve, 500))
    const match = USERS.find(user => user.email.toLowerCase() === email.value.trim().toLowerCase())
    if (!match) {
      formError.value = t('auth.invalidCredentials')
      return
    }
    signInAs(match)
    await router.push(redirectTarget.value)
  }
  finally {
    pending.value = false
  }
}

function signInWith(_provider: 'google' | 'github'): void {
  if (pending.value) return
  // Mock OAuth: both providers resolve to the guest fixture. T15 wires the
  // real provider round trip; there is no code exchange to perform here.
  const guest = USERS[0]
  if (!guest) return
  signInAs(guest)
  void router.push(redirectTarget.value)
}

useSeoMeta({
  title: () => `${t('auth.loginTitle')} · ${t('common.brand')}`,
  description: () => t('auth.loginDescription'),
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
        {{ $t('auth.loginTitle') }}
      </h1>
      <p class="text-fg-muted mt-2 text-center text-sm">
        {{ $t('auth.loginSubtitle') }}
      </p>

      <BaseAlert
        v-if="formError"
        tone="danger"
        class="mt-6"
      >
        {{ formError }}
      </BaseAlert>

      <form
        class="mt-8 flex flex-col gap-5"
        novalidate
        @submit.prevent="submit"
      >
        <BaseInput
          id="login-email"
          v-model="email"
          type="email"
          :label="$t('auth.email')"
          autocomplete="email"
          :error="touched.email && fieldErrors.email ? $t(fieldErrors.email) : ''"
          @blur="touched.email = true"
        />
        <BaseInput
          id="login-password"
          v-model="password"
          type="password"
          :label="$t('auth.password')"
          autocomplete="current-password"
          :error="touched.password && fieldErrors.password ? $t(fieldErrors.password) : ''"
          @blur="touched.password = true"
        />

        <div class="flex items-center justify-between">
          <label class="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
            <input
              v-model="remember"
              type="checkbox"
              class="accent-accent h-4 w-4 shrink-0 rounded-sm"
            >
            <span>{{ $t('auth.rememberMe') }}</span>
          </label>
          <span class="text-link text-sm">{{ $t('auth.forgotPassword') }}</span>
        </div>

        <BaseButton
          type="submit"
          variant="primary"
          size="lg"
          class="w-full"
          :loading="pending"
          :disabled="pending"
        >
          {{ pending ? $t('auth.signingIn') : $t('auth.signIn') }}
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
        {{ $t('auth.newHere') }}
        <NuxtLink
          :to="{ path: '/register', query: route.query.redirect ? { redirect: route.query.redirect } : {} }"
          class="text-link underline-offset-4 hover:underline"
        >
          {{ $t('auth.createAccount') }}
        </NuxtLink>
      </p>
    </div>
  </div>
</template>
