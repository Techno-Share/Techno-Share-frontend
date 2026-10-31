<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth.store'
import { useDocumentsStore } from '@/stores/documents.store'
import { useMajorsStore } from '@/stores/majors.store'
import { formatExpiry, formatFileSize, yearMajorLabel } from '@/utils/format'
import { useFilePreview } from '@/composables/useFilePreview'
import { useToast } from '@/composables/useToast'
import LoadingSpinner from '@/components/base/LoadingSpinner.vue'
import FileRow from '@/components/documents/FileRow.vue'
import FileCard from '@/components/documents/FileCard.vue'
import BackButton from '@/components/base/BackButton.vue'
import ViewToggle from '@/components/base/ViewToggle.vue'
import ConfirmDeleteModal from '@/components/base/ConfirmDeleteModal.vue'
import IconTextButton from '@/components/base/IconTextButton.vue'
import DocumentPreviewModal from '@/components/documents/DocumentPreviewModal.vue'
import AddFilesModal from '@/components/documents/AddFilesModal.vue'
import type { UploadFile } from '@/types/documents.types'
const { t } = useI18n({ useScope: 'global' })

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const docs = useDocumentsStore()
const majorsStore = useMajorsStore()
const { showToast } = useToast()

const viewMode = ref<'card' | 'list'>(
  (localStorage.getItem('fileViewMode') as 'card' | 'list') ?? 'list',
)
watch(viewMode, (v) => localStorage.setItem('fileViewMode', v))

const uploadId = computed(() => String(route.query.upload_id ?? ''))
const canLoad = computed(() => !!uploadId.value)

const upload = computed(() => docs.currentUpload)

/**
 * Hiding withdraws a file from circulation, and an upload still under review
 * was never in any. The file rows cannot work this out alone: they are written
 * 'active' even inside a pending upload, so each one looks publishable on its
 * own. The server refuses it too — see DocumentsService.setFileHidden.
 */
const uploadPublished = computed(() => upload.value?.status === 'active')

/**
 * The upload's own review state, shown beside its title.
 *
 * Same labels and tones DocumentCard uses, so one document reads identically in
 * a listing and on its own page — rather than "Under review" in grey there and
 * "Pending review" in amber here for the same thing.
 */
const uploadBadge = computed(() => {
  if (upload.value?.status === 'pending')
    return { label: t('dashboard.documents.statusPending'), tone: 'bg-gray-200 text-gray-600' }
  if (upload.value?.status === 'rejected')
    return { label: t('dashboard.documents.statusRejected'), tone: 'bg-red-100 text-red-700' }
  return null
})
const pageTitle = computed(() => upload.value?.title || 'Document Details')

const files = computed(() => upload.value?.documents ?? [])

/**
 * Who the upload reaches, as "I3-GIC, I4-GIM".
 *
 * An empty audience means the uploader targeted no particular cohort, which is
 * everyone — blank would be ambiguous between that and "not loaded yet". The
 * department list is fetched for the acronyms; without it the year alone is
 * still worth showing.
 */
const audienceLabel = computed(() => {
  const audience = upload.value?.audience ?? []
  if (!audience.length) return t('document.documentDetailsPage.audienceEveryone')
  return audience
    .map((entry) => {
      const acronym = majorsStore.majors.find((m) => m.id === entry.major_id)?.acronym
      return acronym
        ? yearMajorLabel(acronym, entry.year_level)
        : `${t('document.documentDetailsPage.year')} ${entry.year_level}`
    })
    .join(', ')
})

const expiryLabel = computed(() => {
  const at = upload.value?.expires_at
  if (!at) return t('document.documentDetailsPage.expiresNever')
  // Shared with the upload form and the review queue — expiry carries a time
  // now, and three renderings of one instant is how they drift apart.
  return formatExpiry(at) ?? t('document.documentDetailsPage.expiresNever')
})

// Served only to the uploader and admins — everyone else never sees these rows.
const pendingFiles = computed(() => files.value.filter((f) => f.status === 'pending'))
const rejectedFiles = computed(() => files.value.filter((f) => f.status === 'rejected'))

/**
 * The reasons behind the rejection, one line each.
 *
 * Rejecting an upload writes the same reason onto every one of its files, so
 * the ordinary case is a single line and repeating it per file would just be
 * the same sentence three times. Files can also be rejected individually, with
 * different reasons — only then does the file name need to come back, or the
 * lines are indistinguishable from each other.
 */
