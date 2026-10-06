<script setup lang="ts">
/**
 * /register — same narrow column as login, plus the name field and the host-intent
 * checkbox. `wantsToHost` is a first-class API field, not a client-side flag: T14 promotes
 * the new account to HOST server-side, and the role that comes back on the session is the
 * one the dashboard middleware will read.
 */
import { registerSchema } from '~/utils/validation'
import type { FieldErrors } from '~/utils/validation'
import { isApiError, isApiFailure } from '~/utils/api'
import { useAuth } from '~/composables/useAuth'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const { register, startOAuth, pending } = useAuth()

const name = ref('')
const email = ref('')
const password = ref('')
const wantsToHost = ref(false)
const fieldErrors = ref<FieldErrors>({})
const touched = ref({ name: false, email: false, password: false })
const formError = ref('')

const redirectTarget = computed(() => {
  const raw = route.query.redirect
  // A single leading slash only: `//host` is protocol-relative and would leave the origin.
  return typeof raw === 'string' && /^\/(?!\/)/.test(raw) ? raw : '/'
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

/**
 * Only the API's own answers get the API's prose. `NETWORK_ERROR` and `BAD_RESPONSE` are
 * `ApiRequestError`s too, so `instanceof` alone told a visitor with the backend down that
 * their email was taken — the one message that tells them not to try again.
 */
function failureMessage(error: unknown): string {
  if (!isApiError(error)) return t('common.unexpectedError')
  if (error.code === 'EMAIL_TAKEN' || error.code === 'CONFLICT') return t('auth.emailExists')
  if (!isApiFailure(error)) return t('common.unexpectedError')
  return error.message
}

async function submit(): Promise<void> {
  touched.value = { name: true, email: true, password: true }
  formError.value = ''
  if (!validate() || pending.value) return
  try {
    await register({
      name: name.value.trim(),
      email: email.value.trim(),
      password: password.value,
      wantsToHost: wantsToHost.value,
    })
    await router.push(redirectTarget.value)
  }
  catch (error: unknown) {
    // The API owns the "that email is taken" answer; the client only maps it to prose.
    // Branched on the code so a 500 or a transport failure is not reported as a duplicate
    // email — the mirror of the same bug on /login, and `failureMessage` does exactly that.
    formError.value = failureMessage(error)
  }
  // The form keeps its values on failure — retyping a password to fix a duplicate email
  // is the kind of friction that loses the signup.
}

function signInWith(provider: 'google' | 'github'): void {
  if (pending.value) return
  // OAuth cannot carry the host intent: the provider owns the profile, so the account is
  // created as a GUEST and promoted later from the dashboard.
  startOAuth(provider, redirectTarget.value)
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

      <!--
        `tone="danger"` already renders `role="alert"`, so a screen reader announces the
        refusal. Without this the duplicate-email answer from the API was set in
        `formError` and never shown — a silent failure on the one error every visitor
        eventually hits.
      -->
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
