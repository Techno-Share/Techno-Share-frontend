<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth.store'
import { useDocumentsStore } from '@/stores/documents.store'
import { isExpired, yearMajorLabel } from '@/utils/format'
import ConfirmDeleteModal from '@/components/base/ConfirmDeleteModal.vue'
import RowActionsMenu, { type RowAction } from '@/components/base/RowActionsMenu.vue'
import type { Upload } from '@/types/documents.types'

const { t } = useI18n({ useScope: 'global' })
const auth = useAuthStore()
const docs = useDocumentsStore()
const router = useRouter()

const props = defineProps<{
  /**
   * The same feed upload DocumentCard takes. It was a hand-written subset of
   * these fields, which is how the two drifted — the list offered two menu
   * entries where the grid offered four, for the very same document.
   * `doc.id` is the upload id, not a file id.
   */
  doc: Upload
  showOwnerColumns?: boolean
  fileCount?: number
  /**
   * Draw "Under review" in amber instead of grey. Set by the owner's dashboard
   * only — see statusBadge for why the feed keeps it grey.
   */
  highlightPending?: boolean
}>()

const emit = defineEmits<{
  (e: 'deleted', id: string): void
  /** Owner toggled visibility — the parent reloads. */
  (e: 'hidden-changed', id: string): void
  /** Anyone pinned/unpinned it — the parent reloads so the order updates. */
  (e: 'pinned-changed', id: string): void
  (e: 'edit', doc: Upload): void
}>()

const isHidden = computed(() => !!props.doc.hidden_at)

/**
 * Pinning and hiding both act on a document's place in circulation, and an
 * unpublished one has no place in it: pending and rejected documents reach
 * nobody but their uploader.
 *
 * Offering them was not harmless. Pin already 404s on the server — see
 * DocumentsService.setPinned, which refuses anything non-active — so the entry
 * was there, did nothing when clicked, and said nothing about why. Pending
 * uploads also sort to the top of their owner's own listing already, so there
 * was nothing for a pin to achieve even if it had worked.
 */
const isPublished = computed(() => props.doc.status === 'active')

/** A refused upload is closed: no editing it, and no adding files to it. */
const isRejected = computed(() => props.doc.status === 'rejected')
const togglingHidden = ref(false)

/**
 * The one badge in the status column, as a computed rather than the nested
 * ternary this used to be in the template — a fourth state made that
 * unreadable, and the precedence is the part worth being able to see.
 *
 * Hidden first: it is the owner's own switch and outranks anything the
 * document did on its own. Then the review states. Expiry comes last because
 * it only ever replaces "published" — a pending or rejected upload was never
 * in anyone's feed, so calling it expired answers a question nobody asked.
 */
const statusBadge = computed(() => {
  if (isHidden.value)
    return { label: t('dashboard.documents.statusHidden'), tone: 'bg-gray-200 text-gray-600' }
  if (props.doc.status === 'rejected')
    return { label: t('dashboard.documents.statusRejected'), tone: 'bg-red-100 text-red-700' }
  if (props.doc.status === 'pending')
    /**
     * Amber on the dashboard, grey everywhere else.
     *
     * The dashboard is where you manage your own submissions, so a pending row
     * is a thing you are waiting on and worth drawing the eye to. In the feed
     * and on a subject page the same card is already drawn muted because
     * nobody else can see it, and an amber pill inside a greyed-out card
     * argues with itself.
     */
    return props.highlightPending
      ? { label: t('dashboard.documents.statusPending'), tone: 'bg-amber-100 text-amber-700' }
      : { label: t('dashboard.documents.statusPending'), tone: 'bg-gray-200 text-gray-600' }
  if (isExpired(props.doc.expires_at))
    return { label: t('dashboard.documents.statusExpired'), tone: 'bg-gray-200 text-gray-600' }
  return { label: t('dashboard.documents.statusActive'), tone: 'bg-primary/10 text-primary' }
})

