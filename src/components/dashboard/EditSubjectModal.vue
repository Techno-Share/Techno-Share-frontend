<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import ConfirmChangesModal, { type FieldChange } from '@/components/base/ConfirmChangesModal.vue'
import RingSpinner from '@/components/base/RingSpinner.vue'

/**
 * Edits a subject's name, acronym and semester. Validation mirrors the API's
 * rules so the error arrives before the request does.
 */
const props = defineProps<{
  subject: {
    id: string
    name: string
    acronym?: string
    semester?: string | number
    subject_url?: string | null
  }
  saving?: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (
    e: 'save',
    payload: {
      name: string
      acronym: string
      semester: string
      /** A newly chosen file, uploaded in place of whatever the subject has. */
      image: File | null
      /** True when the existing cover was removed and none was chosen. */
      removeImage: boolean
    },
  ): void
}>()

// Name: letters/numbers/spaces/hyphens in any language. Acronym: no lowercase.
const NAME_PATTERN = /^(?=.*[\p{L}\p{N}])[\p{L}\p{M}\p{N}\s-]+$/u
const ACRONYM_PATTERN = /^(?!.*\p{Ll})[\p{L}\p{M}\p{N}]+$/u

const name = ref(props.subject.name)
const acronym = ref(props.subject.acronym ?? '')
const semester = ref(String(props.subject.semester ?? ''))
const errors = ref({ name: '', acronym: '' })

/**
 * The cover. `cover` is a newly picked file; `coverPreview` is whatever the
 * slot should show, which starts as the saved image and becomes an object URL
 * once a file is chosen. The two are separate because "no new file" and "no
 * cover at all" are different states — only the second one clears it.
 */
const cover = ref<File | null>(null)
const coverPreview = ref<string | null>(props.subject.subject_url ?? null)
/** Object URLs are revoked by hand; the browser will not collect them for us. */
let objectUrl: string | null = null

function releasePreview() {
  if (objectUrl) URL.revokeObjectURL(objectUrl)
  objectUrl = null
}

function pickCover(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] ?? null
  // Re-picking the same filename fires no change event unless the input is
  // reset, which makes "choose, remove, choose again" silently do nothing.
  input.value = ''
  if (!file) return
  releasePreview()
  cover.value = file
  objectUrl = URL.createObjectURL(file)
  coverPreview.value = objectUrl
}

function clearCover() {
  releasePreview()
  cover.value = null
  coverPreview.value = null
}

const canSubmit = computed(() => name.value.trim() && acronym.value.trim() && !props.saving)

function validate(): boolean {
  const trimmedName = name.value.trim()
  const trimmedAcronym = acronym.value.trim()

  errors.value.name = !trimmedName
    ? 'Please enter subject name'
    : trimmedName.length > 100
      ? 'You can only enter up to 100 characters'
      : !NAME_PATTERN.test(trimmedName)
        ? 'Subject name must not contain special characters'
        : ''

  errors.value.acronym = !trimmedAcronym
    ? 'Please enter an acronym'
    : trimmedAcronym.length > 10
      ? 'You can only enter up to 10 characters'
      : !ACRONYM_PATTERN.test(trimmedAcronym)
        ? 'Acronym can only contain letters and numbers, with no lowercase'
        : ''

  return !errors.value.name && !errors.value.acronym
}

/**
 * The edit is confirmed before it is saved, so an accidental change is caught
 * while it can still be undone. Nothing changed means nothing to confirm.
 *
 * This modal's labels are hardcoded English (it is admin-only), so the change
 * list matches them rather than inventing translated ones.
 */
const pendingChanges = ref<FieldChange[]>([])

function collectChanges(): FieldChange[] {
  const changes: FieldChange[] = []
  if (name.value.trim() !== props.subject.name)
    changes.push({ label: 'Subject name', from: props.subject.name, to: name.value.trim() })
  if (acronym.value.trim() !== (props.subject.acronym ?? ''))
    changes.push({
      label: 'Acronym',
      from: props.subject.acronym ?? '',
      to: acronym.value.trim(),
    })
  if (semester.value !== String(props.subject.semester ?? ''))
    changes.push({
      label: 'Semester',
      from: String(props.subject.semester ?? ''),
      to: semester.value,
    })
  // The image itself cannot be shown in a text diff, so it is named instead.
  const had = !!props.subject.subject_url
  if (cover.value)
    changes.push({ label: 'Cover', from: had ? 'Current image' : 'None', to: cover.value.name })
  else if (had && !coverPreview.value)
    changes.push({ label: 'Cover', from: 'Current image', to: 'None' })
  return changes
}