const rejectionReasons = computed(() => {
  const withReason = rejectedFiles.value.filter((f) => f.rejection_reason)
  const distinct = [...new Set(withReason.map((f) => f.rejection_reason as string))]

  if (distinct.length <= 1) return distinct.map((text) => ({ key: text, text }))
  return withReason.map((f) => ({
    key: f.id,
    text: `${f.original_name} — ${f.rejection_reason}`,
  }))
})
const hiddenFiles = computed(() => files.value.filter((f) => f.hidden_at))

/**
 * Hiding the last visible file hides the whole document, so the page has to
 * reload rather than patch one row — the upload's own state changed too.
 */
async function toggleHidden(file: UploadFile) {
  try {
    const result = await docs.setFileHiddenState(file.id, !file.hidden_at)
    await docs.fetchOne(uploadId.value)
    showToast(
      result.upload_hidden
        ? t('document.documentDetailsPage.uploadHiddenToo')
        : result.hidden
          ? t('document.documentDetailsPage.fileHidden')
          : t('document.documentDetailsPage.fileVisible'),
      { type: 'success' },
    )
  } catch (e: unknown) {
    const message = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
    showToast(message ?? t('document.documentDetailsPage.hideFailed'), { type: 'error' })
  }
}

const isOwner = computed(() => !!auth.user?.id && auth.user.id === upload.value?.users?.id)

// ── Add files (owner only) ──────────────────────────────────────────────────

// Mirrors the server's FilesInterceptor limits in documents.controller.ts —
// checked here only so an oversized pick fails instantly with a readable
// message instead of round-tripping into a multer error.
const MAX_FILES_PER_REQUEST = 10
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024

const showAddFiles = ref(false)
const adding = ref(false)
const addProgress = ref(0)

/**
 * Called by AddFilesModal with the files it collected. The guards below are a
 * second line of defence, not the user-facing ones — the modal refuses an
 * oversized or surplus file as it is picked, so these should never fire.
 */
async function uploadFiles(picked: File[]) {
  if (!picked.length || adding.value) return

  if (picked.length > MAX_FILES_PER_REQUEST) {
    showToast(t('document.documentDetailsPage.tooManyFiles', { max: MAX_FILES_PER_REQUEST }), {
      type: 'error',
    })
    return
  }

  const oversized = picked.find((f) => f.size > MAX_FILE_SIZE_BYTES)
  if (oversized) {
    showToast(
      t('document.documentDetailsPage.fileTooLarge', {
        name: oversized.name,
        size: formatFileSize(Math.round(oversized.size / 1024)),
        max: `${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB`,
      }),
      { type: 'error' },
    )
    return
  }

  adding.value = true
  addProgress.value = 0
  try {
    const result = await docs.addFiles(uploadId.value, picked, (percent) => {
      addProgress.value = percent
    })
    // The response carries only the new rows; refetch so the list, the file
    // count and the upload's own status all come from one source.
    await docs.fetchOne(uploadId.value)
    // Only on success: a failed batch keeps the modal open with the files still
    // listed, so it can be retried without picking them all again.
    showAddFiles.value = false
    // On an approved document the new files are hidden until a moderator clears
    // them — say so, or the owner wonders why nobody else can see them.
    showToast(
      result.needs_review
        ? t('document.documentDetailsPage.filesAddedPending', picked.length)
        : t('document.documentDetailsPage.filesAdded', picked.length),
      { type: 'success' },
    )
  } catch (e: unknown) {
    const message = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
    showToast(message ?? t('document.documentDetailsPage.addFailed'), { type: 'error' })
  } finally {
    adding.value = false
    addProgress.value = 0
  }
}

// ── Delete a file (owner only) ──────────────────────────────────────────────

const deleteTarget = ref<UploadFile | null>(null)
const deleting = ref(false)

/** The dialog names the file, so the owner can see which one is going. */
const deleteTargetName = computed(
  () => deleteTarget.value?.original_name?.trim() || upload.value?.title || '',
)

function askDelete(file: UploadFile) {
  deleteTarget.value = file
}

function cancelDelete() {
  if (!deleting.value) deleteTarget.value = null
}

async function confirmDelete() {
  const file = deleteTarget.value
  if (!file || deleting.value) return

  deleting.value = true
  try {
    const result = await docs.removeFile(file.id)
    deleteTarget.value = null

    // The last file takes the upload with it — this page now points at nothing.
    // Deep links (a notification opened in a new tab) have no history to go
    // back to, so fall through to the documents list rather than stranding the
    // user on a dead detail page.
    if (result.upload_deleted) {
      showToast(t('document.documentDetailsPage.uploadDeleted'), { type: 'success' })
      if (window.history.length > 1) router.back()
      else router.replace({ name: 'documents' })
      return
    }

    showToast(t('document.documentDetailsPage.fileDeleted'), { type: 'success' })
  } catch (e: unknown) {
    const message = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
    showToast(message ?? t('document.documentDetailsPage.deleteFailed'), { type: 'error' })
  } finally {
    deleting.value = false
  }
}

