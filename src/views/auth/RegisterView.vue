<script setup lang="ts">
import { reactive, ref } from 'vue'
import PasswordField from '@/components/base/PasswordField.vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '../../stores/auth.store'
import GoogleSignInButton from '@/components/base/GoogleSignInButton.vue'
import { checkName } from '@/utils/format'
import CodeInput from '@/components/base/CodeInput.vue'
import { useCountdown } from '@/composables/useCountdown'

const { t } = useI18n()
const authStore = useAuthStore()
const router = useRouter()

/**
 * One form, one request: submitting creates the account and signs the student
 * in. There is no email-ownership check, so the address is simply typed like
 * any other field. Student ID, department and year are all collected later by
 * the complete-profile prompt, which is also what a Google sign-up sees.
 *
 * Department and year are not asked for here — students set them on their
 * profile. Until they do, audience-restricted documents stay hidden from them.
 */

const form = reactive({
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  confirmPassword: '',
})

const errors = reactive({
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  confirmPassword: '',
})

// The rule itself lives in utils/format — the profile editor enforces the
// same one, and two copies of a pattern is how they stop agreeing.
const NAME_PROBLEM_KEYS = {
  spaces: 'auth.register.nameNoSpace',
  invalid: 'auth.register.invaildName',
  lowercase: 'auth.register.nameCapital',
} as const
// Deliberately loose: the server's IsEmail is the authority, and an overly
// strict client pattern only rejects addresses that are actually fine.
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validateFirstName() {
  const problem = checkName(form.firstName)
  errors.firstName = !form.firstName.trim()
    ? 'auth.register.enterFirstName'
    : problem
      ? NAME_PROBLEM_KEYS[problem]
      : ''
}
function validateLastName() {
  const problem = checkName(form.lastName)
  errors.lastName = !form.lastName.trim()
    ? 'auth.register.enterLastName'
    : problem
      ? NAME_PROBLEM_KEYS[problem]
      : ''
}
function validateEmail() {
  errors.email = !form.email
    ? 'auth.register.enterEmail'
    : !emailRegex.test(form.email.trim())
      ? 'auth.register.invalidEmail'
      : ''
}
function validatePassword() {
  errors.password = !form.password
    ? 'auth.register.emptyPassword'
    : form.password.length < 8
      ? 'auth.register.shortPassword'
      : ''
}
function validateConfirmPassword() {
  errors.confirmPassword = !form.confirmPassword
    ? 'auth.register.emptyConfirmPassword'
    : form.password !== form.confirmPassword
      ? 'auth.register.notMatchPassword'
      : ''
}

async function submit(e: Event) {
  e.preventDefault()
  validateFirstName()
  validateLastName()
  validateEmail()
  validatePassword()
  validateConfirmPassword()
  if (Object.values(errors).some(Boolean)) return

  try {
    const expiresIn = await authStore.register({
      first_name: form.firstName.trim(),
      last_name: form.lastName.trim(),
      email: form.email.trim().toLowerCase(),
      password: form.password,
    })
    // No longer signed in by the time this resolves — the account exists but
    // the address is unproven, so there is nowhere to navigate to. The screen
    // swaps for a "check your inbox" panel instead.
    sentTo.value = form.email.trim().toLowerCase()
    startCodeTimer(expiresIn)
  } catch {
    // authStore.error is shown in the banner
  }
}

/** Non-empty once the account is created: the address the code went to. */
const sentTo = ref('')
const resent = ref('')
const code = ref('')

/**
 * Destructured so the template can read `codeLeft` and `codeExpired` directly
 * — Vue only auto-unwraps refs at the top level of setup state, not ones
 * reached through an object.
 */
const { formatted: codeLeft, expired: codeExpired, start: startCodeTimer } = useCountdown()

/**
 * The code is entered here rather than on a separate screen.
 *
 * It arrives within seconds of submitting this form, and the address it was
 * sent to is already known — sending someone to another route to type six
 * digits would lose that and gain nothing. The standalone screen exists for
 * the person who closed the tab.
 */
