<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { getFileIcon, formatFileSize, fileExtension } from '@/utils/format'
import FilePreviewThumb from '@/components/documents/FilePreviewThumb.vue'
import type { UploadFile } from '@/types/documents.types'
const props = defineProps<{
  file: UploadFile
  fallbackName?: string | null
  /** Only the upload's owner gets the Delete item. */
  canDelete?: boolean
  /**
   * Whether the upload itself is published. Drives two things: a file in an
   * unpublished upload cannot be hidden, and it does not repeat the upload's
   * review state — the page title carries that once.
   */
  uploadPublished?: boolean
}>()

const emit = defineEmits<{
  preview: [file: UploadFile]
  download: [file: UploadFile]
  delete: [file: UploadFile]
  'toggle-hidden': [file: UploadFile]
}>()

const { t } = useI18n({ useScope: 'global' })

const icon = computed(() => getFileIcon(props.file.original_name))
const typeLabel = computed(
  () => fileExtension(props.file.original_name).toUpperCase() || icon.value.label,
)
const displayName = computed(
  () => props.file.original_name?.trim() || props.fallbackName || 'Untitled',
)

// Only the uploader and admins are ever served a non-active file.
const isPending = computed(() => props.file.status === 'pending')
const isRejected = computed(() => props.file.status === 'rejected')
const isHidden = computed(() => !!props.file.hidden_at)

/**
 * Hiding withdraws a file from circulation, which only published files are in.
 *
 * The upload's status is half the answer and this component cannot see it — a
 * file row inside a pending upload is itself written 'active', so the file
 * alone always looks publishable. The parent, which holds the upload, passes
 * the verdict down. The server enforces the same rule either way; see
 * DocumentsService.setFileHidden.
 */
const published = computed(() => props.uploadPublished !== false)
const canHide = computed(() => published.value && !isPending.value && !isRejected.value)

/**
 * Whether this row says anything about review.
 *
 * When the upload itself is pending or rejected so is every file in it, and
 * stamping each row with the same badge the title already carries just repeats
 * it. A file's own badge only earns its place when it DISAGREES with the
 * upload — one file rejected inside an otherwise published upload, which is
 * the only signal that case has.
 */
const showReviewBadge = computed(() => published.value)

const menuOpen = ref(false)

function onPreview() {
  menuOpen.value = false
  emit('preview', props.file)
}
function onDownload() {
  menuOpen.value = false
  emit('download', props.file)
}
function onDelete() {
  menuOpen.value = false
  emit('delete', props.file)
}
function onToggleHidden() {
  menuOpen.value = false
  emit('toggle-hidden', props.file)
}
</script>

<template>
  <div
    class="flex flex-col mx-auto w-full max-w-78 sm:max-w-none rounded-2xl border border-gray-200 bg-white p-3 hover:border-primary hover:shadow-sm transition-all"
  >
    <!-- Thumbnail: real image preview, else file-type placeholder -->
    <div
      class="relative aspect-4/3 w-full overflow-hidden rounded-xl border border-gray-100 bg-gray-50 cursor-pointer"
      :class="(isPending || isRejected || isHidden) && 'opacity-60'"
      @click="emit('preview', file)"
    >
      <FilePreviewThumb
        fill
        :name="file.original_name"
        :url="file.file_url"
        :preview-url="file.preview_url"
        :size="64"
        rounded="rounded-xl"
      />
    </div>

    <!-- Title + overflow menu -->
    <div class="mt-3 flex items-start justify-between gap-2">
      <div class="min-w-0">
        <p class="truncate text-sm font-semibold text-gray-900" :title="displayName">
          {{ displayName }}
        </p>
        <p class="mt-0.5 text-xs text-gray-400">
          {{ formatFileSize(file.file_size_kb ?? 0) }} · {{ typeLabel }}
        </p>
        <span
          v-if="isPending && showReviewBadge"
          class="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700"
          >{{ t('document.documentDetailsPage.badgePending') }}</span
        >
        <span
          v-else-if="isHidden"
          class="mt-1 inline-block rounded-full bg-gray-200 px-2 py-0.5 text-[11px] font-medium text-gray-600"
          >{{ t('document.documentDetailsPage.badgeHidden') }}</span
        >
        <span
          v-else-if="isRejected && showReviewBadge"
          class="mt-1 inline-block rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700"
          >{{ t('document.documentDetailsPage.badgeRejected') }}</span
        >
      </div>

      <div class="relative shrink-0">
        <button
          class="flex h-7 w-7 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors hover:cursor-pointer"
          :aria-label="displayName"
          @click.stop="menuOpen = !menuOpen"
        >
          <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
            <path
              d="M12 6a2 2 0 100-4 2 2 0 000 4zm0 8a2 2 0 100-4 2 2 0 000 4zm0 8a2 2 0 100-4 2 2 0 000 4z"
            />
          </svg>
        </button>

        <template v-if="menuOpen">
          <!-- click-away backdrop -->
          <div class="fixed inset-0 z-10" @click.stop="menuOpen = false" />
          <div
            class="absolute right-0 top-full z-20 mt-1 w-40 overflow-hidden rounded-xl border border-gray-100 bg-white py-1 shadow-xl"
          >
            <button
              class="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors hover:cursor-pointer"
              @click.stop="onPreview"
            >
              {{ t('document.documentDetailsPage.preview') }}
            </button>
            <button
              class="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors hover:cursor-pointer"
              @click.stop="onDownload"
            >
              {{ t('document.documentDetailsPage.download') }}
            </button>
            <button
              v-if="canDelete && canHide"
              class="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors hover:cursor-pointer"
              @click.stop="onToggleHidden"
            >
              {{
                isHidden
                  ? t('document.documentDetailsPage.unhide')
                  : t('document.documentDetailsPage.hide')
              }}
            </button>
            <button
              v-if="canDelete"
              class="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 transition-colors hover:cursor-pointer"
              @click.stop="onDelete"
            >
              {{ t('document.documentDetailsPage.delete') }}
            </button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
