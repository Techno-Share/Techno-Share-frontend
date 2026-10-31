<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import SelectDropdown from '@/components/base/SelectDropdown.vue'
import { ACADEMIC_NAME_PATTERN, languageLabelKey } from '@/utils/format'
import {
  readSubjectDraft,
  subjectDraftContext,
  writeSubjectDraft,
  clearSubjectDraft,
} from '@/composables/subjectDraft'

const { t } = useI18n({ useScope: 'global' })

type Option = {
  label: string
  value: string
}

const props = defineProps<{
  open: boolean
  yearLevel: number
  defaultDepartmentId: string
  departments: Option[]
  submitting?: boolean
  apiError?: string | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (
    e: 'submit',
    payload: {
      name: string
      major_id: string
      year_level: number
      semester: number
      image: File | null
    },
  ): void
}>()

const subjectName = ref('')
const departmentId = ref(props.defaultDepartmentId || '')
const academicYear = ref(String(props.yearLevel))
const semester = ref('1')
const subjectImage = ref<File | null>(null)
const imagePreview = ref<string | null>(null)
const isDragActive = ref(false)
const formError = ref('')
const nameError = ref('')
const nameTouched = ref(false)
const modalRef = ref<HTMLElement | null>(null)

const departmentOptions = computed(() => props.departments)

// DFL's year_level holds a language (English/French) rather than a year.
const yearDisplay = computed(() => {
  const acronym = departmentOptions.value.find((d) => d.value === departmentId.value)?.label
  const languageKey = languageLabelKey(acronym, academicYear.value)
  return languageKey
    ? t(languageKey)
    : `${t('common.subjectCreateModal.year')} ${academicYear.value}`
})
const semesterOptions = computed(() => [
  { label: `${t('common.subjectCreateModal.semesterLabel')} 1`, value: '1' },
  { label: `${t('common.subjectCreateModal.semesterLabel')} 2`, value: '2' },
])

// ── Draft ──────────────────────────────────────────────────────────────────
// Closing the modal — deliberately, with Esc, or by a stray click on the
// backdrop — keeps what was typed, for this page session only. A draft belongs
// to the page it was started on, since the department and year come from there.
const draftContext = computed(() => subjectDraftContext(props.defaultDepartmentId, props.yearLevel))

function saveDraft() {
  const isBlank = !subjectName.value.trim() && !subjectImage.value
  if (isBlank) {
    clearSubjectDraft(draftContext.value)
    return
  }
  writeSubjectDraft(draftContext.value, {
    name: subjectName.value,
    departmentId: departmentId.value,
    academicYear: academicYear.value,
    semester: semester.value,
    image: subjectImage.value,
  })
}

function restoreDraft() {
  const draft = readSubjectDraft(draftContext.value)
  if (!draft) return
  subjectName.value = draft.name
  departmentId.value = draft.departmentId
  academicYear.value = draft.academicYear
  semester.value = draft.semester
  // Rebuilds the preview URL rather than caching one that may be revoked.
  setSelectedFile(draft.image)
}

// Saved on every change rather than debounced: the draft is a handful of
// strings in memory, and a pending timer could otherwise be lost when the modal
// unmounts, or fire after a successful create had already retired the draft.
watch([subjectName, departmentId, academicYear, semester, subjectImage], () => {
  if (props.open) saveDraft()
})

function resetForm() {
  subjectName.value = ''
  departmentId.value = (props.defaultDepartmentId || departmentOptions.value[0]?.value) ?? ''
  academicYear.value = String(props.yearLevel)
  semester.value = '1'
  subjectImage.value = null
  formError.value = ''
  nameError.value = ''
  nameTouched.value = false
  if (imagePreview.value) {
    URL.revokeObjectURL(imagePreview.value)
  }
  imagePreview.value = null
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      resetForm()
      restoreDraft()
    }
  },
)

// Mounted already-open (the parent uses v-if), so the watcher above won't run.
restoreDraft()