/** Both are owner actions, available wherever your row appears. */
/**
 * The same four entries DocumentCard offers, in the same order — the grid and
 * the list are two renderings of one document, and a menu that gained Pin and
 * Edit only in the grid made the view toggle change what you could do.
 *
 * Pin is offered to everyone: it bookmarks someone else's document to the top
 * of YOUR listings, so it is not an owner privilege. Editing, hiding and
 * deleting change the document itself and stay with its uploader.
 *
 * Both pin and hide are withheld while the document is unpublished; see
 * isPublished. Edit and delete are not — the uploader fixing or withdrawing
 * their own submission is exactly what review is waiting on.
 */
const rowActions = computed<RowAction[]>(() => [
  ...(isPublished.value
    ? [
        {
          // Two keys for one toggle: the menu resolves its icon from the key,
          // so the entry has to say which direction it goes.
          key: isPinned.value ? 'unpinned' : 'pinned',
          label: isPinned.value ? t('dashboard.documents.unpin') : t('dashboard.documents.pin'),
        },
      ]
    : []),
  ...(isOwner.value
    ? [
        // Not on a rejected upload: that decision is closed, and the server
        // refuses the edit anyway — see DocumentsService.update.
        ...(isRejected.value ? [] : [{ key: 'edit', label: t('document.DocumentCard.edit') }]),
        // Hiding only means something once the document is published: there
        // is no circulation to withdraw a pending or rejected one from. The
        // server refuses it too — see DocumentsService.setHidden.
        ...(isPublished.value
          ? [
              {
                key: isHidden.value ? 'unhidden' : 'hidden',
                label: isHidden.value
                  ? t('dashboard.documents.unhide')
                  : t('dashboard.documents.hide'),
              },
            ]
          : []),
        { key: 'delete', label: t('dashboard.documents.delete'), tone: 'danger' as const },
      ]
    : []),
])

function onAction(key: string) {
  if (key === 'pinned' || key === 'unpinned') void togglePinned()
  else if (key === 'edit') emit('edit', props.doc)
  else if (key === 'delete') showDeleteModal.value = true
  else if (key === 'hidden' || key === 'unhidden') void toggleHidden()
}

const isPinned = computed(() => !!props.doc.pinned_at)

async function togglePinned() {
  await docs.setPinned(props.doc.id, !isPinned.value)
  emit('pinned-changed', props.doc.id)
}

async function toggleHidden() {
  togglingHidden.value = true
  try {
    await docs.setHidden(props.doc.id, !isHidden.value)
    emit('hidden-changed', props.doc.id)
  } finally {
    togglingHidden.value = false
  }
}

const showDeleteModal = ref(false)

const isOwner = computed(() => auth.user?.id === props.doc.users?.id)

const postBy = computed(() =>
  `${props.doc.users?.first_name ?? ''} ${props.doc.users?.last_name ?? ''}`.trim(),
)

const dateText = computed(() => new Date(props.doc.uploaded_at).toLocaleDateString('en-GB'))

const sizeText = computed(() => {
  const kb = (props.doc.documents ?? []).reduce((s, f) => s + (f.file_size_kb ?? 0), 0)
  return kb < 1024 ? `${kb} KB` : `${(kb / 1024).toFixed(1)} MB`
})

function goToDetails() {
  router.push({ name: 'document-details', query: { upload_id: props.doc.id } })
}

async function confirmDelete() {
  await docs.deleteDocument(props.doc.id)
  emit('deleted', props.doc.id)
  showDeleteModal.value = false
}
</script>

