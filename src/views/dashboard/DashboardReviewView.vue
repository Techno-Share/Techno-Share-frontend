<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import api from '@/services/http'
import { useToast } from '@/composables/useToast'
import { useFilePreview } from '@/composables/useFilePreview'
import LoadingSpinner from '@/components/base/LoadingSpinner.vue'
import DocumentReviewTable, { type DocumentRow } from '@/components/review/DocumentReviewTable.vue'
import DocumentReviewCard from '@/components/review/DocumentReviewCard.vue'
import DocumentPreviewModal from '@/components/documents/DocumentPreviewModal.vue'
import type { UploadFile } from '@/types/documents.types'

/**
 * The review queue, for department moderators.
 *
 * Deliberately its own page rather than a doorway into the admin dashboard: a
 * moderator is an ordinary student who also reviews, and sending them into a
 * screen headed "Admin Panel" — past tabs they cannot open — reads as a place
 * they do not belong.
 *
 * It calls the same endpoints the admin screen does, so the two cannot disagree
 * about what is pending or who may act. Nothing here decides permissions: the
 * server returns only the departments this reviewer covers, and refuses any
 * action outside them whatever the client sends.
 */
const { showToast } = useToast()

// Documents are the only thing reviewed now: a subject is created by a
// moderator of its department and published immediately, so there was never
// anything in that queue to act on.

/**
 * The departments this reviewer answers for, named in the header so the queue's
 * scope is visible rather than implied. Comes from the server's own assignment
 * table (GET /admin/scope) — the client is told what it may review, it never
 * says so. An admin gets `majors: null`, meaning every department.
 */
type ReviewerScope = { is_admin: boolean; majors: { id: string; acronym: string }[] | null }
const scope = ref<ReviewerScope | null>(null)

const scopeLabel = computed(() => {
  if (!scope.value) return ''
  if (scope.value.majors === null) return 'All departments'
  if (!scope.value.majors.length) return 'No departments assigned'
  return scope.value.majors.map((m) => m.acronym).join(', ')
})

interface PendingFile {
  id: string
  group_id: string
  title: string
  original_name: string | null
  file_status?: string
  doc_type?: string
  uploaded_at?: string
  year_level: number | null
  majors?: { acronym?: string } | null
  users?: { first_name?: string; last_name?: string } | null
  /** 'group' — the whole upload is pending. 'file' — only added files are. */
  review_scope?: 'group' | 'file'
}

const files = ref<PendingFile[]>([])
const loading = ref(true)
const busyId = ref<string | null>(null)
/** Which row has its reason box open; a rejection must say why. */
const rejecting = ref<string | null>(null)
const reason = ref('')

/**
 * The flat file rows, folded back into the uploads they came from — the API
 * returns one row per file and repeats the upload's details on each.
 */
const groups = computed<DocumentRow[]>(() => {
  const byGroup = new Map<string, DocumentRow>()
  for (const file of files.value) {
    const entry = byGroup.get(file.group_id)
    if (entry) {
      entry.files.push(file as unknown as UploadFile)
      entry.fileCount++
    } else {
      byGroup.set(file.group_id, {
        ...(file as unknown as DocumentRow),
        files: [file as unknown as UploadFile],
        fileCount: 1,
      })
    }
  }
  return [...byGroup.values()]
})

/** Which groups are open. The shared table takes an array, not a Set. */
const expandedIds = ref<string[]>([])

function toggleExpanded(groupId: string) {
  expandedIds.value = expandedIds.value.includes(groupId)
    ? expandedIds.value.filter((id) => id !== groupId)
    : [...expandedIds.value, groupId]
}

/** The upload awaiting a reason, when Reject was pressed on one. */
const rejectingGroup = computed(
  () => groups.value.find((g) => g.group_id === rejecting.value) ?? null,
)

const visibleCount = computed(() => groups.value.length)

async function load() {
  loading.value = true
  try {
    const { data } = await api.get('/admin/pending/documents')
    files.value = data
  } catch {
    showToast('Could not load the review queue', { type: 'error' })
  } finally {
    loading.value = false
  }
}

function startReject(id: string) {
  rejecting.value = id
  reason.value = ''
}

function cancelReject() {
  rejecting.value = null
  reason.value = ''
}

