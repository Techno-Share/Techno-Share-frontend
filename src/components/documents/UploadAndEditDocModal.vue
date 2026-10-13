<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useDocumentsStore } from '@/stores/documents.store'
import { useMajorsStore } from '@/stores/majors.store'
import { useSubjectsStore } from '@/stores/subjects.store'
import { useI18n } from 'vue-i18n'
import { useToast } from '@/composables/useToast'
import { clearDraft, readDraft, writeDraft } from '@/composables/uploadDraft'
import SelectDropdown from '@/components/base/SelectDropdown.vue'
import ChipButton from '@/components/base/ChipButton.vue'
import AudiencePicker from '@/components/documents/AudiencePicker.vue'
import DateField from '@/components/base/DateField.vue'
import TimeField from '@/components/base/TimeField.vue'
import FileTypeIcon from '@/components/base/FileTypeIcon.vue'
import RingSpinner from '@/components/base/RingSpinner.vue'
import ConfirmChangesModal, { type FieldChange } from '@/components/base/ConfirmChangesModal.vue'
import type { AudienceEntry } from '@/types/documents.types'
import {
  TEXT_NAME_PATTERN,
  sanitizeTextName,
  isLanguageMajor,
  languageLabelKey,
  yearLevelsForMajor,
  isImageFile,
  coversEveryAudiencePair,
  formatExpiry,
  isoToDateAndTime,
  dateAndTimeToIso,
  formatFileSize,
  audienceLabel as sharedAudienceLabel,
} from '@/utils/format'

const docs = useDocumentsStore()
const majors = useMajorsStore()
const subjects = useSubjectsStore()
const { t } = useI18n({ useScope: 'global' })
const { showToast } = useToast()

/** Mirrors UPLOAD_LIMITS on the server — see backend/src/common/upload-limits.ts. */
const MAX_FILE_MB = 50
const MAX_FILE_SIZE_BYTES = MAX_FILE_MB * 1024 * 1024

const emit = defineEmits<{ (e: 'close'): void; (e: 'uploaded'): void }>()

/**
 * The default expiry time, and what an expiry means when nobody sets one.
 *
 * End of the chosen day, so "expires on the 11th" still lasts through the 11th
 * — the behaviour from before expiry carried a time at all. Anyone who wants it
 * gone at 9am now says so; everyone else is unaffected.
 *
 * Declared above the form because the form's initial state reads it.
 */
const END_OF_DAY = '23:59'

// When present, the modal edits this upload's metadata instead of creating one.
const props = defineProps<{
  editDoc?: {
    id: string
    title: string
    doc_type: string
    year_level?: number | null
    academic_year?: string | null
    audience?: AudienceEntry[]
    expires_at?: string | null
    majors?: { id: string } | null
    subjects?: { id: string } | null
    description?: string | null
    // file_size_kb is nullable in the feed shape and optional in the dashboard's
    // — accept both so either list can hand a document straight to the editor.
    // file_url is what lets an image file show itself instead of a generic icon.
    documents?: {
      id: string
      original_name?: string | null
      file_size_kb?: number | null
      file_url?: string | null
    }[]
  } | null
}>()
const isEditing = computed(() => !!props.editDoc)

// Existing files (edit mode) the user has marked for removal.
const removedFileIds = ref<string[]>([])
const existingFiles = computed(() =>
  (props.editDoc?.documents ?? []).filter((f) => !removedFileIds.value.includes(f.id)),
)
/**
 * An already-uploaded file previews as itself when it is an image, matching the
 * tiles for files being added now. Anything else — and any file whose list left
 * the URL out — falls back to the type icon.
 */
function existingPreview(file: { original_name?: string | null; file_url?: string | null }) {
  return isImageFile(file.original_name) ? (file.file_url ?? null) : null
}

function removeExistingFile(id: string) {
  removedFileIds.value.push(id)
}
// Suppress the cascading major→year→subject resets while prefilling for edit.
const isPrefilling = ref(false)

const fileInput = ref<HTMLInputElement | null>(null)
const isDragActive = ref(false)
// 0–100 while a create/edit upload is in flight; drives the progress bar.
const uploadProgress = ref(0)

const form = reactive({
  title: '',
  doc_type: '',
  year_level: '',
  academic_year: '',
  major_id: '',
  subject_id: '',
  // Who can see this, as (department, year) pairs — picked one at a time.
  // Empty = no restriction.
  audience: [] as AudienceEntry[],
  // Soft expiry, split across the two inputs: 'YYYY-MM-DD' and 'HH:mm'.
  // An empty date means never; the time only matters once a date is set.
  expires_at: '',
  expires_time: END_OF_DAY,
  // Optional free-text description (replaced tags).
  description: '',
})

const errors = reactive({
  title: '',
  doc_type: '',
  year_level: '',
  academic_year: '',
  major_id: '',
  subject_id: '',
  file: '',
  audience: '',
  expires_at: '',
})

// Picking a department pre-selects its first year (Foundation 1, DFL English,
// departments year 3) so the field is filled in rather than blank — the
// dropdown still offers that department's other years.
watch(
  () => form.major_id,
  (majorId) => {
    if (isPrefilling.value) return
    const acronym = majors.majors.find((m) => m.id === majorId)?.acronym
    form.year_level = majorId ? String(yearLevelsForMajor(acronym)[0]) : ''
  },
)

watch(
  () => [form.major_id, form.year_level],
  async ([majorId, yearLevel]) => {
    if (!isPrefilling.value) form.subject_id = ''
    if (majorId && yearLevel) {
      await subjects.fetchByMajorAndYear(majorId, Number(yearLevel))
    } else if (majorId) {
      await subjects.fetchByMajorAndYear(majorId, 0)
    }
  },
)

// Convert a stored ISO timestamp to the local 'YYYY-MM-DD' a date input expects.
// '' when unset.
function isoToDateInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** The two inputs as one instant. '' date → null (never expires). */
function expiryToIso(date: string, time: string): string | null {
  return dateAndTimeToIso(date, time || END_OF_DAY)
}

// Expiry can't be set in the past.
const todayStr = isoToDateInput(new Date().toISOString())

// Quick-pick presets that set the expiry N days out from today.
const expiryPresets = [
  { key: 'expiresPresetWeek', days: 7 },
  { key: 'expiresPresetMonth', days: 30 },
  { key: 'expiresPreset3Months', days: 90 },
  { key: 'expiresPreset6Months', days: 180 },
  { key: 'expiresPresetYear', days: 365 },
] as const

