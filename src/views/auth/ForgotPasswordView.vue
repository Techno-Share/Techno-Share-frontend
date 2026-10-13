<script setup lang="ts">
import { ref } from 'vue'
import PasswordField from '@/components/base/PasswordField.vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth.store'
import CodeInput from '@/components/base/CodeInput.vue'
import { useCountdown } from '@/composables/useCountdown'

/**
 * Ask for a reset link.
 *
 * The success panel says the same thing whether or not the address has an
 * account — the server answers identically, and a screen that said "no such
 * account" would hand back the enumeration the endpoint was careful not to
 * give. So it shows "if that address has an account…" and means it.
 */
const { t } = useI18n({ useScope: 'global' })
const auth = useAuthStore()

const email = ref('')
const emailError = ref('')
/** Non-empty once a code has been sent: the address it went to. */
const sent = ref('')

/**
 * Which of the three steps is on screen.
 *
 * The code is checked on its own before the password fields appear. Asking for
 * both at once means a wrong code is only discovered after a password has been
 * typed twice — and then the safest thing to do with what was typed is throw
 * it away, which is a poor thing to do to someone already locked out.
 */
const step = ref<'email' | 'code' | 'password'>('email')

const { formatted: codeLeft, expired: codeExpired, start: startCodeTimer } = useCountdown()

/**
 * The code and the new password are entered here, not on another screen.
 *
 * The code arrives within seconds and the address is already known — routing
 * away would lose that and gain nothing. The standalone reset screen exists
 * for the person who closed the tab.
 */
const code = ref('')
const password = ref('')
const confirm = ref('')
const fieldErrors = ref({ password: '', confirm: '' })
const done = ref('')

function validateNew() {
  fieldErrors.value.password = !password.value
    ? 'auth.reset.emptyPassword'
    : password.value.length < 8
      ? 'auth.reset.shortPassword'
      : ''
  fieldErrors.value.confirm = !confirm.value
    ? 'auth.reset.emptyConfirm'
    : confirm.value !== password.value
      ? 'auth.reset.notMatch'
      : ''
}

/**
 * Step 2: is this code right?
 *
 * The server checks without spending it, so the same code is still good for
 * the reset itself a moment later.
 */
async function submitCode() {
  if (code.value.length !== 6) return
  try {
    await auth.checkResetCode(sent.value, code.value)
    step.value = 'password'
  } catch {
    // Wrong, expired, or out of attempts — auth.error says which. Clear the
    // boxes so the next code can just be typed.
    code.value = ''
  }
}

async function submitReset(e: Event) {
  e.preventDefault()
  validateNew()
  if (fieldErrors.value.password || fieldErrors.value.confirm) return
  if (code.value.length !== 6) return

  try {
    done.value = await auth.resetPassword(sent.value, code.value, password.value)
  } catch {
    // The code was good a moment ago, so this is almost always expiry — the
    // ten-minute window ran out while the password was being chosen. Back to
    // the code step, where "send a new code" lives.
    code.value = ''
    step.value = 'code'
  }
}

async function resend() {
  code.value = ''
  step.value = 'code'
  try {
    const again = await auth.forgotPassword(sent.value)
    startCodeTimer(again.expires_in)
  } catch {
    // auth.error is shown in the banner
  }
}

function validate() {
  emailError.value = !email.value.trim()
    ? 'auth.forgot.enterEmail'
    : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())
      ? 'auth.forgot.invalidEmail'
      : ''
}

async function submit(e: Event) {
  e.preventDefault()
  validate()
  if (emailError.value) return

  try {
    const result = await auth.forgotPassword(email.value.trim().toLowerCase())
    // The server says the same thing whether or not the address has an
    // account, so this screen moves on regardless — anything else would leak
    // which addresses are registered.
    sent.value = email.value.trim().toLowerCase()
    startCodeTimer(result.expires_in)
    step.value = 'code'
  } catch {
    // auth.error is shown in the banner
  }
}
</script>