watch(
  () => [props.defaultDepartmentId, props.yearLevel, props.departments],
  () => {
    if (!props.open) {
      return
    }

    departmentId.value = (props.defaultDepartmentId || departmentOptions.value[0]?.value) ?? ''
    academicYear.value = String(props.yearLevel)
  },
  { deep: true },
)

function closeModal() {
  emit('close')
}

function setSelectedFile(file: File | null) {
  if (imagePreview.value) {
    URL.revokeObjectURL(imagePreview.value)
  }

  if (!file || !file.type.startsWith('image/')) {
    subjectImage.value = null
    imagePreview.value = null
    return
  }

  subjectImage.value = file
  imagePreview.value = URL.createObjectURL(file)
}

function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]

  setSelectedFile(file ?? null)
}

function handleDragOver(event: DragEvent) {
  event.preventDefault()
  isDragActive.value = true
}

function handleDragLeave(event: DragEvent) {
  event.preventDefault()
  isDragActive.value = false
}

// Letters (any language, incl. combining marks for Khmer), numbers, spaces and
// hyphens — and at least one letter/number.

function validateSubjectName() {
  const name = subjectName.value.trim()

  if (!name) {
    nameError.value = t('common.subjectCreateModal.nameRequired')
    return false
  }

  if (name.length > 100) {
    nameError.value = t('common.subjectCreateModal.nameTooLong')
    return false
  }

  if (!ACADEMIC_NAME_PATTERN.test(name)) {
    nameError.value = t('common.subjectCreateModal.nameInvalid')
    return false
  }

  nameError.value = ''
  return true
}

function handleNameBlur() {
  nameTouched.value = true
  validateSubjectName()
}

function handleNameInput() {
  if (nameTouched.value) {
    validateSubjectName()
  }
}

function handleDrop(event: DragEvent) {
  event.preventDefault()
  isDragActive.value = false
  const file = event.dataTransfer?.files?.[0] ?? null
  setSelectedFile(file)
}

function handleSubmit() {
  formError.value = ''
  nameTouched.value = true

  if (!validateSubjectName()) {
    return
  }

  const name = subjectName.value.trim()

  if (!departmentId.value) {
    formError.value = 'Department is missing.'
    return
  }

  emit('submit', {
    name,
    major_id: departmentId.value,
    year_level: Number(academicYear.value),
    semester: Number(semester.value),
    image: subjectImage.value,
  })
}

