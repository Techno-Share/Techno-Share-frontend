<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useDocumentsStore } from '@/stores/documents.store'
import { useSubjectsStore } from '@/stores/subjects.store'
import { useMajorsStore } from '@/stores/majors.store'
import DocumentCard from '@/components/documents/DocumentCard.vue'
import DocumentListRow from '@/components/documents/DocumentListRow.vue'
import UploadDocumentModal from '@/components/documents/UploadDocumentModal.vue'
import LoadingSpinner from '@/components/base/LoadingSpinner.vue'
import Breadcrumb from '@/components/base/Breadcrumb.vue'
import { isLanguageMajor, languageLabelKey } from '@/utils/format'
import FilterButton from '@/components/base/FilterButton.vue'
import SearchButton from '@/components/base/SearchButton.vue'
import ViewToggle from '@/components/base/ViewToggle.vue'
import IconTextButton from '@/components/base/IconTextButton.vue'
import EmptyState from '@/components/base/EmptyState.vue'
import UploadAndEditDocModal from '@/components/documents/UploadAndEditDocModal.vue'
import type { Upload } from '@/types/documents.types'
import Pagination from '@/components/base/Pagination.vue'
import PageSizeSelect from '@/components/base/PageSizeSelect.vue'

const { t } = useI18n({ useScope: 'global' })
const route = useRoute()
const docs = useDocumentsStore()
const subjectsStore = useSubjectsStore()
const majorsStore = useMajorsStore()

const slug = route.params.slug as string
const year = Number(route.params.year)
// Absent when a level's documents are listed directly (major + level).
const subjectId = (route.params.subjectId as string) || ''

const showUpload = ref(false)
const selectedType = ref('')
const searchQuery = ref('')

const page = ref(1)
const pageSize = ref(10)
const viewMode = ref<'card' | 'list'>(
  (localStorage.getItem('docViewMode') as 'card' | 'list') ?? 'card',
)
watch(viewMode, (v) => localStorage.setItem('docViewMode', v))

// Match by lowercased acronym so every major works.
const currentMajor = computed(() =>
  majorsStore.majors.find((m) => m.acronym?.toLowerCase() === slug),
)

const currentSubject = computed(() => subjectsStore.subjects.find((s) => s.id === subjectId))

// Backend already returns one upload per group with embedded documents[]
const groupedDocs = computed(() =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (docs.documents as any[]).map((upload) => ({
    doc: upload,
    count: (upload.documents?.length ?? 1) as number,
  })),
)

// Page title + level label. DFL's year_level holds a language, not a year.
// The card's edit button hands the whole upload over; the form prefills from it.
const editDoc = ref<Upload | null>(null)
function openEdit(doc: Upload) {
  editDoc.value = doc
}

const levelLabel = computed(() => {
  const languageKey = languageLabelKey(currentMajor.value?.acronym, year)
  return languageKey ? t(languageKey) : t('document.documentsPage.year', { year })
})

const breadcrumbItems = computed(() => {
  const items: { label: string; to?: object }[] = [
    { label: t('common.nav.home'), to: { name: 'home' } },
    {
      label: currentMajor.value?.acronym ?? slug.toUpperCase(),
      to: { name: 'department', params: { slug } },
    },
  ]
  if (subjectId) {
    items.push({ label: levelLabel.value, to: { name: 'subjects', params: { slug, year } } })
    items.push({ label: currentSubject.value?.name ?? t('document.documentsPage.subject') })
  } else {
    items.push({ label: levelLabel.value })
  }
  return items
})
const pageTitle = computed(
  () =>
    currentSubject.value?.name ??
    `${currentMajor.value?.acronym ?? slug.toUpperCase()} ${levelLabel.value}`,
)

// Documents are filtered by type in the DB. With a subject we filter by it;
// otherwise we filter by major + level.
function loadDocs() {
  return docs.fetchAll({
    ...(subjectId
      ? { subject_id: subjectId }
      : { major_id: currentMajor.value?.id, year_level: year }),
    doc_type: selectedType.value || undefined,
    search: searchQuery.value.trim() || undefined,
    page: page.value,
    limit: pageSize.value,
  })
}

// Changing the filter re-narrows the result set, so page 3 of the old results
// is meaningless — go back to page 1. The watcher on `page` then refetches,
// unless we were already on page 1, in which case fetch directly.
watch(selectedType, () => {
  if (page.value === 1) loadDocs()
  else page.value = 1
})

// Type chips refetch immediately; the search box is debounced so we don't fire
// a request per keystroke.
let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(searchQuery, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    if (page.value === 1) loadDocs()
    else page.value = 1
  }, 300)
})

watch(page, loadDocs)

// Page size change: same reset-to-page-1 dance as the filter above.
watch(pageSize, () => {
  if (page.value === 1) loadDocs()
  else page.value = 1
})

// A language course is filed under Grammar/Speaking/… and a department course
// under Note/TD/… — offer whichever list this department uses.
const docTypes = computed(() => [
  { label: 'All', value: '' },
  ...(isLanguageMajor(currentMajor.value?.acronym)
    ? docs.languageDocTypes
    : docs.departmentDocTypes
  ).map((type) => ({ label: type, value: type })),
])

onMounted(async () => {
  docs.fetchDocTypes()
  if (!majorsStore.majors.length) await majorsStore.fetchMajors()

  // Load subjects so currentSubject name resolves
  if (currentMajor.value && !subjectsStore.subjects.length) {
    await subjectsStore.fetchByMajorAndYear(currentMajor.value.id, year)
  }

  // Fetch documents filtered by this subject
  await loadDocs()
})

async function onUploaded() {
  await loadDocs()
}
</script>

