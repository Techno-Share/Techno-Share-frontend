<script setup lang="ts">
import { ref } from 'vue'
import PasswordField from '@/components/base/PasswordField.vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth.store'
import CodeInput from '@/components/base/CodeInput.vue'

/**
 * Choose a new password, using the code from the reset email.
 *
 * The forgot-password screen handles this inline for anyone still on it; this
 * exists for the person who closed the tab and came back to the link in the
 * mail, or who navigated here directly.
 *
 * On success it sends the reader to the login screen rather than signing them
 * in: the password is being set by someone who could not produce the old one,
 * so the session waits until they can type the new one — which also means an
 * abandoned reset leaves no logged-in tab behind.
 */
const { t } = useI18n({ useScope: 'global' })
const route = useRoute()
const auth = useAuthStore()

/**
 * For the person who closed the tab after asking for a code.
 *
 * The address may come in the query (from the forgot screen) or be typed. It
 * is required either way: the code is stored under bcrypt, so the address is
 * what names the row to compare against.
 */
const prefilled = String(route.query.email ?? '')
const email = ref(prefilled)
const code = ref('')
/** Same two-step shape as the forgot screen: code first, password after. */
const step = ref<'code' | 'password'>('code')
const password = ref('')
const confirm = ref('')
const errors = ref({ password: '', confirm: '' })
const done = ref('')

function validate() {
  errors.value.password = !password.value
    ? 'auth.reset.emptyPassword'
    : password.value.length < 8
      ? 'auth.reset.shortPassword'
      : ''
  errors.value.confirm = !confirm.value
    ? 'auth.reset.emptyConfirm'
    : confirm.value !== password.value
      ? 'auth.reset.notMatch'
      : ''
}

async function submitCode() {
  if (code.value.length !== 6 || !email.value.trim()) return
  try {
    await auth.checkResetCode(email.value.trim().toLowerCase(), code.value)
    step.value = 'password'
  } catch {
    code.value = ''
  }
}

async function submit(e: Event) {
  e.preventDefault()
  validate()
  if (errors.value.password || errors.value.confirm) return

  if (code.value.length !== 6 || !email.value.trim()) return

  try {
    done.value = await auth.resetPassword(
      email.value.trim().toLowerCase(),
      code.value,
      password.value,
    )
  } catch {
    // Almost always expiry — the window ran out while the password was being
    // chosen. Back to the code step, where "request a new code" lives.
    code.value = ''
    step.value = 'code'
    // auth.error carries the server's reason — expired, already used, or not
    // valid — and each needs a different response from the reader.
  }
}
</script>

