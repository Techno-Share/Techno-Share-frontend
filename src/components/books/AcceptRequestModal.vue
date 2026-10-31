<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import RingSpinner from '@/components/base/RingSpinner.vue'
import TelegramHandlePicker from '@/components/books/TelegramHandlePicker.vue'
import { useAuthStore } from '@/stores/auth.store'
import { TELEGRAM_PATTERN } from '@/utils/format'

/**
 * Confirms acceptance and settles which Telegram the receiver should contact.
 *
 * Asked here rather than in Profile: this is the only moment the handle is
 * actually needed, and it is the receiver's only way to reach the donor.
 *
 * The list itself is TelegramHandlePicker, shared with EditContactModal — the
 * donor can still change the handle after accepting, and both screens have to
 * agree on the rules.
 */
const props = defineProps<{ loading?: boolean }>()
const emit = defineEmits<{ (e: 'cancel'): void; (e: 'confirm'): void }>()

const { t } = useI18n({ useScope: 'global' })
const auth = useAuthStore()

/** Picked for this acceptance; written to the profile when it is confirmed. */
const selected = ref(auth.user?.telegram ?? '')
const picker = ref<InstanceType<typeof TelegramHandlePicker> | null>(null)
const saving = ref(false)

/** Disabled while the picker is writing, so two saves cannot overlap. */
const busy = computed(() => props.loading || saving.value || !!picker.value?.busy)

async function confirm() {
  // The picker's own value, so a handle typed but not yet added still counts.
  const handle = picker.value?.chosen ?? selected.value
  if (!handle) {
    picker.value?.showError(t('dashboard.books.errorTelegramRequired'))
    return
  }
  if (!TELEGRAM_PATTERN.test(handle)) {
    picker.value?.showError(t('common.profilePage.errorTelegram'))
    return
  }

  // Remember the pick, so the next acceptance is one tap. Sent without a list,
  // which lets the server add it if it is not saved yet — see updateMe.
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

  emit('confirm')
}
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 px-4 py-6"
      @click.self="!busy && emit('cancel')"
    >
      <div class="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-black/10">
        <h2 class="text-center text-lg font-bold text-gray-900">
          {{ t('dashboard.books.acceptTitle') }}
        </h2>

        <label class="mt-4 block text-sm font-semibold text-black">
          {{ t('common.profilePage.telegram') }} <span class="text-red-500">*</span>
        </label>

        <p class="mt-2 mb-1.5 text-xs text-gray-500">
          {{ t('dashboard.books.acceptTelegramHint') }}
        </p>

        <TelegramHandlePicker ref="picker" v-model="selected" :disabled="busy" />

        <div class="mt-5 grid grid-cols-2 gap-3">
          <button
            type="button"
            class="rounded-xl bg-gray-100 px-4 py-2.5 text-sm font-semibold text-black transition hover:cursor-pointer hover:bg-gray-200 disabled:opacity-60"
            :disabled="busy"
            @click="emit('cancel')"
          >
            {{ t('dashboard.books.cancel') }}
          </button>
          <button
            type="button"
            class="flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:cursor-pointer hover:bg-primary-hover disabled:opacity-60"
            :disabled="busy"
            @click="confirm"
          >
            <RingSpinner v-if="busy" :size="16" :stroke="3" />
            {{ t('dashboard.books.acceptConfirm') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
