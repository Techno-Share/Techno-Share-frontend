<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/services/http'
import { useToast } from '@/composables/useToast'
import { apiErrorMessage } from '@/utils/api-error'
import { useAuthStore } from '@/stores/auth.store'
import LoadingSpinner from '@/components/base/LoadingSpinner.vue'

const route = useRoute()
const router = useRouter()
const { showToast } = useToast()
const groupId = route.params.groupId as string

/**
 * This page is open to any reviewer, so "back" cannot always mean the admin
 * dashboard — a moderator sent there lands on a screen their own guard refuses.
 * Each goes back to the queue they came from.
 */
const auth = useAuthStore()
const isAdmin = computed(() => auth.user?.role?.toLowerCase() === 'admin')
const backLabel = computed(() => (isAdmin.value ? 'Back to Approvals' : 'Back to Review'))
function goBack() {
  if (isAdmin.value) void router.push({ name: 'admin', query: { tab: 'approvals' } })
  else void router.push({ name: 'dashboard-review-documents' })
}

type Doc = {
  id: string
  group_id: string
  title: string
  doc_type: string
  file_size_kb: number
  file_url: string | null
  original_name: string | null
  /** The UPLOAD's status — the same on every row of a group. */
  status: string
  /** This FILE's own status. Only meaningful when review_scope is 'file'. */
  file_status: string
  /**
   * 'group' for a pending upload reviewed as a whole; 'file' for files added to
   * an upload that was already approved, which are reviewed one at a time.
   */
  review_scope: 'group' | 'file'
  uploaded_at: string
  users: { id: string; first_name: string; last_name: string } | null
  majors: { id: string; acronym: string } | null
  subjects: { id: string; name: string } | null
}

const docs = ref<Doc[]>([])
const loading = ref(true)

const rejectModal = ref<{ id: string } | null>(null)
const rejectReason = ref('')
const rejecting = ref(false)

const uploader = computed(() => docs.value[0]?.users)
const major = computed(() => docs.value[0]?.majors)
const subject = computed(() => docs.value[0]?.subjects)

// What is actually up for review here: every file of a pending upload, or just
// the pending files of an upload that is already approved.
const reviewScope = computed<'group' | 'file'>(() => docs.value[0]?.review_scope ?? 'group')
const isAddedFiles = computed(() => reviewScope.value === 'file')

const pendingDocs = computed(() =>
  isAddedFiles.value
    ? docs.value.filter((d) => d.file_status === 'pending')
    : docs.value.filter((d) => d.status === 'pending'),
)
const pendingCount = computed(() => pendingDocs.value.length)

async function load() {
  loading.value = true
  try {
    const { data } = await api.get(`/admin/documents/group/${groupId}`)
    docs.value = data
  } finally {
    loading.value = false
  }
}

const actioning = ref<'approve' | 'reject' | null>(null)

async function approveAll() {
  actioning.value = 'approve'
  try {
    if (isAddedFiles.value) {
      for (const doc of pendingDocs.value) {
        await api.patch(`/admin/documents/files/${doc.id}/approve`)
        doc.file_status = 'active'
      }
    } else {
      await api.patch(`/admin/documents/group/${groupId}/approve`)
      docs.value.forEach((d) => {
        if (d.status === 'pending') d.status = 'active'
      })
    }
    showToast('Approved', { duration: 5000 })
    router.push({ name: 'admin', query: { tab: 'approvals' } })
  } catch (e) {
    showToast(apiErrorMessage(e, 'That approval was refused'), { type: 'error' })
  } finally {
    actioning.value = null
  }
}

function openReject() {
  rejectModal.value = { id: groupId }
  rejectReason.value = ''
}

