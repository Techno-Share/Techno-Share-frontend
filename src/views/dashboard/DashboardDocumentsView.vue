<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDocumentsStore } from '@/stores/documents.store'
import type { AudienceEntry } from '@/types/documents.types'
import { useAuthStore } from '@/stores/auth.store'
import UploadAndEditDocModal from '@/components/documents/UploadAndEditDocModal.vue'
import SearchButton from '@/components/base/SearchButton.vue'
import IconTextButton from '@/components/base/IconTextButton.vue'
import SearchableSelect from '@/components/base/SearchableSelect.vue'
import SelectDropdown from '@/components/base/SelectDropdown.vue'
import DocumentCard from '@/components/documents/DocumentCard.vue'
import DocumentListRow from '@/components/documents/DocumentListRow.vue'
import LoadingSpinner from '@/components/base/LoadingSpinner.vue'
import Pagination from '@/components/base/Pagination.vue'

const { t } = useI18n({ useScope: 'global' })
const docs = useDocumentsStore()
const auth = useAuthStore()

const showUpload = ref(false)
const selectedType = ref('')
// '' = every status. Non-active values are only honoured because this list is
// always scoped to uploader_id === the current user.
const selectedStatus = ref('')

const searchQuery = ref('')

const PAGE_SIZE = 20
const page = ref(1)

// Own uploads can mix department and language courses, so every type is on
// offer here rather than one course's subset.
const statusOptions = computed(() => [
  { label: t('dashboard.documents.statusAll'), value: '' },
  { label: t('dashboard.documents.statusActive'), value: 'active' },
  { label: t('dashboard.documents.statusPending'), value: 'pending' },
  { label: t('dashboard.documents.statusRejected'), value: 'rejected' },
  { label: t('dashboard.documents.statusHidden'), value: 'hidden' },
  { label: t('dashboard.documents.statusExpired'), value: 'expired' },
])

// Neither of these is a review state — both have their own server-side param.
// An upload past its expiry is still 'active' in the database; that is what
// keeps it visible to its owner here after it has left everyone else's feed.
const PSEUDO_STATUSES = ['hidden', 'expired']

const docTypes = computed(() => [
  { label: 'All', value: '' },
  ...docs.docTypes.map((type) => ({ label: type, value: type })),
])

// Lists come back already filtered by the server (doc_type + title search).
const myDocs = computed(() => docs.documents)

function loadDocs() {
  return docs.fetchAll({
    uploader_id: auth.user?.id,
    doc_type: selectedType.value || undefined,
    status:
      selectedStatus.value && !PSEUDO_STATUSES.includes(selectedStatus.value)
        ? (selectedStatus.value as 'pending' | 'active' | 'rejected')
        : undefined,
    hidden: selectedStatus.value === 'hidden' ? 'true' : undefined,
    expired: selectedStatus.value === 'expired' ? 'true' : undefined,
    search: searchQuery.value.trim() || undefined,
    // Newest first, and only that: this table has a Post Date column, so a
    // pinned row floating to the top reads as the dates being out of order.
    sort: 'date',
    page: page.value,
    limit: PAGE_SIZE,
  })
}

// Any filter change re-narrows the results, so the current page number no
// longer refers to anything meaningful — reset to 1 and let the `page` watcher
// refetch (or fetch directly if already there).
function reload() {
  if (page.value === 1) loadDocs()
  else page.value = 1
}

// Type chips refetch immediately; the search box is debounced so we don't
// fire a request per keystroke.
watch([selectedType, selectedStatus], reload)

let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(searchQuery, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(reload, 300)
})

watch(page, loadDocs)

// ── Pending/rejected uploads (edit + remove) ─────────────────────────────────
type EditableDoc = {
  id: string
  title: string
  doc_type: string
  year_level?: number | null
  academic_year?: string | null
  // Both are edited in the form and saved back, so they have to arrive with the
  // document — absent would look like "cleared" and overwrite the real value.
  audience?: AudienceEntry[]
  expires_at?: string | null
  majors?: { id: string } | null
  subjects?: { id: string } | null
  description?: string | null
  // Carried through so the editor can list the files already on the upload —
  // with their URLs, which is what lets an image tile show the picture.
  documents?: {
    id: string
    original_name?: string | null
    file_size_kb?: number | null
    file_url?: string | null
  }[]
}
const editDoc = ref<EditableDoc | null>(null)

function openEdit(doc: EditableDoc) {
  editDoc.value = doc
  showUpload.value = true
}

function closeModal() {
  showUpload.value = false
  editDoc.value = null
}

async function onUploaded() {
  await loadDocs()
}

onMounted(() => {
  docs.fetchDocTypes()
  loadDocs()
})
</script>