function submit() {
  if (!validate()) return
  const changes = collectChanges()
  if (changes.length) {
    pendingChanges.value = changes
    return
  }
  save()
}

function save() {
  pendingChanges.value = []
  emit('save', {
    name: name.value.trim(),
    acronym: acronym.value.trim(),
    semester: semester.value,
    image: cover.value,
    removeImage: !cover.value && !coverPreview.value && !!props.subject.subject_url,
  })
}

function onKeydown(event: KeyboardEvent) {
  if (props.saving) return
  if (event.key === 'Escape') emit('close')
  if (event.key === 'Enter') submit()
}
onMounted(() => document.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  releasePreview()
})

const INPUT_CLASS =
  'rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary'
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 px-4 py-6"
      @click.self="!saving && emit('close')"
    >
      <div
        class="flex max-h-[80dvh] w-full max-w-sm flex-col sm:max-h-[90dvh] overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-black/10 md:max-w-md"
      >
        <div class="relative border-b border-black/5 px-5 py-4">
          <p class="text-center text-xl font-bold text-black">Edit Subject</p>
          <button
            type="button"
            class="absolute right-4 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-gray-400 transition hover:bg-primary/10 hover:text-primary hover:cursor-pointer"
            aria-label="Close"
            :disabled="saving"
            @click="emit('close')"
          >
            <svg
              class="h-5 w-5"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div class="min-h-0 flex-1 space-y-4 overflow-y-auto scrollbar-hide px-5 py-4">
          <!-- Cover. The same slot the subjects table draws, so what is shown
               here is what the row will show — falling back to the acronym,
               which is exactly what that table does with no image. -->
          <div class="flex items-center gap-4">
            <div
              class="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-gray-200 bg-gray-50"
            >
              <img
                v-if="coverPreview"
                :src="coverPreview"
                alt=""
                class="h-full w-full object-cover"
              />
              <span v-else class="text-xs font-bold text-gray-300">{{ acronym || 'COVER' }}</span>
            </div>
            <div class="flex flex-col gap-1">
              <label
                class="cursor-pointer rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:border-primary hover:text-primary"
                :class="saving ? 'pointer-events-none opacity-60' : ''"
              >
                <input
                  type="file"
                  class="hidden"
                  accept="image/png,image/jpeg,image/webp"
                  :disabled="saving"
                  @change="pickCover"
                />
                {{ coverPreview ? 'Change cover' : 'Upload cover' }}
              </label>
              <button
                v-if="coverPreview"
                type="button"
                class="text-left text-xs text-gray-400 transition hover:text-red-500 hover:cursor-pointer disabled:opacity-60"
                :disabled="saving"
                @click="clearCover"
              >
                Remove
              </button>
              <p v-else class="text-[11px] text-gray-400">PNG, JPEG or WebP</p>
            </div>
          </div>

          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium text-gray-600">Name</label>
            <input v-model="name" :class="INPUT_CLASS" @blur="validate" />
            <p v-if="errors.name" class="text-xs text-red-600">{{ errors.name }}</p>
          </div>

          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium text-gray-600">Acronym</label>
            <input v-model="acronym" :class="INPUT_CLASS" @blur="validate" />
            <p v-if="errors.acronym" class="text-xs text-red-600">{{ errors.acronym }}</p>
          </div>

          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium text-gray-600">Semester</label>
            <select v-model="semester" :class="[INPUT_CLASS, 'hover:cursor-pointer']">
              <option value="">—</option>
              <option value="1">Semester 1</option>
              <option value="2">Semester 2</option>
            </select>
          </div>
        </div>

        <div class="flex items-center justify-end gap-2 border-t border-black/5 px-5 py-4">
          <button
            type="button"
            class="rounded-xl bg-gray-100 px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-gray-200 hover:cursor-pointer disabled:opacity-60"
            :disabled="saving"
            @click="emit('close')"
          >
            Cancel
          </button>
          <button
            type="button"
            class="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-hover hover:cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
            :disabled="!canSubmit"
            @click="submit"
          >
            <RingSpinner v-if="saving" :size="16" :stroke="2.5" />
            Save
          </button>
        </div>
      </div>
    </div>
  </Teleport>

  <ConfirmChangesModal
    v-if="pendingChanges.length"
    :changes="pendingChanges"
    :loading="props.saving"
    @cancel="pendingChanges = []"
    @confirm="save"
  />
</template>