// The date a preset resolves to (today + N days).
function presetDate(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return isoToDateInput(d.toISOString())
}

// "Expires on" is a required choice, like the audience — but "Never" is an
// answer too, and an empty date can't tell "never" from "not answered yet".
// This flag is what the asterisk actually means.
const expiryChosen = ref(isEditing.value)

function chooseNever() {
  form.expires_at = ''
  form.expires_time = END_OF_DAY
  showCustomDate.value = false
  expiryChosen.value = true
  errors.expires_at = ''
}

function onExpiryDateChange(value: string) {
  expiryChosen.value = !!value
  errors.expires_at = ''
}

// A preset is "active" when it's the chosen expiry and the custom picker is closed.
function isPresetActive(days: number): boolean {
  return (
    !showCustomDate.value &&
    form.expires_at === presetDate(days) &&
    form.expires_time === END_OF_DAY
  )
}

// Picking a preset selects it and collapses the custom picker.
function setExpiryInDays(days: number) {
  form.expires_at = presetDate(days)
  // A preset means "N days from now", which ends at the close of that day.
  form.expires_time = END_OF_DAY
  showCustomDate.value = false
  expiryChosen.value = true
  errors.expires_at = ''
}

// The "+" toggles the custom picker. Opening it always starts from a blank
// date (dd/mm/yyyy) rather than carrying over a preset's calculated date.
function toggleCustomDate() {
  showCustomDate.value = !showCustomDate.value
  if (showCustomDate.value) {
    form.expires_at = ''
    form.expires_time = END_OF_DAY
  }
}

// The expiry this upload already had, so editing something else on a doc that
// has already expired doesn't force the owner to extend it too. Only a CHANGED
// date has to land in the future — the API applies the same rule.
const originalExpiresAt = isoToDateAndTime(props.editDoc?.expires_at)

// The `min` on the date input is only a hint — it can be edited away in the
// browser — so the chosen date is re-checked here (and again on the server).
// A date expires at the END of its local day, so today is still in the future.
function validateExpiry(): string {
  if (!form.expires_at) return '' // '' = never expires
  // Unchanged from what was saved: editing the title of an already-expired
  // upload must not force the owner to extend it as well.
  if (form.expires_at === originalExpiresAt.date && form.expires_time === originalExpiresAt.time)
    return ''
  const iso = expiryToIso(form.expires_at, form.expires_time)
  if (!iso) return t('document.documentUploadModal.errorExpiryInvalid')
  if (new Date(iso).getTime() <= Date.now())
    return t('document.documentUploadModal.errorExpiryPast')
  return ''
}

// Human-readable form of the currently selected expiry ('' → null).
const expirySummary = computed(() => formatExpiry(expiryToIso(form.expires_at, form.expires_time)))

// The custom date picker is shown by default; the "+" chip toggles it (collapse
// to rely on the presets, reopen to pick a specific date).
//
// Editing opens on whatever the upload already had: a saved date shows in the
// picker, and no date collapses it so the "Never" chip reads as selected —
// otherwise nothing on screen would say what the current expiry is.
const showCustomDate = ref(!isEditing.value || !!props.editDoc?.expires_at)

// Prefill the form when editing an existing upload.
if (props.editDoc) {
  const d = props.editDoc
  isPrefilling.value = true
  form.title = d.title ?? ''
  form.doc_type = d.doc_type ?? ''
  form.major_id = d.majors?.id ?? ''
  form.year_level = d.year_level ? String(d.year_level) : ''
  form.academic_year = d.academic_year ?? ''
  form.subject_id = d.subjects?.id ?? ''
  form.audience = [...(d.audience ?? [])]
  form.expires_at = originalExpiresAt.date
  form.expires_time = originalExpiresAt.time || END_OF_DAY
  form.description = d.description ?? ''
  // Let the guarded watchers flush (fetching subjects) before re-enabling resets.
  void nextTick().then(() => {
    isPrefilling.value = false
  })
}

// A language course is asked for Grammar/Speaking/… where a department course
// is asked for Note/TD/… — the doc's major decides which list is offered.
const docTypeOptions = computed(() =>
  (isLanguageDoc.value ? docs.languageDocTypes : docs.departmentDocTypes).map((type) => ({
    value: type,
    label: type,
  })),
)

const majorOptions = computed(() => majors.majors.map((m) => ({ value: m.id, label: m.acronym })))

const subjectOptions = computed(() =>
  subjects.subjects.map((s) => ({ value: s.id, label: s.name })),
)

// Academic years as `YYYY-YYYY`, current year back 7 years — matches
// validateAcademicYear. In edit mode the saved value may predate that window,
// so fold it in to keep the dropdown showing it.
const academicYearOptions = computed(() => {
  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: 8 }, (_, i) => {
    const start = currentYear - i
    return `${start}-${start + 1}`
  })
  if (form.academic_year && !years.includes(form.academic_year)) {
    years.push(form.academic_year)
  }
  return years.map((value) => ({ value, label: value }))
})

const selectedMajorAcronym = computed(
  () => majors.majors.find((m) => m.id === form.major_id)?.acronym,
)

// Foundation covers years 1–2 and departments 3–5. DFL puts its languages in
// the same slot (1 = English, 2 = French), so the field is labelled to match —
// it never reads "Year Level: English".
const yearLevelLabel = computed(() =>
  isLanguageDoc.value
    ? t('document.documentUploadModal.languageLabel')
    : t('document.documentUploadModal.yearLevelLabel'),
)

const yearLevelOptions = computed(() =>
  yearLevelsForMajor(selectedMajorAcronym.value).map((n) => {
    const languageKey = languageLabelKey(selectedMajorAcronym.value, n)
    return { value: String(n), label: languageKey ? t(languageKey) : `Year ${n}` }
  }),
)

// Audience restriction — two independent multi-select axes. The '' option is
// the "no restriction" reset (Everyone / All years); picking it selects them
// all.
//
// Who can see this, built one pair at a time: pick a department, then the year
// within it, and the pair lands in the list as "I3-GIC". Storing pairs (rather
// than a list of departments AND a list of years) is what lets "GIC year 3 and
// AMS year 5" mean exactly that.
//
// The Department of Foreign Languages runs courses every ITC student takes; it
// isn't a department anyone registers into, so it's never offered here — an
// upload aimed at it would match no viewer at all. A doc that BELONGS to it
// carries no audience either: the whole field is hidden and left empty, which
// the backend reads as visible to everyone.
const isLanguageDoc = computed(() => isLanguageMajor(selectedMajorAcronym.value))