<template>
  <!-- Heading left, controls right. The heading is md-only: the dashboard
       shell already renders "My Documents" on mobile, so showing both would
       stack two titles on a phone. -->
  <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
    <p class="hidden md:block text-xs font-semibold text-gray-400 uppercase tracking-wide">
      {{ t('dashboard.documents.title') }}
    </p>

    <!-- Search on its own line, the filters and the upload button on the
         next — the search gets the full width it needs to be typed into, and
         the controls below stay at a readable size instead of all four
         fighting for one row. One row again from md up, where they fit. -->
    <div class="flex flex-col gap-2 md:flex-row md:items-center">
      <!-- Width on a wrapper, not the component: its root is `w-full`, so a
           fallthrough class would depend on Tailwind's ordering to win. -->
      <div class="w-full md:w-44">
        <SearchButton v-model="searchQuery" />
      </div>

      <div class="flex items-center gap-2">
        <div class="min-w-0 flex-1 md:w-36 md:flex-none">
          <SelectDropdown v-model="selectedStatus" :options="statusOptions" />
        </div>
        <!-- The wrapper's class was misspelled (`shirnk-0`), so it never
             constrained anything. -->
        <div class="min-w-0 flex-1 md:w-auto md:flex-none">
          <SearchableSelect v-model="selectedType" :options="docTypes" />
        </div>

        <IconTextButton
          class="shrink-0"
          :text="t('dashboard.documents.upload')"
          @click="showUpload = true"
        >
          <template #icon>
            <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 4v16m8-8H4"
              />
            </svg>
          </template>
        </IconTextButton>
      </div>
    </div>
  </div>

  <!-- Loading -->
  <div v-if="docs.loading" class="flex justify-center py-24"><LoadingSpinner /></div>

  <!-- Empty -->
  <div
    v-else-if="myDocs.length === 0"
    class="flex flex-1 flex-col items-center justify-center py-20 gap-4 bg-white rounded-2xl border border-gray-100"
  >
    <div class="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center">
      <svg class="h-8 w-8 text-gray-300" fill="currentColor" viewBox="0 0 640 640">
        <path
          d="M128 128C128 92.7 156.7 64 192 64L341.5 64C358.5 64 374.8 70.7 386.8 82.7L493.3 189.3C505.3 201.3 512 217.6 512 234.6L512 512C512 547.3 483.3 576 448 576L192 576C156.7 576 128 547.3 128 512L128 128zM336 122.5L336 216C336 229.3 346.7 240 360 240L453.5 240L336 122.5zM248 320C234.7 320 224 330.7 224 344C224 357.3 234.7 368 248 368L392 368C405.3 368 416 357.3 416 344C416 330.7 405.3 320 392 320L248 320zM248 416C234.7 416 224 426.7 224 440C224 453.3 234.7 464 248 464L392 464C405.3 464 416 453.3 416 440C416 426.7 405.3 416 392 416L248 416z"
        />
      </svg>
    </div>
    <div class="text-center">
      <p class="text-gray-500 font-medium">
        {{
          searchQuery || selectedType
            ? t('dashboard.documents.noMatch')
            : t('dashboard.documents.noneUploaded')
        }}
      </p>
      <p class="text-gray-400 text-sm mt-1">
        {{
          searchQuery || selectedType
            ? t('dashboard.documents.tryChangingFilter')
            : t('dashboard.documents.shareNotes')
        }}
      </p>
    </div>
    <button
      v-if="!searchQuery && !selectedType"
      @click="showUpload = true"
      class="mt-1 bg-primary hover:bg-primary-hover text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors"
    >
      {{ t('dashboard.documents.uploadFirst') }}
    </button>
  </div>

  <!-- Document list — same components as the public Documents page, so a card
       looks and behaves identically in both places (owner edit/delete included). -->
  <template v-else>
    <!-- List view — desktop only; mobile falls back to cards below -->
    <!-- md:flex-1 makes the panel bottom out level with the sidebar, and a long
         list scrolls INSIDE it rather than scrolling the page. No max-height:
         the column itself is now the sidebar's height on this route (see
         DashboardView), so flex-1 lands on the same line without a hand-counted
         offset to keep in step with the toolbar above it. -->
    <div
      class="hidden md:flex md:flex-1 md:min-h-0 md:flex-col rounded-2xl border border-gray-200 bg-white overflow-auto scrollbar-hide"
    >
      <!-- min-width keeps header and rows aligned while the panel scrolls
           sideways; nine columns do not fit beside the dashboard sidebar. -->
      <div class="min-w-[800px]">
        <!-- sticky within the scrolling panel; bg-white so rows cannot show
             through as they pass underneath. -->
        <div
          class="sticky top-0 z-10 bg-white grid grid-cols-[2fr_90px_100px_90px_120px_110px_40px] gap-3 items-center border-b border-gray-100 px-4 py-3 text-sm font-medium text-black"
        >
          <span>{{ t('document.documentsPage.colName') }}</span>
          <span class="text-center">{{ t('dashboard.documents.colMajor') }}</span>
          <span class="text-center">{{ t('dashboard.documents.colSubject') }}</span>
          <span class="text-center">{{ t('dashboard.documents.colSemester') }}</span>
          <span class="text-center">{{ t('dashboard.documents.colStatus') }}</span>
          <span class="text-center">{{ t('document.documentsPage.colDate') }}</span>
          <span></span>
        </div>

        <div class="divide-y divide-gray-100">
          <DocumentListRow
            v-for="doc in myDocs"
            :key="doc.id"
            :doc="doc"
            :file-count="doc.documents?.length ?? 1"
            show-owner-columns
            highlight-pending
            @deleted="loadDocs"
            @hidden-changed="loadDocs"
            @pinned-changed="loadDocs"
            @edit="openEdit"
          />
        </div>
      </div>
    </div>

    <!-- Mobile fallback: list view is desktop-only, so show cards on small screens -->
    <div class="grid grid-cols-1 gap-5 sm:grid-cols-2 md:hidden">
      <DocumentCard
        v-for="doc in myDocs"
        :key="doc.id"
        :doc="doc"
        highlight-pending
        @deleted="loadDocs"
        @hidden-changed="loadDocs"
        @pinned-changed="loadDocs"
        @edit="openEdit"
      />
    </div>
  </template>

  <Pagination v-model:page="page" :total="docs.total" :page-size="PAGE_SIZE" class="mt-8" />

  <!-- Upload modal -->
  <UploadAndEditDocModal
    v-if="showUpload"
    :edit-doc="editDoc"
    @close="closeModal"
    @uploaded="onUploaded"
  />
</template>
