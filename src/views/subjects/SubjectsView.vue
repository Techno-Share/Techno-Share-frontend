<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useSubjectsStore } from '@/stores/subjects.store'
import { useToast } from '@/composables/useToast'
import { useMajorsStore } from '@/stores/majors.store'
import SubjectCard from '@/components/subjects/SubjectCard.vue'
import SearchButton from '@/components/base/SearchButton.vue'
import FilterButton from '@/components/base/FilterButton.vue'
import AddnewSubject from '@/components/base/IconTextButton.vue'
import SubjectCreateModal from '@/components/subjects/SubjectCreateModal.vue'
import { clearSubjectDraft, subjectDraftContext } from '@/composables/subjectDraft'
import LoadingSpinner from '@/components/base/LoadingSpinner.vue'
import api from '@/services/http'
import EmptyState from '@/components/base/EmptyState.vue'
import Breadcrumb from '@/components/base/Breadcrumb.vue'
import { isLanguageMajor, languageLabelKey } from '@/utils/format'

const route = useRoute()
const { t } = useI18n({ useScope: 'global' })
const subjectsStore = useSubjectsStore()
const { showToast } = useToast()
const majorsStore = useMajorsStore()

type FilterValue = 'name' | 'semester1' | 'semester2'

const slug = route.params.slug as string
const yearLevel = Number(route.params.year)
const searchQuery = ref('')
const selectedFilter = ref<FilterValue>('name')
const showAddSubjectModal = ref(false)

// Match by lowercased acronym so every major works — no hardcoded slug map to
// keep in sync.
const currentMajor = computed(() =>
  majorsStore.majors.find((m) => m.acronym?.toLowerCase() === slug),
)

// The language levels (A1, A2, B1, …) have no semesters, so the sort-by filter
// has nothing to offer there.
const isLanguageDepartment = computed(() => isLanguageMajor(currentMajor.value?.acronym))

// DFL's year_level holds a language (English/French), not an academic year.
const yearLabel = computed(() => {
  const languageKey = languageLabelKey(currentMajor.value?.acronym, yearLevel)
  return languageKey ? t(languageKey) : t('document.documentsPage.year', { year: yearLevel })
})

const majorOptions = computed(() =>
  majorsStore.majors.map((m) => ({ label: m.acronym, value: m.id })),
)

const filterOptions = computed(() => [
  { label: t('common.filterButton.default'), value: 'name' },
  { label: t('common.filterButton.bySemester1'), value: 'semester1' },
  { label: t('common.filterButton.bySemester2'), value: 'semester2' },
])

// Sort by name is client-side (presentation only, no data change).
const displayedSubjects = computed(() => {
  const list = [...subjectsStore.subjects]
  if (selectedFilter.value === 'name') list.sort((a, b) => a.name.localeCompare(b.name))
  return list
})

function buildFetchOptions() {
  const semester =
    selectedFilter.value === 'semester1' ? 1 : selectedFilter.value === 'semester2' ? 2 : undefined
  return { semester, search: searchQuery.value || undefined }
}

async function fetchSubjects() {
  if (!currentMajor.value) return
  await subjectsStore.fetchByMajorAndYear(currentMajor.value.id, yearLevel, buildFetchOptions())
}

// Debounce search to avoid a request on every keystroke
let searchTimer: ReturnType<typeof setTimeout>
watch(searchQuery, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(fetchSubjects, 300)
})

watch(selectedFilter, fetchSubjects)

/**
 * Whether this reader may add a subject to THIS department.
 *
 * Defining what a department's subjects ARE is a curation decision, so the
 * server limits it to an admin, or a moderator of that department. Asked here
 * only to decide whether to offer the button — the server checks again, and a
 * 403 from /admin/scope simply means "not a reviewer", which is an answer
 * rather than an error.
 */
const canAddSubject = ref(false)

async function loadCanAdd() {
  try {
    const { data } = await api.get<{
      is_admin: boolean
      majors: { id: string }[] | null
    }>('/admin/scope')
    canAddSubject.value =
      data.is_admin || !!data.majors?.some((m) => m.id === currentMajor.value?.id)
  } catch {
    canAddSubject.value = false
  }
}

function openCreateModal() {
  subjectsStore.createError = null
  showAddSubjectModal.value = true
}

async function handleCreateSubject(payload: {
  name: string
  major_id: string
  year_level: number
  semester: number
  image: File | null
}) {
  try {
    await subjectsStore.createSubject(payload)
    // Only a successful create retires the draft — a failed one leaves it so
    // reopening the modal still has everything that was typed.
    clearSubjectDraft(subjectDraftContext(currentMajor.value?.id ?? '', yearLevel))
    showAddSubjectModal.value = false
    showToast(t('common.subjectPage.submitmsg'))

    /**
     * Refetch, so the new subject is on the page without a reload.
     *
     * Nothing did this before because a new subject used to be created
     * `pending` — invisible until a moderator approved it, so there was
     * nothing for the list to show. It is published immediately now, and a
     * list that still omits it reads as the creation having failed.
     *
     * The modal can target another department or year, in which case this
     * correctly shows no change: the subject exists, just not on this page.
     */
    await fetchSubjects()
  } catch {
    // error shown via subjectsStore.createError
  }
}