// Who can see this, built one answer at a time: the picker opens on the
// departments and drills into that department's years, so "GIC → Third Year"
// lands in the list as "I3-GIC". Storing pairs (rather than a list of
// departments AND a list of years) is what lets "GIC year 3 and AMS year 5"
// mean exactly that. "Everyone" is a choice of its own — no pairs at all, which
// the backend reads as no restriction.
// An upload saved with no pairs was published to everyone, not left unanswered,
// so editing one opens with the Everyone chip already on.
const audienceEveryone = ref(isEditing.value && !(props.editDoc?.audience?.length ?? 0))

const audienceDepartments = computed(() =>
  majors.majors
    .filter((m) => !isLanguageMajor(m.acronym))
    .map((m) => ({
      id: m.id,
      acronym: m.acronym,
      // Only the years that department actually has students in.
      years: yearLevelsForMajor(m.acronym).map((year) => ({
        value: year,
        label: t('document.documentUploadModal.audienceYearN', { year }),
      })),
    })),
)

/** "I3-GIC" — the year first, matching how the subject pages label a level. */
function audienceLabel(entry: AudienceEntry) {
  const acronym = majors.majors.find((m) => m.id === entry.major_id)?.acronym ?? '?'
  return `I${entry.year_level}-${acronym}`
}

function addAudience(choice: { everyone: true } | AudienceEntry) {
  errors.audience = ''
  if ('everyone' in choice) {
    // "Everyone" isn't a restriction, so it replaces whatever was picked.
    audienceEveryone.value = true
    form.audience = []
    return
  }
  const exists = form.audience.some(
    (a: AudienceEntry) => a.major_id === choice.major_id && a.year_level === choice.year_level,
  )
  if (!exists) form.audience.push(choice)
  // A department + year is a restriction, so it replaces "Everyone".
  audienceEveryone.value = false
  // Unless the pairs now add up to every one there is — that is "Everyone"
  // spelled out a chip at a time. Collapse it, so the form says what was
  // actually chosen and the upload is stored unrestricted rather than pinned
  // to today's list of departments.
  if (coversEveryAudiencePair(form.audience, audienceDepartments.value)) {
    audienceEveryone.value = true
    form.audience = []
  }
}

function removeAudience(entry: AudienceEntry) {
  form.audience = form.audience.filter((a: AudienceEntry) => a !== entry)
}

// A language doc has no audience at all; anything already picked is dropped.
watch(isLanguageDoc, (isLanguage) => {
  if (isLanguage) {
    form.audience = []
    audienceEveryone.value = false
  }
})

// Initialise
docs.fetchDocTypes()
majors.fetchMajors()
if (form.major_id) subjects.fetchByMajorAndYear(form.major_id, 0)

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  stageFiles(Array.from(input.files ?? []))
  input.value = '' // allow re-selecting the same file
}

function handleDragOver(event: DragEvent) {
  event.preventDefault()
  isDragActive.value = true
}

function handleDragLeave(event: DragEvent) {
  event.preventDefault()
  isDragActive.value = false
}

function handleDrop(event: DragEvent) {
  event.preventDefault()
  isDragActive.value = false
  stageFiles(Array.from(event.dataTransfer?.files ?? []))
}

function validateAcademicYear(value: string): string {
  if (!value) return t('document.documentUploadModal.errorAcademicYearRequired')
  const match = value.match(/^(\d{4})-(\d{4})$/)
  if (!match) return t('document.documentUploadModal.errorAcademicYearFormat')
  const start = parseInt(match[1] ?? '')
  const end = parseInt(match[2] ?? '')
  if (end !== start + 1)
    return t('document.documentUploadModal.errorAcademicYearEnd', { year: start + 1 })
  return ''
}

function validateTitle() {
  const needsTitle = isEditing.value || uploadedItems.value.length <= 1
  const title = form.title.trim()
  if (needsTitle && !title) {
    errors.title = t('document.documentUploadModal.errorTitleRequired')
  } else if (title.length > 100) {
    errors.title = t('document.documentUploadModal.errorTitleTooLong')
  } else if (title && !TEXT_NAME_PATTERN.test(title)) {
    errors.title = t('document.documentUploadModal.errorTitleInvalid')
  } else {
    errors.title = ''
  }
}

function validate() {
  validateTitle()
  errors.doc_type = form.doc_type ? '' : t('document.documentUploadModal.errorSelectType')
  errors.year_level = form.year_level ? '' : t('document.documentUploadModal.errorSelectYear')
  errors.academic_year = validateAcademicYear(form.academic_year)
  errors.major_id = form.major_id ? '' : t('document.documentUploadModal.errorSelectMajor')
  // Required on the server too (CreateDocumentDto.subject_id).
  errors.subject_id = form.subject_id ? '' : t('document.documentUploadModal.errorSelectSubject')
  // An upload must end up with at least one file.
  const totalFiles = isEditing.value
    ? existingFiles.value.length + uploadedItems.value.length
    : uploadedItems.value.length
  errors.file = isStaging.value
    ? t('document.documentUploadModal.errorFilesStillUploading')
    : totalFiles >= 1
      ? ''
      : t('document.documentUploadModal.errorSelectFile')
  errors.expires_at = expiryChosen.value
    ? validateExpiry()
    : t('document.documentUploadModal.errorSelectExpiry')
  // A language course has no audience to answer for — the field is hidden.
  errors.audience =
    isLanguageDoc.value || audienceEveryone.value || form.audience.length
      ? ''
      : t('document.documentUploadModal.errorSelectAudience')
  return !Object.values(errors).some(Boolean)
}

/**
 * An edit is confirmed before it is saved, so an accidental change is caught
 * while it can still be undone. A new upload has nothing to compare against,
 * and an edit that changed nothing has nothing to confirm.
 */
const pendingChanges = ref<FieldChange[]>([])

function labelFor(id: string | undefined, options: { value: string; label: string }[]) {
  return options.find((o) => o.value === id)?.label ?? ''
}