<template>
  <div class="flex flex-col">
    <div
      class="md:w-115 w-80 h-fit bg-white border border-gray-200 rounded-2xl shadow-sm px-8 py-8"
    >
      <!-- Changed: nothing left to do here. -->
      <template v-if="done">
        <h1 class="text-2xl font-bold text-gray-900 text-center">
          {{ t('auth.reset.doneTitle') }}
        </h1>
        <p class="mt-3 text-center text-gray-600">{{ done }}</p>
        <p class="mt-2 text-center text-sm text-gray-500">{{ t('auth.reset.sessionsEnded') }}</p>
        <RouterLink
          to="/auth/login"
          class="mt-6 block w-full rounded-xl bg-primary py-3 text-center font-semibold text-white transition hover:bg-primary-hover active:scale-[0.99]"
        >
          {{ t('auth.reset.signIn') }}
        </RouterLink>
      </template>

      <!-- Step 2: the code, on its own. -->
      <template v-else-if="step === 'code'">
        <h1 class="text-2xl font-bold text-gray-900 text-center">
          {{ t('auth.forgot.sentTitle') }}
        </h1>
        <p class="mt-3 text-center text-gray-600">
          {{ t('auth.forgot.codeSentTo') }}
          <span class="font-semibold text-gray-900">{{ sent }}</span>
        </p>

        <div v-if="auth.error" class="mt-5 p-3 bg-red-50 border border-red-200 rounded-xl">
          <p class="text-red-600 text-sm text-center">{{ auth.error }}</p>
        </div>

        <form @submit.prevent="submitCode" class="mt-6 flex flex-col gap-4">
          <!-- Auto-submits on the sixth digit, so the common case needs no
               button press at all. -->
          <CodeInput v-model="code" :disabled="auth.loading" @complete="submitCode" />

          <button
            type="submit"
            :disabled="auth.loading || code.length !== 6 || codeExpired"
            class="w-full py-3 mt-1 text-white rounded-xl bg-primary cursor-pointer hover:bg-primary-hover active:scale-[0.99] transition font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span v-if="auth.loading">{{ t('auth.forgot.checking') }}</span>
            <span v-else>{{ t('auth.forgot.continue') }}</span>
          </button>
        </form>

        <p v-if="codeExpired" class="mt-5 text-center text-sm text-red-500">
          {{ t('auth.verify.codeExpired') }}
        </p>
        <p v-else class="mt-5 text-center text-sm text-gray-500">
          {{ t('auth.verify.expiresIn') }}
          <span class="font-semibold tabular-nums text-gray-700">{{ codeLeft }}</span>
        </p>

        <div class="mt-4 flex flex-col items-center gap-2">
          <button
            type="button"
            class="text-sm font-semibold text-primary hover:underline disabled:opacity-50"
            :disabled="auth.loading"
            @click="resend"
          >
            {{ t('auth.forgot.resendCode') }}
          </button>
          <RouterLink to="/auth/login" class="text-sm text-gray-500 hover:underline">
            {{ t('auth.forgot.backToLogin') }}
          </RouterLink>
        </div>
      </template>

      <!-- Step 3: the code was accepted, so now the password. -->
      <template v-else-if="step === 'password'">
        <h1 class="text-2xl font-bold text-gray-900 text-center">
          {{ t('auth.reset.title') }}
        </h1>
        <p class="mt-3 text-center text-gray-600">{{ t('auth.forgot.codeAccepted') }}</p>

        <div v-if="auth.error" class="mt-5 p-3 bg-red-50 border border-red-200 rounded-xl">
          <p class="text-red-600 text-sm text-center">{{ auth.error }}</p>
        </div>

        <form @submit="submitReset" class="mt-6 flex flex-col gap-4">
          <div>
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
              @blur="validateNew"
            />
            <p v-if="fieldErrors.password" class="mt-1 text-sm text-red-500">
              {{ t(fieldErrors.password) }}
            </p>
          </div>

          <div>
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
              @blur="validateNew"
            />
            <p v-if="fieldErrors.confirm" class="mt-1 text-sm text-red-500">
              {{ t(fieldErrors.confirm) }}
            </p>
          </div>

          <button
            type="submit"
            :disabled="auth.loading"
            class="w-full py-3 mt-1 text-white rounded-xl bg-primary cursor-pointer hover:bg-primary-hover active:scale-[0.99] transition font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span v-if="auth.loading">{{ t('auth.reset.saving') }}</span>
            <span v-else>{{ t('auth.reset.save') }}</span>
          </button>
        </form>
      </template>

      <template v-else>
        <h1 class="text-3xl font-bold text-gray-900 text-center">
          {{ t('auth.forgot.title') }}
        </h1>
        <p class="mt-3 text-center text-gray-600">{{ t('auth.forgot.lead') }}</p>

        <!-- Server error banner -->
        <div v-if="auth.error" class="mt-5 p-3 bg-red-50 border border-red-200 rounded-xl">
          <p class="text-red-600 text-sm text-center">{{ auth.error }}</p>
        </div>

        <form @submit="submit" class="mt-6 flex flex-col gap-4">
          <div>
            <label for="forgot-email" class="text-sm font-semibold text-gray-600">{{
              t('auth.forgot.email')
            }}</label>
            <input
              id="forgot-email"
              v-model="email"
              @blur="validate"
              type="email"
              autocomplete="email"
              :placeholder="t('auth.forgot.yourEmail')"
              class="mt-1.5 w-full rounded-xl border border-gray-200 px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <p v-if="emailError" class="mt-1 text-sm text-red-500">{{ t(emailError) }}</p>
          </div>

          <button
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
              {{ t('auth.forgot.sending') }}
            </span>
            <span v-else>{{ t('auth.forgot.send') }}</span>
          </button>

          <div class="flex justify-center gap-2 text-sm text-gray-600">
            <span>{{ t('auth.forgot.remembered') }}</span>
            <RouterLink to="/auth/login" class="font-semibold text-primary hover:underline">
              {{ t('auth.forgot.signIn') }}
            </RouterLink>
          </div>
        </form>
      </template>
    </div>
  </div>
</template>
