<script setup lang="ts">
/**
 * /login — narrow and calm, directly on the paper. Inline field errors from the shared
 * schema; a top banner for a submit that passed validation but the API refused.
 *
 * The API is the authority on the credentials (T14): there is no fixture lookup left, and
 * a wrong password and an unknown email both come back as the same `INVALID_CREDENTIALS`
 * 401, which is what the single message here reports.
 *
 * Submit honours `?redirect=` so a dashboard bounce lands where the visitor was going.
 */
import { loginSchema } from '~/utils/validation'
import type { FieldErrors } from '~/utils/validation'
import { ApiRequestError } from '~/utils/api'
import { useAuth } from '~/composables/useAuth'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const { login, startOAuth, pending } = useAuth()

const email = ref('')
const password = ref('')
const remember = ref(false)
const fieldErrors = ref<FieldErrors>({})
const touched = ref({ email: false, password: false })
const formError = ref('')

const redirectTarget = computed(() => {
  const raw = route.query.redirect
  // `startsWith('/')` also admits `//evil.example`, which the browser would treat as a
  // different origin. A single leading slash is the whole rule.
  return typeof raw === 'string' && /^\/(?!\/)/.test(raw) ? raw : '/'
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
  try {
    await login({ email: email.value.trim(), password: password.value })
    await router.push(redirectTarget.value)
  }
  catch (error) {
    formError.value = error instanceof ApiRequestError
      ? t('auth.invalidCredentials')
      : t('common.unexpectedError')
  }
  // A failed submit keeps the form filled: the values above are never cleared, so the
  // visitor can correct a typo instead of retyping everything.
}

function signInWith(provider: 'google' | 'github'): void {
  if (pending.value) return
  startOAuth(provider, redirectTarget.value)
}
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
        <span class="text-fg-muted text-sm">{{ $t('common.or') }}</span>
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
