<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import RingSpinner from '@/components/base/RingSpinner.vue'
import TelegramHandlePicker from '@/components/books/TelegramHandlePicker.vue'
import { useAuthStore } from '@/stores/auth.store'
import { TELEGRAM_PATTERN } from '@/utils/format'

/**
 * Changes which Telegram the receiver of a reserved book should contact.
 *
 * Worth having separately from Profile because this is where the question
 * occurs: the card says someone will contact you on Telegram, and the obvious
 * next thought is whether the right account is on there. A donor who mistyped
 * their handle when accepting would otherwise have no way to correct it from
 * the screen that raised the doubt.
 *
 * Editing here genuinely reaches the receiver: the contact they are shown is
 * read from `users.telegram` on each request rather than copied onto the
 * reservation when it was accepted, so a correction takes effect immediately.
 */
const emit = defineEmits<{ (e: 'close'): void }>()

const { t } = useI18n({ useScope: 'global' })
const auth = useAuthStore()

const selected = ref(auth.user?.telegram ?? '')
const picker = ref<InstanceType<typeof TelegramHandlePicker> | null>(null)
const saving = ref(false)

const busy = computed(() => saving.value || !!picker.value?.busy)

/**
 * Saves the pick and closes.
 *
 * Adding and editing accounts already wrote themselves to the profile; what is
 * left is which of them is the one handed over.
 */
async function save() {
  const handle = picker.value?.chosen ?? selected.value
  if (!handle) {
    picker.value?.showError(t('dashboard.books.errorTelegramRequired'))
    return
  }
  if (!TELEGRAM_PATTERN.test(handle)) {
    picker.value?.showError(t('common.profilePage.errorTelegram'))
    return
  }

  if (handle !== auth.user?.telegram) {
    saving.value = true
    try {
      await auth.updateMe({ telegram: handle })
    } catch {
      picker.value?.showError(auth.error ?? t('common.profilePage.errorTelegram'))
      return
    } finally {
      saving.value = false
    }
  }

  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 px-4 py-6"
      @click.self="!busy && emit('close')"
    >
      <div class="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-black/10">
        <h2 class="text-center text-lg font-bold text-gray-900">
          {{ t('dashboard.books.editContactTitle') }}
        </h2>

        <p class="mt-2 mb-3 text-center text-xs leading-relaxed text-gray-500">
          {{ t('dashboard.books.editContactHint') }}
        </p>

        <TelegramHandlePicker ref="picker" v-model="selected" :disabled="busy" />

        <div class="mt-5 grid grid-cols-2 gap-3">
          <button
            type="button"
            class="rounded-xl bg-gray-100 px-4 py-2.5 text-sm font-semibold text-black transition hover:cursor-pointer hover:bg-gray-200 disabled:opacity-60"
            :disabled="busy"
            @click="emit('close')"
          >
            {{ t('dashboard.books.cancel') }}
          </button>
          <button
            type="button"
            class="flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:cursor-pointer hover:bg-primary-hover disabled:opacity-60"
            :disabled="busy"
            @click="save"
          >
            <RingSpinner v-if="busy" :size="16" :stroke="3" />
            {{ t('dashboard.books.telegramSave') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