async function confirmReject() {
  if (!rejectModal.value) return
  // Guards the Enter key and anything else that reaches here past the disabled
  // button; the server rejects a blank reason regardless.
  const reason = rejectReason.value.trim()
  if (!reason) return
  rejecting.value = true
  try {
    const payload = { reason }
    if (isAddedFiles.value) {
      for (const doc of pendingDocs.value) {
        await api.patch(`/admin/documents/files/${doc.id}/reject`, payload)
        doc.file_status = 'rejected'
      }
    } else {
      await api.patch(`/admin/documents/group/${groupId}/reject`, payload)
      docs.value.forEach((d) => {
        if (d.status === 'pending') d.status = 'rejected'
      })
    }
    rejectModal.value = null
    rejectReason.value = ''
    showToast('Rejected', { duration: 5000 })
    router.push({ name: 'admin', query: { tab: 'approvals' } })
  } catch (e) {
    // Leaves the modal open with the text intact, so the reason can be fixed
    // rather than retyped — a blank or over-long one is refused by the server.
    showToast(apiErrorMessage(e, 'That rejection was refused'), { type: 'error' })
  } finally {
    rejecting.value = false
  }
}

function formatSize(kb: number | null | undefined) {
  // file_size_kb is nullable — legacy rows predate the size being recorded.
  // An em dash reads better than "0 KB", which would claim the file is empty.
  if (kb == null) return '—'
  return kb < 1024 ? `${kb} KB` : `${(kb / 1024).toFixed(1)} MB`
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

const typeColor: Record<string, string> = {
  Note: 'bg-blue-100 text-blue-700',
  TD: 'bg-yellow-100 text-yellow-700',
  'Exam Preparation': 'bg-red-100 text-red-700',
  TP: 'bg-green-100 text-green-700',
  Project: 'bg-purple-100 text-purple-700',
  Lesson: 'bg-orange-100 text-orange-700',
  Thesis: 'bg-teal-100 text-teal-700',
  Other: 'bg-gray-100 text-gray-700',
}

const statusStyle: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  pending: 'bg-yellow-100 text-yellow-700',
  rejected: 'bg-red-100 text-red-600',
}

onMounted(load)
</script>

