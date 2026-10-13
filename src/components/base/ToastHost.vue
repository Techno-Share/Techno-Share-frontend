<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useToast, type Toast } from '@/composables/useToast'
import NotificationAvatar from '@/components/notifications/NotificationAvatar.vue'
import { useNotificationsStore } from '@/stores/notifications.store'

/**
 * Renders the toast queue in the top-right corner. Mounted once, at the app
 * root, so a toast survives the component that raised it being unmounted —
 * which is the usual case: the upload modal closes as it reports success.
 */
const { toasts, dismissToast } = useToast()
const router = useRouter()
const notifStore = useNotificationsStore()

/**
 * A toast raised by a notification carries the same destination its bell item
 * would go to, so acting on either behaves identically — including marking it
 * read, which is what stops the bell still showing it as new afterwards.
 */
async function openToast(toast: Toast) {
  if (!toast.to) return
  dismissToast(toast.id)
  if (toast.notifId) await notifStore.markRead(toast.notifId)
  await router.push(toast.to)
}
</script>

<template>
  <Teleport to="body">
    <!-- pointer-events-none on the column, auto on each card: the strip mustn't
         block clicks on the page behind it. -->
    <div
      class="pointer-events-none fixed right-4 top-20 z-[80] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2"
    >
      <TransitionGroup
        enter-active-class="transition duration-300 ease-out"
        enter-from-class="translate-x-full opacity-0"
        enter-to-class="translate-x-0 opacity-100"
        leave-active-class="transition duration-200 ease-in absolute"
        leave-from-class="translate-x-0 opacity-100"
        leave-to-class="translate-x-full opacity-0"
        move-class="transition duration-200"
      >
        <div
          v-for="toast in toasts"
          :key="toast.id"
          :class="[
            'pointer-events-auto relative flex w-full items-start gap-3 overflow-hidden rounded-2xl border-l-4 border-primary bg-white p-3 shadow-lg ring-1 ring-black/5',
            // Only the ones with somewhere to go invite a click.
            toast.to ? 'cursor-pointer transition hover:bg-gray-50' : '',
          ]"
          @click="openToast(toast)"
        >
          <!-- A notification shows the same marker the bell gives it — the
               book's own cover where there is one. Everything else keeps the
               plain glyph: "Saved" is not about a book. -->
          <NotificationAvatar
            v-if="toast.notification"
            :notification="toast.notification"
            size="sm"
          />
          <!-- One tile, one colour. The type still decides how long a toast
               lives and where it links, but it no longer changes how it looks:
               an error reads as an error from its words. -->
          <div
            v-else
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
          >
            <!-- One bell for every app-raised toast. The tick and the cross
                 said the same thing the wording already says ("Saved",
                 "Upload failed") while looking like two different kinds of
                 object. -->
            <svg
              class="h-5 w-5"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
              />
            </svg>
          </div>

          <div class="min-w-0 flex-1">
            <p v-if="toast.title" class="text-sm font-semibold text-black">{{ toast.title }}</p>
            <p class="text-sm text-gray-600" :class="toast.title ? 'mt-0.5' : ''">
              {{ toast.message }}
            </p>
          </div>

          <button
            type="button"
            class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 hover:cursor-pointer"
            aria-label="Dismiss"
            @click.stop="dismissToast(toast.id)"
          >
            <svg
              class="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <!-- How long is left, as a bar that empties along the bottom edge.
               A toast dismisses itself and otherwise gives no warning; this
               makes the deadline visible, so a message that is about to go can
               be read or clicked rather than missed.

               Skipped entirely when duration is 0 — that toast waits for a
               dismissal, and a bar that never moves would promise a countdown
               that is not running. -->
          <div
            v-if="toast.duration > 0"
            class="toast-countdown absolute inset-x-0 bottom-0 h-1 origin-left bg-primary/40"
            :style="{ animationDuration: `${toast.duration}ms` }"
            aria-hidden="true"
          />
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
/*
 * scaleX rather than width: the bar runs for seconds on a corner of the screen
 * while the page is being used, and a width animation lays out every frame of
 * it. A transform is handed to the compositor and costs nothing.
 */
@keyframes toast-countdown {
  from {
    transform: scaleX(1);
  }
  to {
    transform: scaleX(0);
  }
}

.toast-countdown {
  animation: toast-countdown linear forwards;
  /* Duration comes from the element's own style, set from the toast. */
}

/*
 * Hidden rather than frozen when motion is reduced: left full-width it would
 * read as a progress bar stuck at 100%, which says something untrue about the
 * toast rather than simply saying less.
 */
@media (prefers-reduced-motion: reduce) {
  .toast-countdown {
    display: none;
  }
}
</style>
