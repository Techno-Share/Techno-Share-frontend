import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as authApi from '@/services/auth.api'
import { accessToken, clearAccessToken, hadSession, setAccessToken } from '@/services/access-token'

interface User {
  id: string
  first_name: string
  last_name: string
  email: string
  avatar_url: string | null
  /** Telegram handle; shared with the other party only after acceptance. */
  telegram: string | null
  /** Every saved account; `telegram` is whichever one is currently in use. */
  telegram_handles: string[]
  major_id: string | null
  year_level: number | null
  role: string
  /**
   * Server-computed: this account moderates at least one department.
   *
   * A capability alongside the role, not a replacement for it — a moderator is
   * an ordinary user who also reviews submissions. Used to decide what to show;
   * never to decide what is allowed, which only the server does.
   */
  is_moderator?: boolean
  /** Server-computed: a Foundation year 2 student is due their July rollover. */
  needs_department_choice?: boolean
  /**
   * Server-computed: the year THIS request just moved the student up to.
   *
   * Non-null on exactly one response — the one that applied the rollover and
   * actually changed the year. Null afterwards, and null for the capped cases
   * (year 5, Foundation year 2), so a notice shown on it cannot repeat and
   * cannot announce a promotion that did not happen.
   */
  promoted_to_year?: number | null
  majors: { id: string; name: string; acronym: string }
}

/**
 * Pull the API's reason out of an axios error. The backend puts it in
 * `data.message`; anything else (network down, non-JSON) falls back.
 */