<template>
  <div
    class="grid grid-cols-1 gap-3 items-start px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors"
    :class="
      showOwnerColumns
        ? 'md:grid-cols-[2fr_90px_100px_90px_120px_110px_40px]'
        : 'md:grid-cols-[2fr_120px_100px_160px_110px_40px]'
    "
    @click="goToDetails"
  >
    <!-- Name col: icon + title + type -->
    <!-- items-center INSIDE the cell: the icon centres against the two-line
         title+type block. The outer grid stays items-start so the other columns
         still line up with the title. -->
    <div class="flex items-center gap-3 min-w-0">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" class="shrink-0 w-8 h-8">
        <path
          fill="#008CB9"
          d="M128 512L512 512C547.3 512 576 483.3 576 448L576 208C576 172.7 547.3 144 512 144L362.7 144C355.8 144 349 141.8 343.5 137.6L305.1 108.8C294 100.5 280.5 96 266.7 96L128 96C92.7 96 64 124.7 64 160L64 448C64 483.3 92.7 512 128 512z"
        />
      </svg>
      <div class="min-w-0">
        <p class="text-sm font-semibold text-gray-900 truncate">{{ doc.title }}</p>
        <p class="text-xs text-primary font-medium mt-0.5">{{ doc.doc_type }}</p>
      </div>
    </div>

    <!-- Department / subject / semester — dashboard only -->
    <template v-if="showOwnerColumns">
      <!-- The cohort, not just the department: "GIC" alone does not say which
           year the material is for, and a dashboard listing several years of
           your own uploads is exactly where that matters. yearMajorLabel also
           knows to drop the year for a language course, whose year_level holds
           a language rather than a year. -->
      <span class="text-sm text-gray-500 pt-0.5 text-center">{{
        doc.majors?.acronym ? yearMajorLabel(doc.majors.acronym, doc.year_level) : '—'
      }}</span>
      <span
        class="text-sm text-gray-500 truncate pt-0.5 text-center"
        :title="doc.subjects?.name ?? ''"
        >{{ doc.subjects?.acronym || doc.subjects?.name || '—' }}</span
      >
      <span class="text-sm text-gray-500 pt-0.5 text-center">{{
        doc.subjects?.semester ?? '—'
      }}</span>
    </template>

    <!-- Academic year — public feed only, like file size above. -->
    <span v-if="!showOwnerColumns" class="text-sm text-gray-500 text-center">{{
      doc.academic_year || '—'
    }}</span>

    <!-- File size — public feed only; the dashboard trades it for the
         department/subject/semester columns rather than carrying both. -->
    <div v-if="!showOwnerColumns" class="text-sm text-gray-500 text-center">
      {{ sizeText }}
      <span class="block text-xs text-gray-400">{{
        t('document.documentDetailsPage.filesCount', fileCount ?? 0)
      }}</span>
    </div>

    <!-- Upload by, or review status when the list is your own uploads -->
    <!-- On the public feed this column names the uploader. A row that is still
         awaiting review only ever reaches its own uploader, though, and
         "uploaded by you" says nothing — the state does. So that one row shows
         the badge instead, which is what the grid card already does. -->
    <span
      v-if="!showOwnerColumns && doc.status !== 'pending'"
      class="text-sm text-gray-500 pt-0.5 text-center"
      >{{ postBy }}</span
    >
    <span v-else-if="!showOwnerColumns" class="block pt-0.5 text-center">
      <span
        :class="['inline-block rounded-full px-2 py-0.5 text-xs font-medium', statusBadge.tone]"
        >{{ statusBadge.label }}</span
      >
    </span>
    <span v-else class="block pt-0.5 text-center">
      <span
        :class="['inline-block rounded-full px-2 py-0.5 text-xs font-medium', statusBadge.tone]"
        >{{ statusBadge.label }}</span
      >
    </span>

    <!-- Date -->
    <span class="text-sm text-gray-500 pt-0.5 text-center">{{ dateText }}</span>

    <!-- Owner actions. RowActionsMenu teleports its dropdown to <body>: this
         panel scrolls horizontally, which would clip an absolutely positioned
         menu. -->
    <div class="flex items-center justify-center -mt-1" @click.stop>
      <!-- No v-if="isOwner": Pin is offered to everyone, and rowActions
           already withholds the owner-only entries. The length check is for
           the case where it withholds all of them — a trigger that opens an
           empty panel is worse than no trigger. -->
      <RowActionsMenu
        v-if="rowActions.length"
        :items="rowActions"
        :disabled="togglingHidden"
        @select="onAction"
      />
    </div>
  </div>

  <ConfirmDeleteModal
    v-if="showDeleteModal"
    :target="doc.title"
    @cancel="showDeleteModal = false"
    @confirm="confirmDelete"
  />
</template>
