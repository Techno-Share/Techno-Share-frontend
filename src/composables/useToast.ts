import { ref } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import type { Notification } from '@/stores/notifications.store'

/**
 * Transient messages that slide in at the top-right and dismiss themselves.
 *
 * The queue is module-level, so anything — a modal that's about to unmount, a
 * store, a view — can push one and the message still shows: ToastHost renders
 * the list once, at the root of the app.
 */
export type ToastType = 'success' | 'error' | 'info'

export type Toast = {
  id: number
  type: ToastType
  title?: string
  message: string
  /** Where clicking the toast leads. Absent means it is not clickable. */
  to?: RouteLocationRaw
  /** The notification it came from, so opening it also marks it read. */
  notifId?: string
  /**
   * The notification itself, when there is one — the toast then shows the same
   * marker the bell does: the book's cover, or the icon standing in for it.
   * Absent on toasts raised by the app ("Saved", "Upload failed"), which keep
   * the plain success/error glyphs.
   */
  notification?: Notification
  /**
   * How long this toast will live, in ms. 0 means it stays until something
   * dismisses it.
   *
   * Resolved here rather than recomputed by the view: the countdown bar has to
   * run for exactly as long as the timer that removes the toast, and two
   * places deriving the same number is how they drift apart.
   */
  duration: number
}

/**
 * How long a toast stays up, scaled to how much there is to read.
 *
 *   min(max(characters × 50, 2000), 7000)
 *
 * 50 ms per character is a deliberately unhurried pace: a toast is caught in
 * peripheral vision mid-task, not read the way a paragraph is. The floor keeps
 * a one-word message ("Saved") on screen long enough to register at all; the
 * ceiling stops a long error from parking itself over the interface.
 *
 * Counts the title as well as the message — both are rendered, so both have to
 * be read.
 */
const MS_PER_CHARACTER = 50
const MIN_DURATION_MS = 2_000
const MAX_DURATION_MS = 7_000

export function toastDuration(text: string): number {
  return Math.min(Math.max(text.length * MS_PER_CHARACTER, MIN_DURATION_MS), MAX_DURATION_MS)
}

const toasts = ref<Toast[]>([])
let nextId = 1

function dismissToast(id: number) {
  toasts.value = toasts.value.filter((toast) => toast.id !== id)
}

function showToast(
  message: string,
  options: {
    type?: ToastType
    title?: string
    duration?: number
    to?: RouteLocationRaw
    notifId?: string
    notification?: Notification
  } = {},
) {
  const { type = 'success', title, duration, to, notifId, notification } = options
  const id = nextId++

  // `??` rather than a default parameter, so an explicit `duration: 0` still
  // means "keep it up until something dismisses it" instead of falling through
  // to the computed value.
  const timeout = duration ?? toastDuration(`${title ?? ''}${message}`)

  toasts.value.push({
    id,
    type,
    title,
    message,
    to,
    notifId,
    notification,
    duration: timeout,
  })

  if (timeout > 0) setTimeout(() => dismissToast(id), timeout)
  return id
}

export function useToast() {
  return { toasts, showToast, dismissToast }
}
