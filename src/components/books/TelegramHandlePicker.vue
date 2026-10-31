<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import RingSpinner from '@/components/base/RingSpinner.vue'
import RowActionsMenu, { type RowAction } from '@/components/base/RowActionsMenu.vue'
import { useAuthStore } from '@/stores/auth.store'
import { TELEGRAM_PATTERN } from '@/utils/format'

/**
 * Choosing which Telegram account to hand over, and managing the saved set.
 *
 * Lifted out of AcceptRequestModal once a second screen needed it: the donor
 * can also change the handle after accepting, from the reserved card, because
 * the receiver reads `users.telegram` live rather than a copy taken at
 * acceptance. Two copies of this would be two places for the validation rule
 * and the five-account cap to drift apart.
 *
 * Accounts accumulate the way saved addresses do in a delivery app — every one
 * added stays on the list, and picking is a matter of which to hand over this
 * time. `telegram` on the profile is whichever is currently chosen;
 * `telegram_handles` is the set it is chosen from.
 *
 * Adds, edits and deletes are written to the profile immediately. The
 * SELECTION is not: it is handed up through `v-model` so the parent decides
 * when it counts — accepting a request, or pressing Save.
 */
const props = defineProps<{ modelValue: string; disabled?: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>()

const { t } = useI18n({ useScope: 'global' })
const auth = useAuthStore()

const handles = computed(() => auth.user?.telegram_handles ?? [])

/** Mirrors ArrayMaxSize in the backend's users/dto/update-user.dto.ts. */
const MAX_HANDLES = 5

/** Typing one; starts closed so a saved account is simply confirmed. */
const addingNew = ref(false)
/** The account being rewritten, or '' when adding a new one. */
const editingHandle = ref('')
const draft = ref('')
const error = ref('')
const saving = ref(false)
/** The account currently being deleted, so its own row shows the spinner. */
const removing = ref('')

/** The value that will be used: the one being typed, else the current pick. */
const chosen = computed(() => (addingNew.value ? draft.value.trim() : props.modelValue))

/** True while any write to the profile is in flight. */
const busy = computed(() => saving.value || Boolean(removing.value))

function selectHandle(handle: string) {
  emit('update:modelValue', handle)
  addingNew.value = false
  editingHandle.value = ''
  error.value = ''
}

function startNew() {
  addingNew.value = true
  editingHandle.value = ''
  draft.value = ''
  error.value = ''
}

/** Opens the input on an existing account, so a typo is a fix rather than a retype. */
function startEdit(handle: string) {
  addingNew.value = true
  editingHandle.value = handle
  draft.value = handle
  error.value = ''
}

/**
 * Behind the same three-dot menu the book, document and admin rows use — so
 * Edit and Delete look and sit where they do everywhere else, and the row is
 * not two naked icons.
 */
const telegramActions = computed<RowAction[]>(() => [
  { key: 'edit', label: t('dashboard.books.edit') },
  { key: 'delete', label: t('dashboard.books.delete'), tone: 'danger' },
])

function onHandleAction(key: string, handle: string) {
  if (key === 'edit') startEdit(handle)
  else if (key === 'delete') void removeHandle(handle)
}

/**
 * Saves the typed account: a new one joins the list, an edited one replaces
 * itself in place. Either way it becomes the pick, since it is what they just
 * went to the trouble of typing.
 */
async function saveDraft() {
  const handle = draft.value.trim()
  if (!handle) {
    error.value = t('dashboard.books.errorTelegramRequired')
    return
  }
  if (!TELEGRAM_PATTERN.test(handle)) {
    error.value = t('common.profilePage.errorTelegram')
    return
  }

  const next = editingHandle.value
    ? handles.value.map((h) => (h === editingHandle.value ? handle : h))
    : [...handles.value, handle]

  saving.value = true
  try {
    await auth.updateMe({ telegram: handle, telegram_handles: next })
    emit('update:modelValue', auth.user?.telegram ?? handle)
    error.value = ''
    addingNew.value = false
    editingHandle.value = ''
  } catch {
    error.value = auth.error ?? t('common.profilePage.errorTelegram')
  } finally {
    saving.value = false
  }
}

/**
 * Forgets one account.
 *
 * Only the list is sent: if the deleted one was the pick, the server falls back
 * to whatever is left, and the profile is read back rather than guessed.
 */
async function removeHandle(handle: string) {
  removing.value = handle
  error.value = ''
  try {
    await auth.updateMe({ telegram_handles: handles.value.filter((h) => h !== handle) })
    emit('update:modelValue', auth.user?.telegram ?? '')
    if (!handles.value.length) startNew()
  } catch {
    error.value = auth.error ?? t('common.profilePage.errorTelegram')
  } finally {
    removing.value = ''
  }
}

/** Lets a parent surface a validation failure of its own in the same place. */
function showError(message: string) {
  error.value = message
}
defineExpose({ chosen, busy, showError })
</script>

<template>
  <div>
    <p v-if="error" class="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">
      {{ error }}
    </p>

    <div class="flex flex-col gap-1.5">
      <!-- Saved accounts, one tap each. A div, not a button: the menu sits
           inside the row, and a button cannot contain another button. -->
      <div
        v-for="handle in handles"
        :key="handle"
        class="flex items-center gap-2 rounded-xl border px-3 py-1 text-sm transition"
        :class="
          props.modelValue === handle
            ? 'border-primary bg-primary/5 text-primary'
            : 'border-gray-200 text-gray-400'
        "
      >
        <button
          type="button"
          class="flex min-w-0 flex-1 items-center gap-2 text-left hover:cursor-pointer"
          @click="selectHandle(handle)"
        >
          <svg class="h-4 w-4 shrink-0" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"
            />
          </svg>
          <span class="truncate">{{ handle }}</span>
        </button>

        <!-- Spinner in the menu's place, so the row itself reports the delete
             rather than the confirm button at the bottom. -->
        <RingSpinner
          v-if="removing === handle"
          :size="16"
          :stroke="2"
          class="shrink-0 text-gray-400"
        />
        <RowActionsMenu
          v-else
          :items="telegramActions"
          :disabled="props.disabled || busy"
          @select="(key: string) => onHandleAction(key, handle)"
        />
      </div>

      <!-- With nothing saved this is the only control: no empty box until they
           ask for one. Hidden at the cap the server enforces. -->
      <button
        v-if="!addingNew && handles.length < MAX_HANDLES"
        type="button"
        class="flex items-center gap-2 rounded-xl border border-dashed border-gray-300 px-3 py-2 text-left text-sm text-gray-500 transition hover:cursor-pointer hover:border-gray-400"
        @click="startNew"
      >
        <svg
          class="h-4 w-4 shrink-0"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        {{
          handles.length
            ? t('dashboard.books.useAnotherTelegram')
            : t('dashboard.books.addTelegram')
        }}
      </button>

      <!-- Field and its Add on one row: the account is committed here, not left
           to the confirm button at the bottom of the modal. -->
      <div v-if="addingNew" class="flex items-center gap-2">
        <input
          v-model="draft"
          type="text"
          placeholder="@username"
          class="min-w-0 flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-primary"
          @keyup.enter="saveDraft"
        />
        <button
          type="button"
          class="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:cursor-pointer hover:bg-primary-hover disabled:opacity-60"
          :disabled="saving"
          @click="saveDraft"
        >
          <RingSpinner v-if="saving" :size="16" :stroke="3" />
          {{ editingHandle ? t('dashboard.books.telegramSave') : t('dashboard.books.telegramAdd') }}
        </button>
      </div>
    </div>
  </div>
</template>