onBeforeUnmount(() => {
  if (imagePreview.value) {
    URL.revokeObjectURL(imagePreview.value)
  }
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-6"
      @click.self="closeModal"
    >
      <div
        ref="modalRef"
        class="flex max-h-[80dvh] w-full max-w-sm flex-col sm:max-h-[90dvh] overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-black/10 md:max-w-md"
      >
        <div class="border-b border-black/5 px-5 py-4">
          <p class="text-center text-xl font-bold text-black">
            {{ t('common.subjectCreateModal.title') }}
          </p>
          <p class="mt-1 text-center text-sm text-gray-500">
            {{ t('common.subjectCreateModal.subtitle') }}
          </p>
        </div>

        <form
          class="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4"
          @submit.prevent="handleSubmit"
        >
          <div class="space-y-2">
            <label class="text-sm font-medium text-black"
              >{{ t('common.subjectCreateModal.nameLabel') }}
              <span class="text-red-500">*</span></label
            >
            <input
              v-model="subjectName"
              type="text"
              @blur="handleNameBlur"
              @input="handleNameInput"
              :placeholder="t('common.subjectCreateModal.nameLabel')"
              class="w-full rounded-xl border border-[#D9D9D9] bg-white px-4 py-2 text-sm outline-none transition sm:text-base focus:border-primary"
            />
            <p v-if="nameError" class="text-sm text-red-600">
              {{ nameError }}
            </p>
          </div>

          <p v-if="formError" class="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">
            {{ formError }}
          </p>

          <p v-if="props.apiError" class="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">
            {{ props.apiError }}
          </p>

          <div class="space-y-2">
            <label class="text-sm font-medium text-black"
              >{{ t('common.subjectCreateModal.departmentLabel') }}
              <span class="text-red-500">*</span></label
            >
            <select
              v-model="departmentId"
              disabled
              class="w-full appearance-none rounded-xl border border-[#D9D9D9] bg-[#F5F5F5] px-4 py-2 text-sm text-gray-600 outline-none sm:text-base"
            >
              <option disabled value="">Select department</option>
              <option
                v-for="department in departmentOptions"
                :key="department.value"
                :value="department.value"
              >
                {{ department.label }}
              </option>
            </select>
          </div>

          <div class="grid gap-3 md:grid-cols-2">
            <div class="space-y-2">
              <label class="text-sm font-medium text-black"
                >{{ t('common.subjectCreateModal.yearLabel') }}
                <span class="text-red-500">*</span></label
              >
              <select
                v-model="academicYear"
                disabled
                class="w-full appearance-none rounded-xl border border-[#D9D9D9] bg-[#F5F5F5] px-4 py-2 text-sm text-gray-600 outline-none sm:text-base"
              >
                <option :value="academicYear">
                  {{ yearDisplay }}
                </option>
              </select>
            </div>

            <div class="space-y-2">
              <label class="text-sm font-medium text-black"
                >{{ t('common.subjectCreateModal.semesterLabel') }}
                <span class="text-red-500">*</span></label
              >
              <SelectDropdown v-model="semester" :options="semesterOptions" />
            </div>
          </div>

          <div class="space-y-2">
            <label class="text-sm font-medium text-black">{{
              t('common.subjectCreateModal.imageLabel')
            }}</label>
            <label
              class="flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-5 py-4 text-center transition"
              :class="
                isDragActive
                  ? 'border-primary bg-[#F3F8FF]'
                  : 'border-[#D3D3D3] bg-[#FAFAFA] hover:border-primary hover:bg-[#F3F8FF]'
              "
              @dragover="handleDragOver"
              @dragleave="handleDragLeave"
              @drop="handleDrop"
            >
              <input type="file" accept="image/*" class="hidden" @change="handleFileChange" />
              <div v-if="imagePreview" class="mb-4 flex flex-col items-center gap-3">
                <img
                  :src="imagePreview"
                  alt="Selected subject image"
                  class="h-24 w-24 rounded-2xl object-cover shadow-sm"
                />
                <p class="text-sm text-gray-500">
                  {{ t('common.subjectCreateModal.dragAndDrop') }}
                </p>
              </div>

              <template v-else>
                <div
                  class="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-[#E8EEF8] text-[#8A8A8A]"
                >
                  <svg
                    viewBox="0 0 24 24"
                    class="h-7 w-7"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.7"
                  >
                    <path
                      d="M3 17l6-6 4 4 5-5 3 3"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                    <path
                      d="M5 21h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2Z"
                    />
                    <circle cx="9" cy="8" r="1.5" fill="currentColor" stroke="none" />
                  </svg>
                </div>
                <p class="text-sm font-medium text-gray-500">
                  {{ t('common.subjectCreateModal.dragAndDrop') }}
                </p>
              </template>
            </label>
          </div>

          <div class="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              :disabled="props.submitting"
              class="rounded-xl border border-[#D0D0D0] px-4 py-2.5 text-sm font-medium text-black transition hover:bg-[#F4F4F4] hover:cursor-pointer"
              @click="closeModal"
            >
              {{ t('common.subjectCreateModal.cancelButton') }}
            </button>
            <button
              type="submit"
              :disabled="props.submitting"
              class="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60 hover:cursor-pointer"
            >
              {{
                props.submitting
                  ? t('common.subjectCreateModal.creating')
                  : t('common.subjectCreateModal.createButton')
              }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>