async function submitCode() {
  if (code.value.length !== 6) return
  resent.value = ''
  try {
    await authStore.verifyEmail(sentTo.value, code.value)
    // Signed in by the time this resolves, so go straight into the app. The
    // complete-profile prompt on the home screen collects department and year,
    // exactly as it does after a Google sign-up.
    router.push('/')
  } catch {
    // Clear the boxes so the next code can just be typed; authStore.error
    // says whether it was wrong, expired, or one too many.
    code.value = ''
  }
}

async function resend() {
  resent.value = ''
  code.value = ''
  try {
    const again = await authStore.resendVerification(sentTo.value)
    resent.value = again.message
    startCodeTimer(again.expires_in)
  } catch {
    // authStore.error is shown in the banner
  }
}
</script>

<template>
  <div class="md:w-180 w-80 h-fit bg-white border border-gray-200 rounded-2xl shadow-sm px-8 py-8">
    <!-- Done: the account exists and the link is in flight. Deliberately the
         whole card rather than a banner above the form — leaving the fields
         on screen invites someone to submit them again, which is a second
         account attempt and a second email. -->
    <!-- Account created, code in flight. The whole card swaps rather than a
         banner appearing above the form: leaving the fields on screen invites
         someone to submit them again, which is a second account attempt. -->
    <template v-if="sentTo">
      <h1 class="text-3xl font-bold text-gray-900 text-center">
        {{ t('auth.register.checkInbox') }}
      </h1>
      <p class="mt-4 text-center text-gray-600">
        {{ t('auth.register.codeSentTo') }}
        <span class="font-semibold text-gray-900">{{ sentTo }}</span>
      </p>

      <div v-if="authStore.error" class="mt-5 rounded-xl border border-red-200 bg-red-50 p-3">
        <p class="text-center text-sm text-red-600">{{ authStore.error }}</p>
      </div>
      <p v-if="resent" class="mt-5 rounded-xl bg-green-50 p-3 text-center text-sm text-green-700">
        {{ resent }}
      </p>

      <form @submit.prevent="submitCode" class="mt-6 flex flex-col items-center gap-4">
        <CodeInput v-model="code" :disabled="authStore.loading" @complete="submitCode" />
        <button
          type="submit"
          :disabled="authStore.loading || code.length !== 6 || codeExpired"
          class="w-md rounded-xl bg-primary py-3 font-semibold text-white disabled:opacity-50 hover:cursor-pointer"
        >
          {{ authStore.loading ? t('auth.verify.checking') : t('auth.verify.confirm') }}
        </button>
      </form>

      <!-- The window, ticking. Turns into a plain "expired" line at zero so
           the reader is told the code is dead rather than left to infer it
           from a timer that has stopped. -->
      <p v-if="codeExpired" class="mt-5 text-center text-sm text-red-500">
        {{ t('auth.verify.codeExpired') }}
      </p>
      <p v-else class="mt-5 text-center text-sm text-gray-500">
        {{ t('auth.verify.expiresIn') }}
        <span class="font-semibold tabular-nums text-gray-700">{{ codeLeft }}</span>
      </p>

      <div class="mt-4 flex flex-col items-center gap-3">
        <button
          type="button"
          class="text-sm font-semibold text-primary hover:underline disabled:opacity-50 hover:cursor-pointer"
          :disabled="authStore.loading"
          @click="resend"
        >
          {{ t('auth.register.resendCode') }}
        </button>
        <RouterLink to="/auth/login" class="text-sm text-gray-500 hover:underline">
          {{ t('auth.register.backToLogin') }}
        </RouterLink>
      </div>
    </template>

    <template v-else>
      <h1 class="text-3xl font-bold text-gray-900 text-center">
        {{ t('auth.register.register') }}
      </h1>

      <!-- Server error banner -->
      <div v-if="authStore.error" class="mt-5 p-3 bg-red-50 rounded-xl">
        <p class="text-red-600 text-sm text-center">{{ authStore.error }}</p>
      </div>

      <form @submit="submit" class="mt-6 grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4">
        <div>
          <label class="text-sm font-semibold text-gray-600">{{
            t('auth.register.firstName')
          }}</label>
          <input
            v-model="form.firstName"
            @blur="validateFirstName"
            type="text"
            class="mt-1.5 w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-primary"
            :placeholder="t('auth.register.yourFirstName')"
          />
          <p v-if="errors.firstName" class="mt-1.5 text-sm text-red-500">
            {{ t(errors.firstName) }}
          </p>
        </div>

        <div>
          <label class="text-sm font-semibold text-gray-600">{{
            t('auth.register.lastName')
          }}</label>
          <input
            v-model="form.lastName"
            @blur="validateLastName"
            type="text"
            class="mt-1.5 w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-primary"
            :placeholder="t('auth.register.yourLastName')"
          />
          <p v-if="errors.lastName" class="mt-1.5 text-sm text-red-500">{{ t(errors.lastName) }}</p>
        </div>

        <!-- Its own row: an address is long, and pairing it with a password
             field left the grid with a stranded gap underneath. -->
        <div class="md:col-span-2">
          <label class="text-sm font-semibold text-gray-600">{{ t('auth.register.email') }}</label>
          <input
            v-model="form.email"
            @blur="validateEmail"
            type="email"
            autocomplete="email"
            class="mt-1.5 w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-primary"
            :placeholder="t('auth.register.yourEmail')"
          />
          <p v-if="errors.email" class="mt-1.5 text-sm text-red-500">{{ t(errors.email) }}</p>
        </div>

        <div>
          <label class="text-sm font-semibold text-gray-600">{{
            t('auth.register.password')
          }}</label>
          <PasswordField
            v-model="form.password"
            autocomplete="new-password"
            :placeholder="t('auth.register.enterPassword')"
            wrapper-class="mt-1.5"
            class="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-primary"
            @blur="validatePassword"
          />
          <p v-if="errors.password" class="mt-1.5 text-sm text-red-500">{{ t(errors.password) }}</p>
        </div>

        <div>
          <label class="text-sm font-semibold text-gray-600">{{
            t('auth.register.confirmPassword')
          }}</label>
          <PasswordField
            v-model="form.confirmPassword"
            autocomplete="new-password"
            :placeholder="t('auth.register.enterConfirmPassword')"
            wrapper-class="mt-1.5"
            class="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-primary"
            @blur="validateConfirmPassword"
          />
          <p v-if="errors.confirmPassword" class="mt-1.5 text-sm text-red-500">
            {{ t(errors.confirmPassword) }}
          </p>
        </div>

        <button
          class="md:col-span-2 mt-2 w-full bg-primary text-white py-3 rounded-xl font-semibold hover:bg-primary-hover active:scale-[0.99] transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          type="submit"
          :disabled="authStore.loading"
        >
          {{ authStore.loading ? t('auth.register.creating') : t('auth.register.createAccount') }}
        </button>
      </form>

      <div class="mt-6 flex items-center gap-3">
        <span class="h-px flex-1 bg-gray-200" />
        <span class="text-sm font-medium text-gray-400">{{ t('auth.login.or') }}</span>
        <span class="h-px flex-1 bg-gray-200" />
      </div>

      <div class="mt-4">
        <GoogleSignInButton />
      </div>

      <div class="flex justify-center gap-2 mt-6 text-sm text-gray-600">
        <span>{{ t('auth.register.haveAccount') }}</span>
        <RouterLink to="/auth/login" class="font-semibold text-primary hover:underline">
          {{ t('auth.register.login') }}
        </RouterLink>
      </div>
    </template>
  </div>
</template>