<template>
  <div>
    <div class="mx-auto w-full max-w-7xl px-6 flex flex-col gap-6 mb-9">
      <!-- Breadcrumb -->
      <Breadcrumb :items="breadcrumbItems" />

      <!-- Header -->
      <div class="flex md:flex-row flex-col items-start md:items-center md:justify-between gap-4">
        <!-- Centred on a phone, where the title sits alone above the toolbar;
             back to the left edge from md up, where it shares the row. -->
        <div class="flex flex-col w-full text-center md:w-auto md:text-left">
          <h1 class="md:text-3xl text-xl font-bold text-black capitalize">
            {{ pageTitle }}
          </h1>
          <p class="md:text-sm text-xs text-gray-400">
            <!-- docs.total is every match, not just this page's slice. -->
            {{ t('document.documentsPage.documentsCount', docs.total) }}
          </p>
        </div>
        <!-- Same shape as the subjects toolbar: search on the left, controls
             grouped on the right, one row at every width. -->
        <div class="flex w-full md:w-auto md:shrink-0 flex-wrap items-center justify-between gap-3">
          <!-- The width goes on a wrapper, not on SearchButton. Its own root is
               `w-full`, and Tailwind emits .w-full after .w-36, so a w-* passed
               in from outside loses on source order and the box stretched to
               fill the row. -->
          <div class="w-36">
            <SearchButton v-model="searchQuery" />
          </div>

          <div class="flex items-center gap-3">
            <div class="shrink-0">
              <FilterButton v-model="selectedType" placeholder="All" :options="docTypes" />
            </div>

            <ViewToggle v-model="viewMode" />

            <IconTextButton :text="t('document.documentsPage.upload')" @click="showUpload = true">
              <template #icon>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                  />
                </svg>
              </template>
            </IconTextButton>
          </div>
        </div>
      </div>

      <!-- Documents area -->
      <div>
        <!-- Loading -->
        <div v-if="docs.loading" class="flex justify-center py-20">
          <LoadingSpinner />
        </div>

        <!-- Empty -->
        <EmptyState
          v-else-if="groupedDocs.length === 0"
          :message="t('document.documentsPage.noDocuments')"
          :action-label="t('document.documentsPage.uploadFirst')"
          @action="showUpload = true"
        />

        <!-- Card grid -->
        <!-- Scrolls inside itself so the breadcrumb, title and toolbar stay put
             while the shelf moves. The offset is the chrome above and below:
             100px navbar + ~64px breadcrumb and gap + ~84px title row and gap
             + 24px bottom padding. Desktop only — on a phone the page scroll is
             the right behaviour. -->
        <div v-else-if="viewMode === 'card'">
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
            <DocumentCard
              v-for="entry in groupedDocs"
              :key="entry.doc.id"
              :doc="entry.doc"
              @deleted="loadDocs()"
              @hidden-changed="loadDocs()"
              @pinned-changed="loadDocs()"
              @edit="openEdit"
            />
          </div>
        </div>

        <!-- List view — desktop only -->
        <div
          v-else
          class="hidden md:block rounded-2xl border border-gray-200 bg-white overflow-hidden"
        >
          <!-- Table header -->
          <div
            class="hidden md:grid grid-cols-[2fr_120px_100px_160px_110px_40px] gap-3 items-center border-b border-gray-100 px-4 py-3 text-sm font-medium text-black"
          >
            <span>{{ t('document.documentsPage.colName') }}</span>
            <span class="text-center">{{ t('document.documentsPage.colAcademicYear') }}</span>
            <span class="text-center">{{ t('document.documentsPage.colFileSize') }}</span>
            <span class="text-center">{{ t('document.documentsPage.colUploadBy') }}</span>
            <span class="text-center">{{ t('document.documentsPage.colDate') }}</span>
            <span></span>
          </div>

          <!-- Rows scroll, the header does not: a long list should not push the
               pager off the page, and the column names stay readable. -->
          <div class="max-h-[60vh] divide-y divide-gray-100 overflow-y-auto">
            <DocumentListRow
              v-for="entry in groupedDocs"
              :key="entry.doc.id"
              :doc="entry.doc"
              :file-count="entry.count"
              @deleted="loadDocs()"
              @hidden-changed="loadDocs()"
              @pinned-changed="loadDocs()"
              @edit="openEdit"
            />
          </div>
        </div>

        <!-- Footer: page size + pager -->
        <!-- Hidden when the list fits the smallest page size (≤10). -->
        <div
          v-if="docs.total > 10"
          class="mt-8 flex flex-col items-center gap-6 md:grid md:grid-cols-[1fr_auto_1fr]"
        >
          <Pagination
            class="md:col-start-2 md:justify-self-center"
            v-model:page="page"
            :total="docs.total"
            :page-size="pageSize"
            scroll-to-top
          />
          <PageSizeSelect
            class="md:col-start-3 md:justify-self-end"
            v-model="pageSize"
            :total="docs.total"
            :options="[10, 20, 30, 50]"
            direction="up"
          />
        </div>
      </div>
    </div>

    <!-- Upload modal — pre-fills subject -->
    <UploadDocumentModal
      v-if="showUpload"
      :default-subject-id="subjectId"
      :default-major-id="currentMajor?.id"
      :default-year-level="year"
      @close="showUpload = false"
      @uploaded="onUploaded"
    />

    <!-- Editing an existing upload reuses the dashboard form, which is the one
         that knows how to add/remove files on a document that already exists. -->
    <UploadAndEditDocModal
      v-if="editDoc"
      :edit-doc="editDoc"
      @close="editDoc = null"
      @uploaded="
        () => {
          editDoc = null
          loadDocs()
        }
      "
    />
  </div>
</template>