const { previewOpen, previewTarget, openPreview: previewFile, downloadFile } = useFilePreview()

onMounted(async () => {
  if (!canLoad.value) return
  // Departments are only needed to name the audience, so they load alongside
  // rather than gating the document itself.
  if (!majorsStore.majors.length) void majorsStore.fetchMajors()
  await docs.fetchOne(uploadId.value)
})

// Same-route navigation (e.g. clicking another doc notification) only changes
// the query param — refetch so the page reflects the new upload_id.
watch(uploadId, async (id) => {
  if (id) await docs.fetchOne(id)
})
</script>

<template>
  <div class="w-full px-6">
    <!-- Breadcrumb / Back — aligned with navbar logo. Hidden as a row, not
         just as a button: BackButton hides itself on a phone, but the wrapper
         kept its mb-6 and left 24px of empty space above the title. -->
    <div class="mx-auto hidden w-full max-w-7xl mb-6 cursor-pointer md:block md:px-6">
      <BackButton />
    </div>

    <!-- Rest of content -->
    <div class="mx-auto w-full max-w-6xl mb-9">
      <!-- Header -->
      <div class="mb-3">
        <!-- Title and the actions on one row, whatever the width: the actions
             used to be a sibling of the whole left column, so once the owner's
             Visible/Expires lines made that column full-width, flex-wrap pushed
             the toggle and the button onto a line of their own. -->
        <div class="flex items-center justify-between gap-4">
          <div>
            <!-- The badge belongs to the upload, so it sits on the upload's
                 name rather than being repeated on every file underneath. -->
            <div class="flex flex-wrap items-center gap-2">
              <h1 class="md:text-2xl text-xl font-bold text-gray-900 capitalize">
                {{ pageTitle }}
              </h1>
              <span
                v-if="uploadBadge"
                class="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium"
                :class="uploadBadge.tone"
                >{{ uploadBadge.label }}</span
              >
            </div>
            <p class="md:text-sm text-xs text-gray-400">
              {{ upload?.users?.first_name }} {{ upload?.users?.last_name }}
            </p>
          </div>

          <div class="flex shrink-0 items-center gap-3">
            <ViewToggle v-if="files.length" v-model="viewMode" />
            <!-- Attaching a file to a rejected upload is an edit, and the
                 server refuses it — see DocumentsService.addFiles. -->
            <IconTextButton
              v-if="isOwner && upload?.status !== 'rejected'"
              :text="
                adding
                  ? t('document.documentDetailsPage.adding', { percent: addProgress })
                  : t('document.documentDetailsPage.addFiles')
              "
              :disabled="adding"
              :class="adding ? 'opacity-70 cursor-not-allowed' : ''"
              @click="showAddFiles = true"
            >
              <template #icon>
                <svg
                  class="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  viewBox="0 0 24 24"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 5v14M5 12h14" />
                </svg>
              </template>
            </IconTextButton>
          </div>
        </div>

        <!-- Uploader only, and below the row rather than inside the title
             column. Who the document reaches and when it stops being visible
             are decisions its owner made and may want to check; to anyone else
             they are someone else's settings, and the audience would hint at
             cohorts the reader is not part of. -->
        <div
          v-if="isOwner"
          class="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-gray-500"
        >
          <p>
            <span class="font-semibold text-gray-600">
              {{ t('document.documentDetailsPage.visibleTo') }}:
            </span>
            {{ audienceLabel }}
          </p>
          <p>
            <span class="font-semibold text-gray-600">
              {{ t('document.documentDetailsPage.expires') }}:
            </span>
            {{ expiryLabel }}
          </p>
        </div>
      </div>

      <AddFilesModal
        v-if="isOwner && showAddFiles"
        :max-files="MAX_FILES_PER_REQUEST"
        :max-file-size-bytes="MAX_FILE_SIZE_BYTES"
        :loading="adding"
        :progress="addProgress"
        @close="showAddFiles = false"
        @confirm="uploadFiles"
      />

      <!-- Only the uploader and admins are served a non-active file, so these
           only ever show to someone who can act on them. The document itself
           stayed in the feed the whole time — just these files are hidden. -->
      <div
        v-if="pendingFiles.length"
        class="mb-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3"
      >
        <svg
          class="mt-0.5 h-5 w-5 shrink-0 text-amber-500"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M12 8v4m0 4h.01M12 3a9 9 0 100 18 9 9 0 000-18z"
          />
        </svg>
        <p class="text-sm text-amber-800">
          {{ t('document.documentDetailsPage.filesPendingReview', pendingFiles.length) }}
        </p>
      </div>

      <div
        v-if="hiddenFiles.length"
        class="mb-4 flex items-start gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3"
      >
        <svg
          class="mt-0.5 h-5 w-5 shrink-0 text-gray-400"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a9.97 9.97 0 011.563-3.029M3 3l18 18"
          />
        </svg>
        <p class="text-sm text-gray-700">
          {{ t('document.documentDetailsPage.filesHidden', hiddenFiles.length) }}
        </p>
      </div>

      <div
        v-if="rejectedFiles.length"
        class="mb-4 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3"
      >
        <svg
          class="mt-0.5 h-5 w-5 shrink-0 text-red-500"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M12 8v4m0 4h.01M12 3a9 9 0 100 18 9 9 0 000-18z"
          />
        </svg>
        <div class="text-sm text-red-800">
          <p>{{ t('document.documentDetailsPage.documentRejected') }}</p>
          <p v-for="reason in rejectionReasons" :key="reason.key" class="mt-1 break-words">
            <span class="font-medium">{{ t('document.documentDetailsPage.rejectionReason') }}</span>
            {{ reason.text }}
          </p>
        </div>
      </div>

      <!-- Upload progress: the button label shows the percentage, this shows it
           as a bar so a large file doesn't look stalled. -->
      <div v-if="adding" class="mb-6 h-1 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          class="h-full rounded-full bg-primary transition-[width] duration-200"
          :style="{ width: `${addProgress}%` }"
        />
      </div>

      <!-- Loading -->
      <div v-if="docs.loading" class="flex justify-center py-20">
        <LoadingSpinner />
      </div>

      <!-- Error states -->
      <div v-else-if="!canLoad" class="text-sm text-gray-500 py-8">
        {{ t('document.documentDetailsPage.missingId') }}
      </div>
      <div v-else-if="!files.length" class="text-sm text-gray-500 py-8">
        {{ t('document.documentDetailsPage.noFiles') }}
      </div>

      <!-- Files: list view is desktop-only; mobile always shows cards -->
      <template v-else>
        <!-- File table (list view — desktop only) -->
        <div
          v-if="viewMode === 'list'"
          class="hidden md:block rounded-2xl border border-gray-200 bg-white"
        >
          <!-- Table header -->
          <div
            class="hidden md:grid gap-3 items-center border-b border-gray-100 px-4 py-3 text-md font-medium text-black tracking-wide"
            :class="
              isOwner ? 'grid-cols-[1fr_140px_100px_88px]' : 'grid-cols-[1fr_140px_100px_48px]'
            "
          >
            <span>{{ t('document.documentDetailsPage.colName') }}</span>
            <span class="text-center">{{ t('document.documentDetailsPage.colPostDate') }}</span>
            <span class="text-center">{{ t('document.documentDetailsPage.colFileSize') }}</span>
            <span></span>
          </div>

          <!-- Rows scroll, the header does not: an upload with many files
               should not push the rest of the page out of reach, and the column
               names stay readable while you move through them.
               Height is six whole rows rather than a share of the viewport —
               a row is 64px (py-3 either side of a 40px thumbnail) plus its 1px
               divider, so the list ends on a complete row instead of slicing
               one through the middle. -->
          <div class="max-h-[390px] overflow-y-auto">
            <FileRow
              v-for="(file, idx) in files"
              :key="file.id"
              :file="file"
              :uploaded-at="upload?.uploaded_at"
              :fallback-name="upload?.title"
              :is-last="idx === files.length - 1"
              :can-delete="isOwner"
              :upload-published="uploadPublished"
              @preview="previewFile"
              @download="downloadFile"
              @delete="askDelete"
              @toggle-hidden="toggleHidden"
            />
          </div>
        </div>

        <!-- File grid (card view — always on mobile, desktop only in card mode) -->
        <div
          class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
          :class="{ 'md:hidden': viewMode === 'list' }"
        >
          <FileCard
            v-for="file in files"
            :key="file.id"
            :file="file"
            :fallback-name="upload?.title"
            :can-delete="isOwner"
            :upload-published="uploadPublished"
            @preview="previewFile"
            @download="downloadFile"
            @delete="askDelete"
            @toggle-hidden="toggleHidden"
          />
        </div>
      </template>
    </div>
    <!-- max-w-6xl -->

    <DocumentPreviewModal v-model="previewOpen" :file="previewTarget" @download="downloadFile" />

    <ConfirmDeleteModal
      v-if="deleteTarget"
      :target="deleteTargetName"
      :loading="deleting"
      @cancel="cancelDelete"
      @confirm="confirmDelete"
    />
  </div>
</template>