<template>
  <div class="mx-auto w-full max-w-4xl px-6 py-6 flex flex-col gap-6">
    <!-- Back -->
    <button
      @click="goBack"
      :aria-label="backLabel"
      class="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors w-fit"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="h-4 w-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
      </svg>
      {{ backLabel }}
    </button>

    <!-- Loading -->
    <div v-if="loading" class="flex justify-center py-24">
      <LoadingSpinner />
    </div>

    <template v-else-if="docs.length">
      <!-- Header card -->
      <div class="bg-white rounded-2xl border border-gray-100 px-6 py-5 flex flex-col gap-1">
        <div class="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p class="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1">
              Upload Batch
            </p>
            <h1 class="text-xl font-bold text-gray-900">
              {{ docs.length }} file{{ docs.length > 1 ? 's' : '' }} submitted
            </h1>
            <p class="text-sm text-gray-500 mt-0.5">
              By
              <span class="font-medium text-gray-700"
                >{{ uploader?.first_name }} {{ uploader?.last_name }}</span
              >
              <template v-if="major"> &bull; {{ major.acronym }}</template>
              <template v-if="subject"> &bull; {{ subject.name }}</template>
              &bull; {{ formatDate(docs[0]?.uploaded_at ?? '') }}
            </p>
          </div>
          <div v-if="pendingCount > 0" class="flex items-center gap-2">
            <button
              @click="approveAll"
              :disabled="actioning !== null"
              class="px-4 py-2 text-sm font-semibold bg-green-500 hover:bg-green-600 text-white rounded-xl transition-colors disabled:opacity-50"
            >
              {{ actioning === 'approve' ? 'Approving…' : 'Approve' }}
            </button>
            <button
              @click="openReject"
              :disabled="actioning !== null"
              class="px-4 py-2 text-sm font-semibold bg-red-100 hover:bg-red-200 text-red-600 rounded-xl transition-colors disabled:opacity-50"
            >
              Reject
            </button>
          </div>
          <span
            v-else
            class="text-sm font-semibold text-gray-400 bg-gray-100 px-3 py-1 rounded-full"
            >All actioned</span
          >
        </div>
      </div>

      <!-- Files list -->
      <div class="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div
          v-for="(doc, i) in docs"
          :key="doc.id"
          :class="[
            'px-6 py-4 flex items-center gap-4',
            i !== docs.length - 1 ? 'border-b border-gray-100' : '',
          ]"
        >
          <!-- File icon -->
          <div class="h-10 w-10 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
            <svg class="h-5 w-5 text-gray-400" fill="currentColor" viewBox="0 0 640 640">
              <path
                d="M128 128C128 92.7 156.7 64 192 64L341.5 64C358.5 64 374.8 70.7 386.8 82.7L493.3 189.3C505.3 201.3 512 217.6 512 234.6L512 512C512 547.3 483.3 576 448 576L192 576C156.7 576 128 547.3 128 512L128 128zM336 122.5L336 216C336 229.3 346.7 240 360 240L453.5 240L336 122.5zM248 320C234.7 320 224 330.7 224 344C224 357.3 234.7 368 248 368L392 368C405.3 368 416 357.3 416 344C416 330.7 405.3 320 392 320L248 320zM248 416C234.7 416 224 426.7 224 440C224 453.3 234.7 464 248 464L392 464C405.3 464 416 453.3 416 440C416 426.7 405.3 416 392 416L248 416z"
              />
            </svg>
          </div>

          <!-- Info -->
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-gray-900 truncate">{{ doc.title }}</p>
            <p class="text-xs text-gray-400 mt-0.5">
              <span
                :class="`font-medium px-1.5 py-0.5 rounded-full mr-1 ${typeColor[doc.doc_type] ?? 'bg-gray-100 text-gray-500'}`"
              >
                {{ doc.doc_type }}
              </span>
              {{ doc.original_name }} &bull; {{ formatSize(doc.file_size_kb) }}
            </p>
          </div>

          <!-- Status badge -->
          <span
            :class="`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${statusStyle[doc.status] ?? 'bg-gray-100 text-gray-500'}`"
          >
            {{ doc.status }}
          </span>

          <!-- Open file -->
          <a
            v-if="doc.file_url && doc.status !== 'rejected'"
            :href="doc.file_url"
            target="_blank"
            class="shrink-0 p-2 text-gray-400 hover:text-[#0057BD] hover:bg-blue-50 rounded-lg transition-colors"
            title="Open file"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
          </a>
        </div>
      </div>
    </template>

    <div v-else class="text-center py-24 text-gray-400">No documents found for this batch.</div>
  </div>

  <!-- Reject modal -->
  <Transition
    enter-active-class="transition ease-out duration-200"
    enter-from-class="opacity-0"
    enter-to-class="opacity-100"
    leave-active-class="transition ease-in duration-150"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0"
  >
    <div
      v-if="rejectModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4"
      @click.self="rejectModal = null"
    >
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 flex flex-col gap-4">
        <div class="flex items-center justify-between">
          <h3 class="text-base font-semibold text-gray-900">Reject Document</h3>
          <button
            @click="rejectModal = null"
            class="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium text-gray-700"
            >Reason <span class="font-normal text-red-500">(required)</span></label
          >
          <!-- maxlength matches RejectDto's 300, so the cap is hit while typing
               rather than as a 400 after pressing Confirm. -->
          <textarea
            v-model="rejectReason"
            rows="3"
            maxlength="300"
            placeholder="e.g. Duplicate content, missing information, inappropriate..."
            class="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-300 resize-none"
          />
          <p class="text-xs text-gray-400">
            The uploader will see this in their dashboard and notification.
          </p>
        </div>
        <div class="flex gap-2 justify-end">
          <button
            @click="rejectModal = null"
            class="px-4 py-2 text-sm font-medium border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            @click="confirmReject"
            :disabled="rejecting || !rejectReason.trim()"
            class="px-4 py-2 text-sm font-semibold bg-red-500 hover:bg-red-600 text-white rounded-xl transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            {{ rejecting ? 'Rejecting…' : 'Confirm Reject' }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>