onMounted(async () => {
  // After the majors load: loadCanAdd matches the scope against currentMajor,
  // which is resolved from that list and is undefined until it arrives.
  if (!majorsStore.majors.length) await majorsStore.fetchMajors()
  void loadCanAdd()
  await fetchSubjects()
})
</script>

<template>
  <div>
    <!-- mb-9: see DepartmentView — the last card needs to end before the
         viewport does. -->
    <div class="mx-auto mb-9 w-full max-w-7xl px-6 md:mb-0">
      <!-- Breadcrumb. Hidden as a row, not just as a component: Breadcrumb
           renders nothing on a phone, but this wrapper kept its mb-4 and left
           empty space above the title. -->
      <div class="mb-4 hidden md:block">
        <Breadcrumb
          :items="[
            { label: t('common.nav.home'), to: { name: 'home' } },
            {
              label: currentMajor?.acronym ?? slug.toUpperCase(),
              to: { name: 'department', params: { slug } },
            },
            { label: yearLabel },
          ]"
        />
      </div>

      <!-- Header -->
      <div class="flex items-center justify-between gap-4 flex-wrap mb-6">
        <div class="w-full text-center md:w-auto md:text-left">
          <h1 class="md:text-3xl text-xl font-bold text-black">
            {{ yearLabel }} - {{ currentMajor?.acronym }}
          </h1>
        </div>

        <!-- Same shape as the documents toolbar: search on the left, the
             controls grouped on the right. One markup for both widths — the
             desktop and mobile branches this replaces held the same filter and
             button twice, and had already drifted apart (w-36 vs w-40, and a
             stray w-72 on the filter inside a w-36 box). -->
        <div class="flex w-full md:w-auto flex-wrap items-center justify-between gap-3">
          <!-- Grows to fill the row rather than sitting at a fixed 144px.
               A language department hides both the filter and the Add button,
               which left the search stranded at the left edge of a phone with
               200px of empty row beside it. flex-1 closes that gap without a
               branch on the department type: where the controls DO render, the
               search simply takes what they leave, and min-w keeps it at its
               old width so a narrow phone wraps exactly as it did before.
               Fixed again from md up, where the row has room to spare. -->
          <div class="min-w-36 flex-1 md:w-36 md:flex-none">
            <SearchButton v-model="searchQuery" :placeholder="t('common.nav.search')" />
          </div>

          <div class="flex items-center gap-3">
            <div v-if="!isLanguageDepartment" class="shrink-0">
              <FilterButton
                v-model="selectedFilter"
                :options="filterOptions"
                :placeholder="t('common.filterButton.sortBy')"
              />
            </div>

            <AddnewSubject
              v-if="!isLanguageDepartment && canAddSubject"
              :text="t('common.subjectPage.addSubject')"
              @click="openCreateModal"
            >
              <template #icon>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 448 512"
                  class="h-4 w-4 fill-white shrink-0"
                >
                  <path
                    d="M256 64c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 160-160 0c-17.7 0-32 14.3-32 32s14.3 32 32 32l160 0 0 160c0 17.7 14.3 32 32 32s32-14.3 32-32l0-160 160 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-160 0 0-160z"
                  />
                </svg>
              </template>
            </AddnewSubject>
          </div>
        </div>
      </div>
      <!-- Cards area -->
      <div>
        <!-- Loading -->
        <div v-if="subjectsStore.loading" class="flex justify-center py-20">
          <LoadingSpinner />
        </div>

        <!-- Error -->
        <div v-else-if="subjectsStore.error" class="text-center py-20 text-red-500">
          {{ subjectsStore.error }}
        </div>

        <!-- Empty. The action mirrors the toolbar button, so it is offered
             only where adding a subject is offered at all. -->
        <EmptyState
          v-else-if="displayedSubjects.length === 0"
          :message="t('common.subjectPage.noSubjects')"
          :action-label="
            isLanguageDepartment || !canAddSubject ? undefined : t('common.subjectPage.addSubject')
          "
          @action="openCreateModal"
        >
          <template #icon>
            <svg
              class="h-14 w-14 text-gray-200"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="1.5"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9h6m-6 4h6"
              />
            </svg>
          </template>
        </EmptyState>

        <div v-else class="space-y-6">
          <div class="flex items-center justify-center">
            <div class="grid grid-cols-1 gap-6 md:grid-cols-4">
              <SubjectCard
                v-for="subject in displayedSubjects"
                :key="subject.id"
                :title="subject.name"
                :img="subject.subject_url"
                :subjectId="subject.id"
                :subject-acronym="subject.acronym"
                :department-slug="slug"
                :year="yearLevel"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
    <SubjectCreateModal
      v-if="showAddSubjectModal"
      :open="showAddSubjectModal"
      :year-level="yearLevel"
      :default-department-id="currentMajor?.id ?? ''"
      :departments="majorOptions"
      :submitting="subjectsStore.creating"
      :api-error="subjectsStore.createError"
      @close="showAddSubjectModal = false"
      @submit="handleCreateSubject"
    />
  </div>
</template>