function collectChanges(): FieldChange[] {
  const doc = props.editDoc
  if (!doc) return []
  const changes: FieldChange[] = []
  const add = (label: string, from: string, to: string) => {
    if (from !== to) changes.push({ label, from, to })
  }

  add(t('document.documentUploadModal.title'), doc.title, form.title.trim())
  add(t('document.documentUploadModal.typeLabel'), doc.doc_type, form.doc_type)
  add(
    t('document.documentUploadModal.majorLabel'),
    labelFor(doc.majors?.id, majorOptions.value),
    labelFor(form.major_id, majorOptions.value),
  )
  add(
    t('document.documentUploadModal.subjectLabel'),
    labelFor(doc.subjects?.id, subjectOptions.value),
    labelFor(form.subject_id, subjectOptions.value),
  )
  add(
    t('document.documentUploadModal.yearLevelLabel'),
    String(doc.year_level ?? ''),
    String(form.year_level ?? ''),
  )
  add(
    t('document.documentUploadModal.academicYearLabel'),
    doc.academic_year ?? '',
    form.academic_year,
  )
  add(
    t('document.documentUploadModal.descriptionLabel'),
    doc.description ?? '',
    form.description.trim(),
  )
  /**
   * Who it reaches. Was missing entirely, so narrowing a document from
   * "Everyone" to one cohort — the change with the largest effect on who can
   * read it — was the one change the confirmation never mentioned.
   *
   * Compared as the rendered label rather than the raw pairs: the reader is
   * being asked about "I3-GIC, I4-GIC", and reordering the same pairs is not
   * a change worth stopping them for.
   */
  const audienceNames = (entries: AudienceEntry[] | null | undefined) =>
    sharedAudienceLabel(entries, majors.majors, t('document.documentUploadModal.audienceEveryone'))
  add(
    t('document.documentUploadModal.audienceMajorLabel'),
    audienceNames(doc.audience),
    audienceNames(form.audience),
  )

  /**
   * Expiry, including the TIME. This compared dates only, so moving an expiry
   * from 23:59 to 09:00 on the same day reported no change at all — and with
   * no changes the dialog never opened, so the edit saved silently.
   */
  add(
    t('document.documentUploadModal.expiresLabel'),
    formatExpiry(doc.expires_at) ?? t('common.confirmChanges.never'),
    formatExpiry(expiryToIso(form.expires_at, form.expires_time)) ??
      t('common.confirmChanges.never'),
  )

  // Files are counted rather than listed: the tiles above already show which.
  if (removedFileIds.value.length)
    changes.push({
      label: t('common.confirmChanges.filesRemoved'),
      from: String(props.editDoc?.documents?.length ?? 0),
      to: String(existingFiles.value.length),
    })
  if (uploadedItems.value.length)
    changes.push({
      label: t('common.confirmChanges.filesAdded'),
      from: '',
      to: String(uploadedItems.value.length),
    })

  return changes
}

/**
 * The form's scrolling body — the errors live inside it.
 *
 * Submitting used to `return` on a failed validation and say nothing. Half
 * this form is below the fold, so a missing file or title set an error the
 * reader could not see and the button simply appeared dead. Nothing was
 * broken; the explanation was just off-screen.
 */
const body = ref<HTMLElement | null>(null)

async function revealFirstError() {
  await nextTick()
  // DOM order is field order, so the first error message is the topmost one.
  body.value?.querySelector('.text-red-600')?.scrollIntoView({
    behavior: 'smooth',
    block: 'center',
  })
}

function submit() {
  if (!validate()) {
    showToast(t('common.toast.fixFields'), { type: 'error' })
    void revealFirstError()
    return
  }
  if (isEditing.value) {
    const changes = collectChanges()
    if (changes.length) {
      pendingChanges.value = changes
      return
    }
  }
  void save()
}

async function save() {
  uploadProgress.value = 0

  // Edit mode — update metadata, remove marked files, add new files.
  if (isEditing.value && props.editDoc) {
    try {
      await docs.updateDocument(props.editDoc.id, {
        title: form.title.trim(),
        doc_type: form.doc_type,
        year_level: Number(form.year_level),
        academic_year: form.academic_year || undefined,
        major_id: form.major_id,
        subject_id: form.subject_id || null,
        audience: form.audience,
        expires_at: expiryToIso(form.expires_at, form.expires_time),
        description: form.description.trim() || null,
      })
      // Add first so removing the old files never trips the "keep ≥1 file" guard.
      // The bytes are already on the server — hand over the staged ids.
      if (uploadedItems.value.length) {
        await docs.addStagedFiles(
          props.editDoc.id,
          uploadedItems.value.map((i) => i.id!),
        )
      }
      for (const fileId of removedFileIds.value) {
        await docs.removeFile(fileId)
      }
      clearDraft(draftContext.value)
      pendingChanges.value = []
      emit('uploaded')
      emit('close')
    } catch {
      // docs.error is set by store
    }
    return
  }

  // The bytes are already on the server — send the handles.
  const formData = new FormData()
  formData.append('staged_file_ids', JSON.stringify(uploadedItems.value.map((i) => i.id)))
  formData.append('title', form.title)
  formData.append('doc_type', form.doc_type)
  if (form.year_level) formData.append('year_level', form.year_level)
  if (form.academic_year) formData.append('academic_year', form.academic_year)
  formData.append('major_id', form.major_id)
  if (form.subject_id) formData.append('subject_id', form.subject_id)
  formData.append('audience', JSON.stringify(form.audience))
  if (form.expires_at)
    formData.append('expires_at', expiryToIso(form.expires_at, form.expires_time)!)
  if (form.description.trim()) formData.append('description', form.description.trim())

  try {
    await docs.upload(formData, (p) => {
      uploadProgress.value = p
    })
    showToast(t('common.toast.uploadSuccess'))
    clearDraft(draftContext.value)
    emit('uploaded')
    emit('close')
  } catch {
    // docs.error is set by store
  }
}

// ── Files ──────────────────────────────────────────────────────────────────
// Each picked file goes to the server the moment it's chosen, so the transfer
// overlaps with filling in the form; the tile shows its own progress. Files
// already on the upload (edit mode) sit in the same row.
type StagedItem = {
  /** Kept so a failed row can be retried without re-picking the file. */
  file: File
  name: string
  sizeKb: number
  progress: number
  // 'processing': the bytes are all sent and the server is still working —
  // Office files get converted to a PDF preview, which takes a moment.
  status: 'uploading' | 'processing' | 'done' | 'error'
  id?: string
  error?: string
  /** Object URL for an image thumbnail; revoked when the row goes away. */
  previewUrl?: string
}

