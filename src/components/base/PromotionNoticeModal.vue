<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth.store'
import { usePromotionNotice } from '@/composables/usePromotionNotice'

/**
 * Congratulates a student on moving up a year, once.
 *
 * Shown only when the server reports `promoted_to_year` — which it does on
 * exactly one response, and never for a capped advance. A final-year student
 * is stamped as having received the rollover without moving, and telling them
 * they were promoted would send them looking for a year that does not exist.
 *
 * The reassurance line is the part that matters. Being moved up is when a
 * student fears their old coursework went with the old year, and it did not:
 * the feed matches every cohort they have passed through, not just the current
 * one. This is the one moment the app can say so.
 */
const emit = defineEmits<{ (e: 'dismiss'): void }>()

const { t } = useI18n({ useScope: 'global' })
const router = useRouter()
const auth = useAuthStore()
const { promotedToYear } = usePromotionNotice()

const acronym = computed(() => auth.user?.majors?.acronym ?? '')

function browse() {
  emit('dismiss')
  void router.push({ name: 'documents' })
}
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 px-4 py-6"
      role="dialog"
      aria-modal="true"
      :aria-label="t('auth.promoted.title', { year: promotedToYear, department: acronym })"
      @click.self="emit('dismiss')"
    >
      <div class="w-full max-w-sm rounded-3xl bg-white p-7 text-center shadow-2xl">
        <div
          class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"
          aria-hidden="true"
        >
          <svg
            class="h-7 w-7"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
            viewBox="0 0 24 24"
          >
            <path d="M5.8 11.3 2 22l10.7-3.79" />
            <path d="M4 3h.01" />
            <path d="M22 8h.01" />
            <path d="M15 2h.01" />
            <path d="M22 20h.01" />
            <path
              d="m22 2-2.24.75a2.9 2.9 0 0 0-1.96 3.12c.1.86-.57 1.63-1.45 1.63h-.38c-.86 0-1.6.6-1.76 1.44L14 10"
            />
            <path d="m22 13-.82-.33c-.86-.34-1.82.2-1.98 1.11c-.11.7-.72 1.22-1.43 1.22H17" />
            <path d="m11 2 .33.82c.34.86-.2 1.82-1.11 1.98C9.52 4.9 9 5.52 9 6.23V7" />
            <path
              d="M11 13c1.93 1.93 2.83 4.17 2 5-.83.83-3.07-.07-5-2-1.93-1.93-2.83-4.17-2-5 .83-.83 3.07.07 5 2Z"
            />
          </svg>
        </div>

        <h2 class="text-xl font-extrabold leading-snug text-gray-900">
          {{ t('auth.promoted.title', { year: promotedToYear, department: acronym }) }}
        </h2>

        <p class="mt-2 text-sm text-gray-500">
          {{ t('auth.promoted.body', { year: promotedToYear, department: acronym }) }}
        </p>

        <div class="mt-6 flex flex-col gap-2">
          <button
            type="button"
            class="h-11 rounded-full bg-primary text-sm font-bold text-white transition-colors hover:cursor-pointer hover:bg-primary-hover"
            @click="browse"
          >
            {{ t('auth.promoted.browse', { year: promotedToYear }) }}
          </button>
          <button
            type="button"
            class="h-11 rounded-full border border-gray-200 text-sm font-bold text-gray-500 transition-colors hover:cursor-pointer hover:bg-gray-50"
            @click="emit('dismiss')"
          >
            {{ t('auth.promoted.gotIt') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