function apiMessage(e: unknown, fallback: string): string {
  return (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  // Memory, not localStorage. The module owns it so http.ts can replace it on
  // refresh without importing this store; see access-token.ts.
  const token = accessToken
  const loading = ref(false)
  const error = ref<string | null>(null)

  const isAuthenticated = computed(() => !!token.value)
  const fullName = computed(() =>
    user.value ? `${user.value.first_name} ${user.value.last_name}` : '',
  )

  /**
   * Create the account. Does NOT sign in.
   *
   * It used to store a token and fetch the profile, because the server sent
   * one back. It no longer does: an address that has only been typed is not an
   * address anyone has been shown to own, so the account exists but stays
   * unusable until the link in the inbox is opened. The caller shows a
   * "check your email" screen instead of navigating.
   */
  async function register(payload: {
    first_name: string
    last_name: string
    email: string
    password: string
  }): Promise<number> {
    loading.value = true
    error.value = null
    try {
      const data = await authApi.register(payload)
      // Seconds the code is good for, straight from the server, so the
      // countdown is not a constant the client has to keep in step.
      return (data.expires_in as number) ?? 0
    } catch (e: unknown) {
      error.value = apiMessage(e, 'Registration failed')
      throw e
    } finally {
      loading.value = false
    }
  }

  /**
   * The four link-driven flows.
   *
   * None of them touches session state: verifying and resetting both end at
   * the login screen on purpose. A reset that signed you in would make the
   * emailed link a login credential in its own right, which is a larger thing
   * to leave in an inbox than a one-time password change.
   */
  /**
   * Confirm the address AND start the session.
   *
   * The server hands back the same { user, token } login does, so this stores
   * them the same way — a freshly confirmed account lands in the app instead
   * of on a sign-in form asking for the password it was given a minute ago.
   */
  async function verifyEmail(email: string, code: string): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const data = await authApi.verifyEmail(email, code)
      setAccessToken(data.token)
      await fetchMe()
    } catch (e: unknown) {
      error.value = apiMessage(e, 'That code is not valid.')
      throw e
    } finally {
      loading.value = false
    }
  }

  async function resendVerification(
    email: string,
  ): Promise<{ message: string; expires_in: number }> {
    loading.value = true
    error.value = null
    try {
      const data = await authApi.resendVerification(email)
      return {
        message: data.message as string,
        expires_in: (data.expires_in as number) ?? 0,
      }
    } catch (e: unknown) {
      error.value = apiMessage(e, 'Could not send the email')
      throw e
    } finally {
      loading.value = false
    }
  }

  async function forgotPassword(email: string): Promise<{ message: string; expires_in: number }> {
    loading.value = true
    error.value = null
    try {
      const data = await authApi.forgotPassword(email)
      return {
        message: data.message as string,
        expires_in: (data.expires_in as number) ?? 0,
      }
    } catch (e: unknown) {
      error.value = apiMessage(e, 'Could not send the email')
      throw e
    } finally {
      loading.value = false
    }
  }

  /** Confirm a reset code before asking for the new password. */
  async function checkResetCode(email: string, code: string): Promise<void> {
    loading.value = true
    error.value = null
    try {
      await authApi.checkResetCode(email, code)
    } catch (e: unknown) {
      error.value = apiMessage(e, 'That code is not valid.')
      throw e
    } finally {
      loading.value = false
    }
  }

  async function resetPassword(email: string, code: string, password: string): Promise<string> {
    loading.value = true
    error.value = null
    try {
      const data = await authApi.resetPassword(email, code, password)
      return data.message as string
    } catch (e: unknown) {
      error.value = apiMessage(e, 'That code is not valid.')
      throw e
    } finally {
      loading.value = false
    }
  }

  /**
   * Turn the refresh cookie the Google callback set into a usable session.
   *
   * Used by the OAuth landing page: by the time the browser gets there the
   * server has already decided who they are, so there is nothing to send.
   */
  async function resumeSession() {
    loading.value = true
    error.value = null
    try {
      const data = await authApi.refresh()
      setAccessToken(data.token)
      await fetchMe()
    } catch (e: unknown) {
      error.value = apiMessage(e, 'Could not complete sign-in')
      throw e
    } finally {
      loading.value = false
    }
  }

  async function login(email: string, password: string) {
    loading.value = true
    error.value = null
    try {
      const data = await authApi.login(email, password)
      setAccessToken(data.token)
      await fetchMe()
    } catch (e: unknown) {
      error.value = apiMessage(e, 'Login failed')
      throw e
    } finally {
      loading.value = false
    }
  }

  async function fetchMe() {
    try {
      const data = await authApi.fetchMe()
      user.value = data
    } catch {
      logout()
    }
  }

  async function updateMe(payload: {
    first_name?: string
    last_name?: string
    major_id?: string
    year_level?: number
    telegram?: string
    telegram_handles?: string[]
    avatar_url?: string | null
  }) {
    loading.value = true
    error.value = null
    try {
      const data = await authApi.updateMe(payload)
      user.value = data
      return data
    } catch (e: unknown) {
      error.value = apiMessage(e, 'Failed to update profile')
      throw e
    } finally {
      loading.value = false
    }
  }

  async function uploadAvatar(file: File): Promise<string> {
    const formData = new FormData()
    formData.append('file', file)
    const data = await authApi.uploadAvatar(formData)
    return data.url as string
  }

  async function logout() {
    try {
      await authApi.logout()
    } catch {
      // ignore — clear client state regardless
    }
    user.value = null
    clearAccessToken()
  }

  /**
   * Restore the session on a cold page load.
   *
   * The access token lives in memory now, so a reload starts with nothing: the
   * refresh cookie is the only part of the session that survives, and this
   * trades it for a new token. The router awaits this before the first
   * navigation, which is what keeps `requiresAuth` from bouncing a signed-in
   * user to /login on every refresh.
   *
   * The promise is cached rather than the work repeated. The guard runs on
   * every navigation and a couple of views call init() as well; they must all
   * wait on the same refresh instead of starting their own, because the server
   * rotates the cookie on use and a second caller would be redeeming a token
   * the first one had already invalidated.
   */
  let restoring: Promise<void> | null = null

  function init(): Promise<void> {
    return (restoring ??= restore())
  }

  async function restore() {
    if (!token.value && hadSession()) {
      try {
        await resumeSession()
      } catch {
        // Expired, revoked, or signed out in another tab. An ordinary
        // signed-out visitor from here on — not a failure to report, and the
        // hint is dropped so the next load does not ask again.
        error.value = null
        clearAccessToken()
      }
    }
    if (token.value && !user.value) await fetchMe()
  }

  return {
    user,
    token,
    loading,
    error,
    isAuthenticated,
    fullName,
    register,
    verifyEmail,
    resendVerification,
    forgotPassword,
    checkResetCode,
    resetPassword,
    login,
    resumeSession,
    logout,
    fetchMe,
    updateMe,
    uploadAvatar,
    init,
  }
})