const stagedItems = ref<StagedItem[]>([])
const uploadedItems = computed(() => stagedItems.value.filter((i) => i.status === 'done'))
const isStaging = computed(() =>
  stagedItems.value.some((i) => i.status === 'uploading' || i.status === 'processing'),
)

function isPending(item: StagedItem) {
  return item.status === 'uploading' || item.status === 'processing'
}

async function sendStagedItem(item: StagedItem) {
  item.status = 'uploading'
  item.progress = 0
  item.error = undefined
  try {
    const staged = await docs.stageFile(item.file, (percent) => {
      item.progress = percent
      // The last byte is sent long before the response comes back.
      if (percent >= 100) item.status = 'processing'
    })
    item.id = staged.id
    item.progress = 100
    item.status = 'done'
  } catch (e: unknown) {
    item.status = 'error'
    item.error =
      (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
      t('document.documentUploadModal.errorFileUploadFailed')
  }
}

function retryStagedItem(item: StagedItem) {
  void sendStagedItem(item)
}

// Appends, de-duping by name+size so the same file isn't staged twice.
function stageFiles(files: File[]) {
  if (!files.length) return
  errors.file = ''

  /**
   * Refuse an oversize file HERE, before a byte is sent.
   *
   * The server enforces the same cap, but only after the whole file has been
   * uploaded — so a 300 MB pick used to mean a long progress bar and then a
   * failure. Catching it on the client makes the answer instant, and the
   * message can name the file's actual size, which is what tells the reader
   * whether to compress it or split it.
   */
  const tooBig = files.filter((f) => f.size > MAX_FILE_SIZE_BYTES)
  if (tooBig.length) {
    errors.file = t('document.documentUploadModal.errorFileTooLarge', {
      name: tooBig[0]!.name,
      size: formatFileSize(Math.round(tooBig[0]!.size / 1024)),
      max: `${MAX_FILE_MB} MB`,
    })
    files = files.filter((f) => f.size <= MAX_FILE_SIZE_BYTES)
    if (!files.length) return
  }

  const seen = new Set(stagedItems.value.map((i) => `${i.name}-${i.sizeKb}`))
  const firstFile = files[0]
  if (files.length === 1 && firstFile && !form.title) {
    form.title = sanitizeTextName(firstFile.name.replace(/\.[^.]+$/, ''))
  }
  for (const file of files) {
    const sizeKb = Math.round(file.size / 1024)
    if (seen.has(`${file.name}-${sizeKb}`)) continue
    const item = reactive<StagedItem>({
      file,
      name: file.name,
      sizeKb,
      progress: 0,
      status: 'uploading',
      previewUrl: isImageFile(file.name) ? URL.createObjectURL(file) : undefined,
    })
    stagedItems.value.push(item)
    void sendStagedItem(item)
  }
}

// Dropping a staged file discards the object on the server too.
function removeStagedItem(item: StagedItem) {
  hideName()
  stagedItems.value = stagedItems.value.filter((i) => i !== item)
  if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
  if (item.id) void docs.deleteStagedFile(item.id).catch(() => {})
}

// The tile row scrolls sideways and a scroll box can't paint outside itself, so
// the name popup is teleported to <body> and positioned against the tile.
const hoveredName = ref('')
const hoveredAt = reactive({ left: 0, top: 0 })

function showName(name: string, event: MouseEvent) {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  hoveredName.value = name
  hoveredAt.left = rect.left + rect.width / 2
  hoveredAt.top = rect.bottom + 8
}

function hideName() {
  hoveredName.value = ''
}

// Esc closes; Enter submits — except where Enter already means something else.
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    emit('close')
    return
  }
  if (event.key !== 'Enter') return
  const target = event.target as HTMLElement | null
  if (event.isComposing || target?.tagName === 'TEXTAREA' || target?.tagName === 'BUTTON') return
  if (docs.loading || isStaging.value) return
  event.preventDefault()
  void submit()
}

// ── Draft ──────────────────────────────────────────────────────────────────
// Closing this form — deliberately or by a stray click on the backdrop — keeps
// what was typed, for this page session only. Keyed by the document being
// edited so a new upload and an edit never overwrite each other.
const draftContext = computed(() => `doc:${props.editDoc?.id ?? 'new'}`)

type Draft = {
  form: Partial<typeof form>
  audienceEveryone: boolean
  expiryChosen: boolean
  showCustomDate: boolean
  removedFileIds: string[]
  /** The File itself, not a URL: the draft lives in memory, and keeping the
   *  file is what lets the thumbnail be rebuilt after its blob is revoked. */
  files: { file: File; name: string; sizeKb: number; id?: string }[]
}

function saveDraft() {
  writeDraft(draftContext.value, {
    form: { ...form },
    audienceEveryone: audienceEveryone.value,
    expiryChosen: expiryChosen.value,
    showCustomDate: showCustomDate.value,
    removedFileIds: [...removedFileIds.value],
    files: uploadedItems.value.map((item) => ({
      file: item.file,
      name: item.name,
      sizeKb: item.sizeKb,
      id: item.id,
    })),
  } satisfies Draft)
}

/**
 * Restores what was typed, or gives up and starts clean.
 *
 * Runs during setup, so anything it throws takes the whole modal with it — and
 * since the draft lives in module scope the same throw would repeat on every
 * reopen. A draft is a convenience; it is never worth that.
 */
function restoreDraft() {
  const draft = readDraft<Draft>(draftContext.value)
  if (!draft) return
  try {
    Object.assign(form, draft.form)
    audienceEveryone.value = draft.audienceEveryone
    expiryChosen.value = draft.expiryChosen
    showCustomDate.value = draft.showCustomDate
    removedFileIds.value = [...(draft.removedFileIds ?? [])]
    stagedItems.value = (draft.files ?? []).map((file) =>
      reactive<StagedItem>({
        file: file.file,
        name: file.name,
        sizeKb: file.sizeKb,
        progress: 100,
        status: 'done',
        id: file.id,
        // Rebuilt from the file: the previous object URL was revoked when the
        // modal last closed.
        previewUrl: isImageFile(file.name) ? URL.createObjectURL(file.file) : undefined,
      }),
    )
  } catch (err) {
    console.error('Could not restore the document draft; starting a fresh form.', err)
    clearDraft(draftContext.value)
  }
}

