<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatFileSize, formatRelativeDate } from '@/utils/format'
import FilePreviewThumb from '@/components/documents/FilePreviewThumb.vue'
import type { UploadFile } from '@/types/documents.types'
const props = defineProps<{
  file: UploadFile
  uploadedAt?: string | null
  fallbackName?: string | null
  isLast?: boolean
  /** Only the upload's owner gets the delete button. */
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

// Only the uploader and admins are ever served a non-active file.
const isPending = computed(() => props.file.status === 'pending')
const isRejected = computed(() => props.file.status === 'rejected')
const isHidden = computed(() => !!props.file.hidden_at)
/**
 * This file's own date, falling back to its upload's.
 *
 * The fallback is for rows written before files had a timestamp of their own —
 * every row showed the folder's date, so a file attached today to a folder
 * posted last week read as a week old.
 */
const postedAt = computed(() => props.file.created_at ?? props.uploadedAt ?? null)

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

/** Used by both the tooltip and the button's accessible name. */
const hideLabel = computed(() =>
  isHidden.value
    ? t('document.documentDetailsPage.unhide')
    : t('document.documentDetailsPage.hide'),
)
</script>

<template>
  <div
    class="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer sm:grid"
    :class="[
      !isLast ? 'border-b border-gray-100' : '',
      canDelete ? 'sm:grid-cols-[1fr_140px_100px_88px]' : 'sm:grid-cols-[1fr_140px_100px_48px]',
    ]"
    @click="emit('preview', file)"
  >
    <!-- Icon + name (first grid cell on desktop, flex item on mobile) -->
    <div class="flex items-center gap-3 min-w-0 flex-1 sm:flex-none">
      <FilePreviewThumb
        :name="file.original_name"
        :url="file.file_url"
        :preview-url="file.preview_url"
        :size="40"
      />
      <div class="min-w-0">
        <span class="flex items-center gap-2 min-w-0">
          <span class="truncate text-md font-medium text-gray-800">
            {{ file.original_name?.trim() || fallbackName || 'Untitled' }}
          </span>
          <span
            v-if="isPending && showReviewBadge"
            class="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700"
            >{{ t('document.documentDetailsPage.badgePending') }}</span
          >
          <span
            v-else-if="isHidden"
            class="shrink-0 rounded-full bg-gray-200 px-2 py-0.5 text-[11px] font-medium text-gray-600"
            >{{ t('document.documentDetailsPage.badgeHidden') }}</span
          >
          <span
            v-else-if="isRejected && showReviewBadge"
            class="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700"
            >{{ t('document.documentDetailsPage.badgeRejected') }}</span
          >
        </span>
        <!-- Mobile-only meta -->
        <span class="block sm:hidden text-xs text-gray-400 mt-0.5">
          {{ formatRelativeDate(postedAt) }} · {{ formatFileSize(file.file_size_kb ?? 0) }}
        </span>
      </div>
    </div>

    <!-- Date — desktop only -->
    <span class="hidden sm:block text-sm text-gray-500 text-center">{{
      formatRelativeDate(postedAt)
    }}</span>

    <!-- Size — desktop only -->
    <span class="hidden sm:block text-sm text-gray-500 text-center">{{
      formatFileSize(file.file_size_kb ?? 0)
    }}</span>

    <!-- Download + (owner only) delete -->
    <div class="shrink-0 flex items-center gap-1 sm:justify-center" @click.stop>
      <!-- Tooltips sit to the LEFT of the icon, not above it. These rows live
           in a `max-h-[390px] overflow-y-auto` list, which clips vertically —
           a tooltip above the button would be cut off on the first row. There
           is always empty row to the left, and it is never clipped there.

           The text is aria-hidden and duplicated as aria-label: a screen
           reader should hear the button's name once, not twice. -->
      <button
        class="group/tip relative w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-primary transition-colors hover:cursor-pointer"
        :aria-label="t('document.documentDetailsPage.download')"
        @click="emit('download', file)"
      >
        <span
          class="pointer-events-none absolute right-full top-1/2 z-10 mr-2 -translate-y-1/2 whitespace-nowrap rounded-lg bg-gray-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-sm transition-opacity group-hover/tip:opacity-100 group-focus-visible/tip:opacity-100"
          aria-hidden="true"
          >{{ t('document.documentDetailsPage.download') }}</span
        >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 4v11"
          />
        </svg>
      </button>
      <button
        v-if="canDelete && canHide"
        class="group/tip relative w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors hover:cursor-pointer"
        :aria-label="hideLabel"
        @click="emit('toggle-hidden', file)"
      >
        <span
          class="pointer-events-none absolute right-full top-1/2 z-10 mr-2 -translate-y-1/2 whitespace-nowrap rounded-lg bg-gray-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-sm transition-opacity group-hover/tip:opacity-100 group-focus-visible/tip:opacity-100"
          aria-hidden="true"
          >{{ hideLabel }}</span
        >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path
            v-if="isHidden"
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
          />
          <path
            v-else
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0zM2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"
          />
        </svg>
      </button>
      <button
        v-if="canDelete"
        class="group/tip relative w-8 h-8 flex items-center justify-center rounded-full hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors hover:cursor-pointer"
        :aria-label="t('document.documentDetailsPage.delete')"
        @click="emit('delete', file)"
      >
        <span
          class="pointer-events-none absolute right-full top-1/2 z-10 mr-2 -translate-y-1/2 whitespace-nowrap rounded-lg bg-gray-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-sm transition-opacity group-hover/tip:opacity-100 group-focus-visible/tip:opacity-100"
          aria-hidden="true"
          >{{ t('document.documentDetailsPage.delete') }}</span
        >
        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 640 640">
          <path
            d="M232.7 69.9L224 96L128 96C110.3 96 96 110.3 96 128C96 145.7 110.3 160 128 160L512 160C529.7 160 544 145.7 544 128C544 110.3 529.7 96 512 96L416 96L407.3 69.9C402.9 56.8 390.7 48 376.9 48L263.1 48C249.3 48 237.1 56.8 232.7 69.9zM512 208L128 208L149.1 531.1C150.7 556.4 171.7 576 197 576L443 576C468.3 576 489.3 556.4 490.9 531.1L512 208z"
          />
        </svg>
      </button>
    </div>
  </div>
</template>