/** Every action goes through here so the queue is always refetched after one. */
async function act(id: string, path: string, body?: Record<string, unknown>) {
  busyId.value = id
  try {
    await api.patch(path, body ?? {})
    showToast(body?.reason ? 'Rejected' : 'Approved', { duration: 5000 })
    cancelReject()
    await load()
  } catch (e) {
    showToast(
      (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'That action was refused',
      { type: 'error' },
    )
  } finally {
    busyId.value = null
  }
}

/**
 * The shared table offers Edit as well, which is an admin nicety — renaming a
 * subject is not part of reviewing one. Here it is ignored, and Reject opens
 * the reason box the page already uses.
 */
function onDocAction(key: string, doc: { group_id: string }) {
  if (key === 'approve') void approveGroup(doc)
  else if (key === 'reject') startReject(doc.group_id)
}

const approveGroup = (g: { group_id: string }) =>
  act(g.group_id, `/admin/documents/group/${g.group_id}/approve`)
const rejectGroup = (g: { group_id: string }) => {
  // The Confirm button is already disabled while the box is blank; this guards
  // every other way in. The server refuses a blank reason either way.
  const why = reason.value.trim()
  if (!why) return
  return act(g.group_id, `/admin/documents/group/${g.group_id}/reject`, { reason: why })
}

/**
 * Previewing a file from the queue.
 *
 * A reviewer has to read the thing before approving it, so the table's file
 * rows open the same modal the admin dashboard and the per-submission page use
 * — this screen was the one consumer that listened for neither event, which
 * made the rows look clickable and do nothing.
 *
 * Phone cards are deliberately not wired: DocumentReviewCard routes to the
 * submission's own page instead, because a card has no room for a folder's
 * worth of thumbnails.
 */
const { previewOpen, previewTarget, openPreview, downloadFile } = useFilePreview()

async function loadScope() {
  try {
    const { data } = await api.get<ReviewerScope>('/admin/scope')
    scope.value = data
  } catch {
    // The header simply stays quiet — a failed scope lookup must not stop the
    // queues from rendering.
  }
}

onMounted(() => {
  void load()
  void loadScope()
})
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-3">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <h1 class="text-xs font-semibold uppercase tracking-wide text-gray-400">
        Review submissions
      </h1>
      <!-- Siblings, not nested: the row is justify-between, so the scope only
           lands on the right once it stops sharing a box with the title. It
           stays in the header rather than the empty state, so the scope is
           visible when there IS work — a short queue and a narrow scope look
           the same otherwise. -->
      <p v-if="scopeLabel" class="text-sm text-gray-500">
        Moderator: <span class="font-semibold text-gray-700">{{ scopeLabel }}</span>
      </p>
    </div>

    <div v-if="loading" class="flex justify-center py-24"><LoadingSpinner /></div>

    <div
      v-else-if="visibleCount === 0"
      class="rounded-2xl border border-gray-100 bg-white px-6 py-16 text-center"
    >
      <p class="text-sm font-medium text-gray-600">Nothing to review</p>
      <p class="mt-1 text-xs text-gray-400">
        New submissions from your departments will appear here.
      </p>
    </div>

    <template v-else>
      <!-- Documents — the same table the admin dashboard renders. -->
      <section v-if="groups.length" class="flex min-h-0 flex-1 flex-col gap-3">
        <!-- The shared table has no reason field, so it asks here. -->
        <div
          v-if="rejectingGroup"
          class="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3"
        >
          <p class="text-sm text-gray-600">
            Rejecting <span class="font-semibold">{{ rejectingGroup.title }}</span>
          </p>
          <!-- maxlength matches RejectDto's 300, so the cap is hit while typing
               rather than as a 400 after pressing Confirm. -->
          <input
            v-model="reason"
            type="text"
            maxlength="300"
            placeholder="Why is it being rejected? (required)"
            class="min-w-0 flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            type="button"
            :disabled="!reason.trim() || busyId === rejectingGroup.group_id"
            class="rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white transition hover:cursor-pointer hover:bg-red-600 disabled:opacity-50"
            @click="rejectGroup(rejectingGroup)"
          >
            Confirm
          </button>
          <button
            type="button"
            class="rounded-xl px-3 py-2 text-sm font-semibold text-gray-500 transition hover:cursor-pointer hover:bg-gray-100"
            @click="cancelReject"
          >
            Cancel
          </button>
        </div>

        <!-- Cards on a phone, the table from md up: seven columns cannot be read
             at 400px, and a table that also renders cards ends up with two
             layouts fighting over one set of column spans. Both are driven by
             the same rows, expansion and events. -->
        <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto md:hidden">
          <DocumentReviewCard
            v-for="doc in groups"
            :key="doc.group_id"
            :doc="doc"
            :actioning-id="busyId"
            @action="onDocAction"
          />
        </div>

        <DocumentReviewTable
          class="hidden min-h-0 flex-1 md:flex"
          :rows="groups"
          :expanded-ids="expandedIds"
          :actioning-id="busyId"
          @toggle="toggleExpanded"
          @action="onDocAction"
          @preview="openPreview"
        />
      </section>
    </template>

    <DocumentPreviewModal v-model="previewOpen" :file="previewTarget" @download="downloadFile" />
  </div>
</template>