// Saved as the user types, coalesced so a keystroke isn't a write.
let draftTimer: ReturnType<typeof setTimeout>
watch(
  [form, stagedItems, audienceEveryone, expiryChosen, removedFileIds],
  () => {
    // Prefilling an edit is not the user typing.
    if (isPrefilling.value) return
    clearTimeout(draftTimer)
    draftTimer = setTimeout(saveDraft, 300)
  },
  { deep: true },
)

onMounted(() => document.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  // Otherwise the debounced save fires ~300ms after the modal is gone.
  clearTimeout(draftTimer)
  for (const item of stagedItems.value) {
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
  }
})

// Last, deliberately: restoreDraft() assigns to refs declared throughout this
// file, and a `const` cannot be read before its own line has run.
restoreDraft()
</script>

<template>
  <!-- Backdrop — click outside or Esc closes; the panel matches the upload
       modal so create and edit look like one flow. -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-6"
    @click.self="emit('close')"
  >
    <div
      class="flex max-h-[65dvh] w-full max-w-sm flex-col sm:max-h-[90dvh] overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-black/10 md:max-w-md"
    >
      <!-- Header -->
      <div class="relative border-b border-black/5 px-5 py-4">
        <p class="text-center text-xl font-bold text-black">
          {{
            isEditing
              ? t('document.documentUploadModal.editTitle')
              : t('document.documentUploadModal.docUpload')
          }}
        </p>
        <button
          type="button"
          class="absolute right-4 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-gray-400 transition hover:bg-primary/10 hover:text-primary hover:cursor-pointer"
          aria-label="Close"
          @click="emit('close')"
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

      <!-- Scrollable form body -->
      <div ref="body" class="min-h-0 flex-1 space-y-3 overflow-y-auto scrollbar-hide px-5 py-4">
        <!-- Server error -->
        <p v-if="docs.error" class="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">
          {{ docs.error }}
        </p>

        <!-- File drop zone (also adds files to an existing upload) -->
        <div class="space-y-3">
          <!-- Kept outside the drop zone: that zone disappears once files are
               attached, and the "Add" tile still needs this input to click. -->
          <input
            ref="fileInput"
            type="file"
            class="hidden"
            accept=".pdf,.doc,.docx,.ppt,.pptx,.jpg,.jpeg,.png,.zip,.rar"
            multiple
            @change="onFileChange"
          />

          <!-- The full drop zone only while nothing is attached; after that it
               shrinks to the "Add" tile beside the files. -->
          <div
            v-if="!stagedItems.length && !existingFiles.length"
            class="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-5 py-3 text-center transition sm:py-6"
            :class="
              isDragActive
                ? 'border-primary bg-[#F3F8FF]'
                : 'border-[#D3D3D3] bg-[#FAFAFA] hover:border-primary hover:bg-[#F3F8FF]'
            "
            @click="fileInput?.click()"
            @dragover="handleDragOver"
            @dragleave="handleDragLeave"
            @drop="handleDrop"
          >
            <div
              class="mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary sm:mb-3 sm:h-12 sm:w-12"
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
          </div>

          <ul
            v-if="existingFiles.length"
            class="flex items-start gap-2.5 overflow-x-auto scrollbar-hide px-1.5 pb-1 pt-2"
          >
            <li
              v-for="file in existingFiles"
              :key="file.id"
              class="group relative shrink-0"
              @mouseenter="showName(file.original_name ?? 'file', $event)"
              @mouseleave="hideName"
            >
              <div class="relative h-16 w-16 overflow-hidden rounded-2xl border border-[#E5E7EB]">
                <img
                  v-if="existingPreview(file)"
                  :src="existingPreview(file)!"
                  :alt="file.original_name ?? ''"
                  class="h-full w-full object-cover"
                />
                <FileTypeIcon
                  v-else
                  :name="file.original_name"
                  variant="soft"
                  :size="64"
                  rounded="rounded-2xl"
                  with-label
                />
              </div>
              <button
                type="button"
                class="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white/90 text-gray-800 opacity-0 shadow-sm transition hover:bg-white hover:cursor-pointer group-hover:opacity-100 focus:opacity-100"
                :aria-label="`Remove ${file.original_name}`"
                @click="(hideName(), removeExistingFile(file.id))"
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

          <!-- Files being added now — each uploads as soon as it was picked. The
               label only matters while both rows are on screen. -->
          <p v-if="isEditing && stagedItems.length" class="px-1.5 text-xs font-medium text-primary">
            {{ t('document.documentUploadModal.newFiles') }}
          </p>
          <ul
            v-if="stagedItems.length || existingFiles.length"
            class="flex items-start gap-2.5 overflow-x-auto scrollbar-hide px-1.5 pb-1 pt-2"
            @dragover="handleDragOver"
            @dragleave="handleDragLeave"
            @drop="handleDrop"
          >
            <!-- Add more: same 64px square as a file tile. -->
            <li class="shrink-0">
              <button
                type="button"
                class="flex h-16 w-16 flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed text-center transition hover:cursor-pointer"
                :class="
                  isDragActive
                    ? 'border-primary bg-[#F3F8FF] text-primary'
                    : 'border-[#D3D3D3] text-gray-400 hover:border-primary hover:bg-[#F3F8FF] hover:text-primary'
                "
                @click="fileInput?.click()"
              >
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
              </button>
            </li>

            <li
              v-for="item in stagedItems"
              :key="`${item.name}-${item.sizeKb}`"
              class="group relative shrink-0"
              @mouseenter="showName(item.name, $event)"
              @mouseleave="hideName"
            >
              <div
                class="relative h-16 w-16 overflow-hidden rounded-2xl border"
                :class="item.status === 'error' ? 'border-red-300' : 'border-[#E5E7EB]'"
              >
                <img
                  v-if="item.previewUrl"
                  :src="item.previewUrl"
                  :alt="item.name"
                  class="h-full w-full object-cover"
                />
                <FileTypeIcon
                  v-else
                  :name="item.name"
                  variant="soft"
                  :size="64"
                  rounded="rounded-2xl"
                  with-label
                />

                <!-- Busy: dim the tile and spin over it. -->
                <div
                  v-if="isPending(item)"
                  class="absolute inset-0 flex items-center justify-center bg-white/70"
                >
                  <RingSpinner :size="20" :stroke="2.5" class="text-primary" />
                </div>

                <!-- Failed: the whole tile becomes the retry button. -->
                <button
                  v-else-if="item.status === 'error'"
                  type="button"
                  class="absolute inset-0 flex flex-col items-center justify-center gap-0.5 bg-red-50/90 text-[10px] font-semibold text-red-600 hover:cursor-pointer"
                  :title="item.error"
                  @click="retryStagedItem(item)"
                >
                  <svg
                    class="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M4 4v5h5M20 20v-5h-5M20 9a8 8 0 00-14.9-2M4 15a8 8 0 0014.9 2"
                    />
                  </svg>
                  {{ t('document.documentUploadModal.tryAgain') }}
                </button>

                <!-- Hairline progress along the bottom edge while sending. -->
                <div
                  v-if="item.status === 'uploading'"
                  class="absolute inset-x-1.5 bottom-1.5 h-0.5 overflow-hidden rounded-full bg-gray-200"
                >
                  <div
                    class="h-full rounded-full bg-primary transition-all duration-200"
                    :style="{ width: `${item.progress}%` }"
                  />
                </div>
              </div>

              <button
                type="button"
                class="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white/90 text-gray-800 opacity-0 shadow-sm transition hover:bg-white hover:cursor-pointer group-hover:opacity-100 focus:opacity-100"
                :aria-label="`Remove ${item.name}`"
                @click="removeStagedItem(item)"
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

          <!-- Progress while the request is in flight -->
          <div v-if="docs.loading" class="space-y-1">
            <div class="flex items-center justify-between text-xs font-medium text-gray-500">
              <span>
                {{
                  uploadProgress >= 100
                    ? t('document.documentUploadModal.processing')
                    : t('document.documentUploadModal.uploading')
                }}
              </span>
              <span>{{ uploadProgress }}%</span>
            </div>
            <div class="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                class="h-full rounded-full bg-primary transition-all duration-200"
                :style="{ width: `${uploadProgress}%` }"
              />
            </div>
          </div>

          <p v-if="errors.file" class="text-sm text-red-600">{{ errors.file }}</p>
        </div>

        <!-- Title -->
        <div class="space-y-2">
          <label class="text-sm font-medium text-black">
            {{ t('document.documentUploadModal.title') }} <span class="text-red-500">*</span>
          </label>
          <input
            v-model="form.title"
            type="text"
            :placeholder="t('document.documentUploadModal.titlePlaceholder')"
            class="w-full rounded-xl border border-[#D9D9D9] bg-white px-4 py-2.5 text-sm outline-none transition focus:border-primary"
            :class="errors.title ? 'border-red-400' : ''"
            @blur="validateTitle"
          />
          <p v-if="errors.title" class="text-sm text-red-600">{{ errors.title }}</p>
        </div>

        <!-- Type + Academic Year, Major + Year Level -->
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-2">
            <label class="text-sm font-medium text-black">
              {{ t('document.documentUploadModal.typeLabel') }} <span class="text-red-500">*</span>
            </label>
            <SelectDropdown
              v-model="form.doc_type"
              :placeholder="t('document.documentUploadModal.selectTypePlaceholder')"
              :options="docTypeOptions"
              @change="
                errors.doc_type = form.doc_type
                  ? ''
                  : t('document.documentUploadModal.errorSelectType')
              "
            />
            <p v-if="errors.doc_type" class="text-sm text-red-600">{{ errors.doc_type }}</p>
          </div>

          <div class="space-y-2">
            <label class="text-sm font-medium text-black">
              {{ t('document.documentUploadModal.academicYearLabel') }}
              <span class="text-red-500">*</span>
            </label>
            <SelectDropdown
              v-model="form.academic_year"
              :placeholder="t('document.documentUploadModal.academicYearPlaceholder')"
              :options="academicYearOptions"
              @change="errors.academic_year = validateAcademicYear(form.academic_year)"
            />
            <p v-if="errors.academic_year" class="text-sm text-red-600">
              {{ errors.academic_year }}
            </p>
          </div>

          <div class="space-y-2">
            <label class="text-sm font-medium text-black">
              {{ t('document.documentUploadModal.majorLabel') }} <span class="text-red-500">*</span>
            </label>
            <SelectDropdown
              v-model="form.major_id"
              :placeholder="t('document.documentUploadModal.selectMajorPlaceholder')"
              :options="majorOptions"
              @change="
                errors.major_id = form.major_id
                  ? ''
                  : t('document.documentUploadModal.errorSelectMajor')
              "
            />
            <p v-if="errors.major_id" class="text-sm text-red-600">{{ errors.major_id }}</p>
          </div>

          <div class="space-y-2">
            <label class="text-sm font-medium text-black">
              {{ yearLevelLabel }} <span class="text-red-500">*</span>
            </label>
            <SelectDropdown
              v-model="form.year_level"
              :placeholder="t('document.documentUploadModal.yearLevelPlaceholder')"
              :options="yearLevelOptions"
              @change="
                errors.year_level = form.year_level
                  ? ''
                  : t('document.documentUploadModal.errorSelectYear')
              "
            />
            <p v-if="errors.year_level" class="text-sm text-red-600">{{ errors.year_level }}</p>
          </div>
        </div>

        <!-- Subject -->
        <div v-if="form.major_id && form.year_level" class="space-y-2">
          <label class="text-sm font-medium text-black">
            {{ t('document.documentUploadModal.subjectLabel') }} <span class="text-red-500">*</span>
          </label>
          <SelectDropdown
            v-if="subjectOptions.length"
            v-model="form.subject_id"
            :placeholder="t('document.documentUploadModal.selectSubjectPlaceholder')"
            :options="subjectOptions"
          />
          <p v-else class="text-sm text-amber-600">
            {{ t('document.documentUploadModal.noSubjects') }}
          </p>
          <p v-if="errors.subject_id" class="text-sm text-red-600">{{ errors.subject_id }}</p>
        </div>

        <!-- Audience: department, then year, one pair at a time. Everyone takes
             the language courses, so those docs skip this entirely. -->
        <div v-if="!isLanguageDoc" class="space-y-2">
          <label class="text-sm font-medium text-black">
            {{ t('document.documentUploadModal.audienceMajorLabel') }}
            <span class="text-red-500">*</span>
          </label>

          <AudiencePicker
            :departments="audienceDepartments"
            :placeholder="t('document.documentUploadModal.audienceMajorPlaceholder')"
            :everyone-label="t('document.documentUploadModal.audienceEveryone')"
            :all-years-label="t('document.documentUploadModal.audienceAllYears')"
            @select="addAudience"
          />

          <!-- The pairs picked so far. -->
          <div v-if="audienceEveryone || form.audience.length" class="flex flex-wrap gap-2">
            <span
              v-if="audienceEveryone"
              class="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-2 py-1 text-xs font-medium text-primary"
            >
              {{ t('document.documentUploadModal.audienceEveryone') }}
              <button
                type="button"
                class="flex h-4 w-4 items-center justify-center rounded text-primary transition hover:bg-primary/15 hover:cursor-pointer"
                :aria-label="t('document.documentUploadModal.audienceEveryone')"
                @click="audienceEveryone = false"
              >
                <svg
                  class="h-3 w-3"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  viewBox="0 0 24 24"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>

            <span
              v-for="entry in form.audience"
              :key="`${entry.major_id}-${entry.year_level}`"
              class="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-2 py-1 text-xs font-medium text-primary"
            >
              {{ audienceLabel(entry) }}
              <button
                type="button"
                class="flex h-4 w-4 items-center justify-center rounded text-primary transition hover:bg-primary/15 hover:cursor-pointer"
                :aria-label="`Remove ${audienceLabel(entry)}`"
                @click="removeAudience(entry)"
              >
                <svg
                  class="h-3 w-3"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  viewBox="0 0 24 24"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          </div>

          <p v-if="errors.audience" class="text-sm text-red-600">{{ errors.audience }}</p>
        </div>

        <!-- Expiry -->
        <div class="space-y-2">
          <label class="text-sm font-medium text-black">
            {{ t('document.documentUploadModal.expiresLabel') }} <span class="text-red-500">*</span>
          </label>

          <div class="flex gap-2 overflow-x-auto scrollbar-hide">
            <ChipButton :active="showCustomDate" @click="toggleCustomDate()">+</ChipButton>
            <ChipButton :active="!form.expires_at && !showCustomDate" @click="chooseNever">
              {{ t('document.documentUploadModal.expiresNever') }}
            </ChipButton>
            <ChipButton
              v-for="preset in expiryPresets"
              :key="preset.key"
              :active="isPresetActive(preset.days)"
              @click="setExpiryInDays(preset.days)"
            >
              {{ t(`document.documentUploadModal.${preset.key}`) }}
            </ChipButton>
          </div>

          <!-- Date and time side by side from sm up, stacked on a phone. The
               time only appears once there is a date to attach it to: a time
               with no date expires nothing, and an input that cannot do
               anything yet is a question the reader has to dismiss. -->
          <div v-if="showCustomDate" class="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-start">
            <div class="space-y-1">
              <span class="text-xs text-gray-500">
                {{ t('document.documentUploadModal.expiresDateLabel') }}
              </span>
              <DateField
                v-model="form.expires_at"
                :min="todayStr"
                @update:model-value="onExpiryDateChange"
              />
            </div>

            <div v-if="form.expires_at" class="space-y-1 sm:w-40">
              <span class="text-xs text-gray-500">
                {{ t('document.documentUploadModal.expiresTimeLabel') }}
              </span>
              <TimeField v-model="form.expires_time" />
            </div>
          </div>

          <p v-if="errors.expires_at" class="text-sm text-red-600">{{ errors.expires_at }}</p>

          <!-- The chosen expiry in words, weekday and time included. Always
               shown once a choice exists — "Never" too, because a highlighted
               chip alone does not read as the current value, and dd/mm/yyyy in
               a box does not read as a day of the week. -->
          <p
            v-if="isEditing || expiryChosen"
            class="flex items-center gap-1.5 text-xs"
            :class="expirySummary ? 'text-primary' : 'text-gray-500'"
          >
            <svg
              class="h-3.5 w-3.5 shrink-0"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              viewBox="0 0 24 24"
            >
              <circle cx="12" cy="12" r="9" />
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 7v5l3 2" />
            </svg>
            <span>
              {{
                t('document.documentUploadModal.expiresCurrent', {
                  value: expirySummary ?? t('document.documentUploadModal.expiresNeverValue'),
                })
              }}
            </span>
          </p>
        </div>

        <!-- Description -->
        <div class="space-y-2">
          <label class="text-sm font-medium text-black">
            {{ t('document.documentUploadModal.descriptionLabel') }}
          </label>
          <textarea
            v-model="form.description"
            rows="3"
            maxlength="500"
            :placeholder="t('document.documentUploadModal.descriptionPlaceholder')"
            class="w-full resize-y rounded-xl border border-[#D9D9D9] bg-white px-4 py-2.5 text-sm outline-none transition focus:border-primary"
          />
          <p class="text-right text-xs text-gray-400">{{ form.description.length }}/500</p>
        </div>

        <!-- Actions -->
        <div class="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            :disabled="docs.loading || isStaging"
            class="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60 hover:cursor-pointer"
            @click="submit"
          >
            <span v-if="docs.loading" class="flex items-center gap-2">
              <RingSpinner :size="16" :stroke="2.5" />
              {{
                isEditing
                  ? t('document.documentUploadModal.saving')
                  : t('document.documentUploadModal.uploading')
              }}
            </span>
            <span v-else>
              {{
                isEditing
                  ? t('document.documentUploadModal.saveButton')
                  : t('document.documentUploadModal.uploadButton')
              }}
            </span>
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Name popup for the hovered file. Teleported so no scroll box clips it. -->
  <Teleport to="body">
    <p
      v-if="hoveredName"
      class="pointer-events-none fixed z-[60] max-w-[240px] -translate-x-1/2 truncate rounded-full bg-[#E6F4F8] px-3 py-1.5 text-center text-[11px] font-medium text-primary shadow-sm"
      :style="{ left: `${hoveredAt.left}px`, top: `${hoveredAt.top}px` }"
    >
      {{ hoveredName }}
    </p>
  </Teleport>

  <ConfirmChangesModal
    v-if="pendingChanges.length"
    :changes="pendingChanges"
    :loading="docs.loading || isStaging"
    @cancel="pendingChanges = []"
    @confirm="save"
  />
</template>
