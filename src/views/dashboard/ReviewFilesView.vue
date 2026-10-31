<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import api from '@/services/http'
import { useFilePreview } from '@/composables/useFilePreview'
import LoadingSpinner from '@/components/base/LoadingSpinner.vue'
import FileCard from '@/components/documents/FileCard.vue'
import DocumentPreviewModal from '@/components/documents/DocumentPreviewModal.vue'
import type { UploadFile, UploadStatus } from '@/types/documents.types'

/**
 * Every file of one pending submission, as cards.
 *
 * The phone's destination for a review card: a card cannot show thumbnails for
 * a whole folder inline, so tapping one comes here instead of unfolding. Read
 * only — approve and reject stay on the queue, where the decision is about the
 * submission rather than any one file.
 */
const route = useRoute()
const groupId = route.params.groupId as string

/** One row per file, as GET /admin/documents/group/:id returns them. */
type GroupRow = {
  id: string
  file_url: string
  preview_url: string | null
  file_size_kb: number | null
  original_name: string | null
  file_status: UploadStatus
  title: string
  doc_type: string
  uploaded_at: string
  users: { first_name?: string; last_name?: string } | null
  majors: { acronym?: string } | null
  subjects: { name?: string; acronym?: string | null } | null
}

const rows = ref<GroupRow[]>([])
const loading = ref(true)
const failed = ref(false)

const first = computed(() => rows.value[0] ?? null)
const submitter = computed(() =>
  `${first.value?.users?.first_name ?? ''} ${first.value?.users?.last_name ?? ''}`.trim(),
)

/**
 * FileCard speaks UploadFile; the review endpoint returns the file's own state
 * as `file_status` (the row's `status` is the UPLOAD's). Map rather than widen
 * FileCard's props, so the card keeps one shape wherever it is used.
 */
const files = computed<UploadFile[]>(() =>
  rows.value.map((r) => ({
    id: r.id,
    file_url: r.file_url,
    preview_url: r.preview_url,
    file_size_kb: r.file_size_kb,
    original_name: r.original_name,
    status: r.file_status,
    rejection_reason: null,
    hidden_at: null,
  })),
)

const { previewOpen, previewTarget, openPreview, downloadFile } = useFilePreview()

onMounted(async () => {
  try {
    const { data } = await api.get<GroupRow[]>(`/admin/documents/group/${groupId}`)
    rows.value = data
  } catch {
    failed.value = true
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-3">
    <div v-if="loading" class="flex justify-center py-24"><LoadingSpinner /></div>

    <div
      v-else-if="failed || !first"
      class="rounded-2xl border border-gray-100 bg-white px-6 py-16 text-center"
    >
      <p class="text-sm font-medium text-gray-600">This submission could not be opened</p>
      <p class="mt-1 text-xs text-gray-400">It may have been reviewed already.</p>
    </div>

    <template v-else>
      <!-- What the files belong to, so the folder is identifiable without
           going back to the queue. -->
      <div class="rounded-2xl px-4">
        <h1 class="text-lg font-semibold leading-tight text-gray-900">{{ first.title }}</h1>
        <p class="mt-1 text-xs text-gray-500">
          {{ submitter }}
        </p>
      </div>

      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <!-- can-delete is false: a reviewer judges a submission, they do not
             manage its owner's files. -->
        <FileCard
          v-for="file in files"
          :key="file.id"
          :file="file"
          :fallback-name="first.title"
          :can-delete="false"
          @preview="openPreview"
          @download="downloadFile"
        />
      </div>
    </template>

    <DocumentPreviewModal v-model="previewOpen" :file="previewTarget" @download="downloadFile" />
  </div>
</template>
