<script setup lang="ts">
import { formatFileSize } from '@/utils/format'
import { computed, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { fileExtension, isImageFile } from '@/utils/format'
import FileTypeIcon from '@/components/base/FileTypeIcon.vue'
import RingSpinner from '@/components/base/RingSpinner.vue'

/**
 * Picks files to attach to a document that already exists.
 *
 * The button used to open the OS file dialog and upload whatever came back the
 * instant it closed — no list, no way to drop one, no way to change your mind.
 * The dialog is still how files are chosen; this holds them until the upload is
 * actually asked for.
 *
 * Collecting only: the upload itself stays with the parent, which already owns
 * the request, the progress and the refetch afterwards.
 */
const ACCEPT = '.pdf,.doc,.docx,.ppt,.pptx,.jpg,.jpeg,.png,.zip,.rar'
const ALLOWED_EXTENSIONS = ACCEPT.split(',').map((e) => e.replace('.', ''))

const props = withDefaults(
  defineProps<{
    /** Cap per request — mirrors MAX_FILES_PER_UPLOAD on the server. */
    maxFiles?: number
    maxFileSizeBytes?: number
    /** The parent's upload is in flight; the picker locks while it is. */
    loading?: boolean
    progress?: number
  }>(),
  { maxFiles: 10, maxFileSizeBytes: 50 * 1024 * 1024, loading: false, progress: 0 },
)

const emit = defineEmits<{ (e: 'close'): void; (e: 'confirm', files: File[]): void }>()

const { t } = useI18n({ useScope: 'global' })

/**
 * A picked file and, for an image, the object URL its tile previews. Object
 * URLs are revoked by hand — the browser holds the blob alive until they are,
 * so dropping the row is not enough.
 */
type PickedFile = { file: File; previewUrl?: string }

const files = ref<PickedFile[]>([])
const isDragActive = ref(false)
/** One message at a time, shown in place — a toast would sit behind the modal. */
const error = ref('')

const canSubmit = computed(() => files.value.length > 0 && !props.loading)

function release(item: PickedFile) {
  if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
}

onBeforeUnmount(() => files.value.forEach(release))

/**
 * Everything that can disqualify a file, checked as it is picked rather than on
 * submit: the row never appears, so there is nothing to explain later. The
 * parent re-checks count and size before uploading — cheap, and it guards the
 * request path even if this list is ever driven from somewhere else.
 */
function accept(incoming: File[]) {
  error.value = ''
  const seen = new Set(files.value.map((i) => `${i.file.name}:${i.file.size}`))

  for (const file of incoming) {
    if (!ALLOWED_EXTENSIONS.includes(fileExtension(file.name))) {
      error.value = t('document.addFilesModal.unsupported', { name: file.name })
      continue
    }
    if (file.size > props.maxFileSizeBytes) {
      error.value = t('document.documentDetailsPage.fileTooLarge', {
        name: file.name,
        size: formatFileSize(Math.round(file.size / 1024)),
        max: `${Math.round(props.maxFileSizeBytes / 1024 / 1024)} MB`,
      })
      continue
    }
    if (seen.has(`${file.name}:${file.size}`)) {
      error.value = t('document.addFilesModal.duplicate', { name: file.name })
      continue
    }
    if (files.value.length >= props.maxFiles) {
      error.value = t('document.documentDetailsPage.tooManyFiles', { max: props.maxFiles })
      break
    }
    seen.add(`${file.name}:${file.size}`)
    files.value.push({
      file,
      previewUrl: isImageFile(file.name) ? URL.createObjectURL(file) : undefined,
    })
  }
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  accept(Array.from(input.files ?? []))
  // Picking the same file twice in a row fires no change event unless cleared.
  input.value = ''
}

function onDrop(event: DragEvent) {
  event.preventDefault()
  isDragActive.value = false
  if (props.loading) return
  accept(Array.from(event.dataTransfer?.files ?? []))
}

function onDragOver(event: DragEvent) {
  event.preventDefault()
  if (!props.loading) isDragActive.value = true
}

function remove(index: number) {
  const [gone] = files.value.splice(index, 1)
  if (gone) release(gone)
  error.value = ''
}

/** Backdrop and ✕ are inert mid-upload: closing would orphan the request. */
function close() {
  if (!props.loading) emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 px-4 py-6"
      @click.self="close"
    >
      <div
        class="flex w-full max-w-lg flex-col rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-black/10"
      >
        <div class="mb-4 flex items-center justify-between gap-4">
          <h2 class="text-lg font-bold text-gray-900">{{ t('document.addFilesModal.title') }}</h2>
          <button
            type="button"
            class="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50 hover:cursor-pointer"
            :disabled="props.loading"
            :aria-label="t('document.addFilesModal.cancel')"
            @click="close"
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

        <!-- Empty: the same dashed dropzone as the upload form, wording and
             all, so picking a file looks the same wherever it is done. Once
             something is picked it gives way to the tile row below. -->
        <label
          v-if="!files.length"
          class="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-5 py-6 text-center transition"
          :class="[
            isDragActive
              ? 'border-primary bg-[#F3F8FF]'
              : 'border-[#D3D3D3] bg-[#FAFAFA] hover:border-primary hover:bg-[#F3F8FF]',
            props.loading ? 'pointer-events-none opacity-60' : 'cursor-pointer',
          ]"
          @dragover="onDragOver"
          @dragleave="isDragActive = false"
          @drop="onDrop"
        >
          <input
            type="file"
            class="hidden"
            :accept="ACCEPT"
            multiple
            :disabled="props.loading"
            @change="onFileChange"
          />
          <div
            class="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary"
          >
            <svg
              viewBox="0 0 24 24"
              class="h-6 w-6"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
            >
              <path
                d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <polyline points="14 2 14 8 20 8" stroke-linecap="round" stroke-linejoin="round" />
              <path
                d="M12 17v-5m-2.5 2.5L12 12l2.5 2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </div>
          <p class="text-sm text-gray-600">
            <span class="font-semibold text-primary">
              {{ t('document.documentUploadModal.clickHere') }}
            </span>
            {{ t('document.documentUploadModal.selectFile') }}
          </p>
          <p class="mt-1 text-xs text-gray-400">
            {{ t('document.documentUploadModal.fileTypes') }}
          </p>
        </label>

        <!-- Picked: one 64px square each — a thumbnail for images, the
             type-coloured tile otherwise — with the Add tile at the head. The
             row scrolls sideways so the tiles keep their size however many
             there are. -->
        <ul
          v-else
          class="mt-1 flex items-start gap-2.5 overflow-x-auto scrollbar-hide pb-2 pt-2"
          @dragover="onDragOver"
          @dragleave="isDragActive = false"
          @drop="onDrop"
        >
          <!-- Add more: same 64px square as a file tile. -->
          <li class="shrink-0">
            <label
              class="flex h-16 w-16 flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed text-center transition"
              :class="[
                isDragActive
                  ? 'border-primary bg-[#F3F8FF] text-primary'
                  : 'border-[#D3D3D3] text-gray-400 hover:border-primary hover:bg-[#F3F8FF] hover:text-primary',
                props.loading ? 'pointer-events-none opacity-60' : 'cursor-pointer',
              ]"
            >
              <input
                type="file"
                class="hidden"
                :accept="ACCEPT"
                multiple
                :disabled="props.loading"
                @change="onFileChange"
              />
              <svg
                class="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M12 16V4m-4 4l4-4 4 4M4 18v1a1 1 0 001 1h14a1 1 0 001-1v-1"
                />
              </svg>
              <span class="text-[11px] font-medium">
                {{ t('document.documentUploadModal.addMoreFiles') }}
              </span>
            </label>
          </li>

          <li
            v-for="(item, index) in files"
            :key="`${item.file.name}-${item.file.size}-${index}`"
            class="group relative shrink-0"
            :title="item.file.name"
          >
            <div class="relative h-16 w-16 overflow-hidden rounded-2xl border border-[#E5E7EB]">
              <img
                v-if="item.previewUrl"
                :src="item.previewUrl"
                :alt="item.file.name"
                class="h-full w-full object-cover"
              />
              <FileTypeIcon
                v-else
                :name="item.file.name"
                variant="soft"
                :size="64"
                rounded="rounded-2xl"
                with-label
              />
            </div>

            <!-- Remove — revealed on hover, and on keyboard focus so it stays
                 reachable without a pointer. -->
            <button
              type="button"
              class="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white text-primary opacity-0 shadow-sm transition hover:bg-white disabled:opacity-0 group-hover:opacity-100 focus:opacity-100 hover:cursor-pointer"
              :disabled="props.loading"
              :aria-label="t('document.addFilesModal.remove', { name: item.file.name })"
              @click="remove(index)"
            >
              <svg
                class="h-3 w-3"
                fill="none"
                stroke="currentColor"
                stroke-width="3"
                viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </li>
        </ul>

        <p v-if="error" class="mt-3 text-xs text-red-500">{{ error }}</p>

        <!-- Progress replaces the count while the request is in flight, so the
             one line under the list always says what is happening. -->
        <div v-if="props.loading" class="mt-4">
          <div class="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              class="h-full rounded-full bg-primary transition-[width] duration-200"
              :style="{ width: `${props.progress}%` }"
            />
          </div>
          <p class="mt-2 text-xs text-gray-500">
            {{ t('document.documentDetailsPage.adding', { percent: props.progress }) }}
          </p>
        </div>
        <p v-else-if="files.length" class="mt-4 text-xs text-gray-400">
          {{ t('document.addFilesModal.selected', files.length) }}
        </p>

        <div class="mt-5 flex justify-end gap-3">
          <button
            type="button"
            class="rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-600 transition hover:bg-gray-50 disabled:opacity-60 hover:cursor-pointer"
            :disabled="props.loading"
            @click="close"
          >
            {{ t('document.addFilesModal.cancel') }}
          </button>
          <button
            type="button"
            class="flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-hover disabled:opacity-60 hover:cursor-pointer"
            :disabled="!canSubmit"
            @click="
              emit(
                'confirm',
                files.map((i) => i.file),
              )
            "
          >
            <RingSpinner v-if="props.loading" :size="16" :stroke="3" />
            {{ t('document.addFilesModal.add') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