<template>
  <div class="flex flex-col">
    <div
      class="md:w-115 w-80 h-fit bg-white border border-gray-200 rounded-2xl shadow-sm px-8 py-8"
    >
      <!-- Done -->
      <template v-if="done">
        <h1 class="text-2xl font-bold text-gray-900 text-center">
          {{ t('auth.reset.doneTitle') }}
        </h1>
        <p class="mt-3 text-center text-gray-600">{{ done }}</p>
        <!-- Worth saying plainly: every other device has been signed out, and
             a student who does not expect that will think something broke. -->
        <p class="mt-2 text-center text-sm text-gray-500">{{ t('auth.reset.sessionsEnded') }}</p>

        <RouterLink
          to="/auth/login"
          class="mt-6 block w-full rounded-xl bg-primary py-3 text-center font-semibold text-white transition hover:bg-primary-hover active:scale-[0.99]"
        >
          {{ t('auth.reset.signIn') }}
        </RouterLink>
      </template>

      <template v-else>
        <h1 class="text-3xl font-bold text-gray-900 text-center">
          {{ t('auth.reset.title') }}
        </h1>
        <p class="mt-3 text-center text-gray-600">
          {{ step === 'code' ? t('auth.reset.lead') : t('auth.forgot.codeAccepted') }}
        </p>

        <!-- Server error banner. Every reason it fires is fixed by getting a
             new code, so the way out is offered inside the banner itself. -->
        <div v-if="auth.error" class="mt-5 p-3 bg-red-50 border border-red-200 rounded-xl">
          <p class="text-red-600 text-sm text-center">{{ auth.error }}</p>
          <RouterLink
            to="/auth/forgot-password"
            class="mt-2 block text-center text-sm font-semibold text-primary hover:underline"
          >
            {{ t('auth.reset.requestCode') }}
          </RouterLink>
        </div>

        <form @submit="submit" class="mt-6 flex flex-col gap-4">
          <!-- Only when we were not told who this is. Arriving from the forgot
               screen the address is known, and repeating it back as an
               editable field just invites a typo. -->
          <div v-if="!prefilled">
            <label for="reset-email" class="text-sm font-semibold text-gray-600">{{
              t('auth.reset.email')
            }}</label>
            <input
              id="reset-email"
              v-model="email"
              type="email"
              autocomplete="email"
              :placeholder="t('auth.reset.yourEmail')"
              class="mt-1.5 w-full rounded-xl border border-gray-200 px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <p v-else class="text-center text-sm text-gray-500">
            {{ t('auth.reset.codeSentTo') }}
            <span class="font-semibold text-gray-900">{{ email }}</span>
          </p>

          <CodeInput
            v-if="step === 'code'"
            v-model="code"
            :disabled="auth.loading"
            @complete="submitCode"
          />

          <div v-if="step === 'password'">
            <label for="new-password" class="text-sm font-semibold text-gray-600">{{
              t('auth.reset.password')
            }}</label>
            <PasswordField
              v-model="password"
              id="new-password"
              autocomplete="new-password"
              :placeholder="t('auth.reset.yourPassword')"
              wrapper-class="mt-1.5"
              class="w-full rounded-xl border border-gray-200 px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary"
              @blur="validate"
            />
            <p v-if="errors.password" class="mt-1 text-sm text-red-500">
              {{ t(errors.password) }}
            </p>
          </div>

          <div v-if="step === 'password'">
            <label for="confirm-password" class="text-sm font-semibold text-gray-600">{{
              t('auth.reset.confirm')
            }}</label>
            <PasswordField
              v-model="confirm"
              id="confirm-password"
              autocomplete="new-password"
              :placeholder="t('auth.reset.confirmPassword')"
              wrapper-class="mt-1.5"
              class="w-full rounded-xl border border-gray-200 px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary"
              @blur="validate"
            />
            <p v-if="errors.confirm" class="mt-1 text-sm text-red-500">{{ t(errors.confirm) }}</p>
          </div>

          <!-- One button, two jobs: check the code, then save the password. -->
          <button
            v-if="step === 'code'"
            type="button"
            :disabled="auth.loading || code.length !== 6 || !email.trim()"
            class="w-full py-3 mt-1 text-white rounded-xl bg-primary cursor-pointer hover:bg-primary-hover active:scale-[0.99] transition font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            @click="submitCode"
          >
            <span v-if="auth.loading">{{ t('auth.forgot.checking') }}</span>
            <span v-else>{{ t('auth.forgot.continue') }}</span>
          </button>

          <button
            v-else
            type="submit"
            :disabled="auth.loading"
            class="w-full py-3 mt-1 text-white rounded-xl bg-primary cursor-pointer hover:bg-primary-hover active:scale-[0.99] transition font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span v-if="auth.loading" class="flex items-center justify-center gap-2">
              <svg
                class="animate-spin h-5 w-5 text-white"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  class="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  stroke-width="4"
                />
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              {{ t('auth.reset.saving') }}
            </span>
            <span v-else>{{ t('auth.reset.save') }}</span>
          </button>

          <RouterLink to="/auth/login" class="text-center text-sm text-gray-600 hover:underline">
            {{ t('auth.reset.backToLogin') }}
          </RouterLink>
        </form>
      </template>
    </div>
  </div>
</template>
