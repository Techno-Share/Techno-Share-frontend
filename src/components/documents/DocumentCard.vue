<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth.store'
import { useDocumentsStore } from '@/stores/documents.store'
import { formatRelativeDate, isExpired } from '@/utils/format'
import type { Upload } from '@/types/documents.types'
import ConfirmDeleteModal from '@/components/base/ConfirmDeleteModal.vue'
import RowActionsMenu, { type RowAction } from '@/components/base/RowActionsMenu.vue'
import FolderIcon from '@/components/base/FolderIcon.vue'

const { t } = useI18n({ useScope: 'global' })
const auth = useAuthStore()
const docs = useDocumentsStore()
const router = useRouter()

const props = defineProps<{
  /** A feed upload; `doc.id` is the upload id, not a file id. */
  doc: Upload
  /**
   * Draw "Under review" in amber instead of grey. Set by the owner's dashboard
   * only — see statusBadge for why the feed keeps it grey.
   */
  highlightPending?: boolean
}>()

const emit = defineEmits<{
  (e: 'deleted', id: string): void
  /** The owner asked to edit — the parent opens the editor. */
  (e: 'edit', doc: Upload): void
  /** Owner toggled visibility — the parent reloads. */
  (e: 'hidden-changed', id: string): void
  /** Owner pinned/unpinned — the parent reloads so the order updates. */
  (e: 'pinned-changed', id: string): void
}>()

const showDeleteModal = ref(false)

// ── Computed helpers ────────────────────────────────────────────────────────

const isOwner = computed(() => auth.user?.id === props.doc.users?.id)
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
const isPinned = computed(() => !!props.doc.pinned_at)

/**
 * Review state, shown only when it is not the ordinary one. A card is served to
 * its owner in every state now that the dashboard lists them all, so "Under
 * review" and "Not approved" have to be legible here — otherwise a pending
 * upload looks identical to a published one.
 *
 * Expiry comes last because it only ever replaces "published": a rejected or
 * pending upload was never visible to anyone, so saying it has expired would
 * answer a question nobody asked. For an approved one it is the whole story —
 * without it an upload that has quietly left every feed still reads as live.
 */
/**
 * Not published yet — nobody but the uploader is served this card, so the whole
 * thing is drawn muted rather than only its badge. A card that looks exactly
 * like a live one, with a small grey pill, reads as published-with-a-note.
 *
 * Still clickable: unlike a pending SUBJECT, whose page is an empty dead end,
 * a pending document opens usefully — its files are there and the owner is the
 * one person allowed to see them.
 */
const unavailable = computed(() => props.doc.status === 'pending')

const reviewBadge = computed(() => {
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
  if (props.doc.status === 'rejected')
    return { label: t('dashboard.documents.statusRejected'), tone: 'bg-red-100 text-red-700' }
  if (isExpired(props.doc.expires_at))
    return { label: t('dashboard.documents.statusExpired'), tone: 'bg-gray-200 text-gray-600' }
  return null
})

async function togglePinned() {
  await docs.setPinned(props.doc.id, !isPinned.value)
  emit('pinned-changed', props.doc.id)
}
const togglingHidden = ref(false)

/**
 * Pin is offered to every viewer, not just the uploader — it bookmarks someone
 * else's document to the top of YOUR listings, so it isn't an owner privilege.
 * Editing, hiding and deleting change the document itself and stay with its
 * uploader.
 *
 * Both pin and hide are withheld while the document is unpublished; see
 * isPublished. Edit and delete are not — the uploader fixing or withdrawing
 * their own submission is exactly what review is waiting on.
 */
const cardActions = computed<RowAction[]>(() => [
  ...(isPublished.value
    ? [
        {
          // Two keys for one toggle: the menu resolves an icon from the key, so
          // the entry has to say which direction it goes, not just which
          // feature it is.
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
        {
          key: 'delete',
          label: t('document.DocumentCard.deleteConfirm'),
          tone: 'danger' as const,
        },
      ]
    : []),
])

function onAction(key: string) {
  if (key === 'pinned' || key === 'unpinned') void togglePinned()
  else if (key === 'edit') emit('edit', props.doc)
  else if (key === 'delete') handleDelete()
  else if (key === 'hidden' || key === 'unhidden') void toggleHidden()
}

/** Owner-only, same as edit and delete — available wherever your card appears. */
async function toggleHidden() {
  togglingHidden.value = true
  try {
    await docs.setHidden(props.doc.id, !isHidden.value)
    emit('hidden-changed', props.doc.id)
  } finally {
    togglingHidden.value = false
  }
}

const postBy = computed(() =>
  `${props.doc.users?.first_name ?? ''} ${props.doc.users?.last_name ?? ''}`.trim(),
)

const dateText = computed(() => formatRelativeDate(props.doc.uploaded_at))

// ── Actions ─────────────────────────────────────────────────────────────────

async function handleDelete() {
  showDeleteModal.value = true
}

function closeDeleteModal() {
  showDeleteModal.value = false
}

async function confirmDelete() {
  await docs.deleteDocument(props.doc.id)
  emit('deleted', props.doc.id)
  closeDeleteModal()
}

function goToDetails() {
  const subjectId = props.doc.subjects?.id
  router.push({
    name: 'document-details',
    query: {
      upload_id: props.doc.id,
      subject_id: subjectId || undefined,
    },
  })
}
</script>

<template>
  <!-- h-full + flex-col so every card fills its grid row and the byline can be
       pinned to the bottom, keeping it aligned across cards with and without
       tags.

       On a phone the grid is a single column, so w-full stretches one card the
       whole width of the screen. max-w-64 holds it to a card shape and mx-auto
       keeps it centred; from sm up the grid decides the width again. -->
  <article
    class="relative mx-auto flex h-full w-full max-w-64 cursor-pointer flex-col rounded-lg border px-4 py-5 transition-colors hover:border-primary sm:max-w-none"
    :class="unavailable ? 'border-gray-300 bg-gray-50' : 'border-[#B9B9B9] bg-white'"
    @click="goToDetails"
  >
    <!-- Shown to any signed-in viewer, since pinning is open to all; the menu
         itself drops the owner-only entries. RowActionsMenu teleports its
         dropdown to <body>, so the menu is never clipped by the card's
         rounded/overflow boundary, and its clicks cannot bubble back into the
         card's own navigate-on-click. -->
    <div v-if="auth.user && cardActions.length" class="absolute top-3 right-3" @click.stop>
      <RowActionsMenu :items="cardActions" :disabled="togglingHidden" @select="onAction" />
    </div>

    <!-- Thumbnail -->
    <div class="flex flex-col items-center justify-center pb-2 gap-1">
      <FolderIcon class="h-25 w-30" :class="unavailable ? 'text-gray-300' : 'text-primary'" />
    </div>

    <div class="h-px bg-[#C7C7C7]"></div>

    <!-- Title -->
    <h2
      class="mt-3 truncate text-lg font-semibold leading-tight"
      :class="unavailable ? 'text-gray-400' : 'text-black'"
      :title="doc.title"
    >
      {{ doc.title }}
    </h2>

    <!-- Subject -->
    <p v-if="doc.subjects" class="text-[12px] text-gray-400 mt-1">
      <span class="uppercase"
        >{{ doc.subjects.acronym }} &nbsp;•&nbsp; {{ doc.academic_year }}</span
      >
    </p>

    <!-- Doc type — styled like the old tags -->
    <div class="mt-2 flex flex-wrap gap-1">
      <span
        class="inline-flex items-center rounded-full px-4 py-1 text-xs leading-none"
        :class="
          unavailable ? 'bg-gray-200 text-gray-500' : 'border-[#1AA8E5] bg-[#B8EDFF] text-[#0082B8]'
        "
        >{{ doc.doc_type }}</span
      >
    </div>

    <!-- Review state and Hidden are different things — a pending upload can
         also be hidden — so they are separate badges on one wrapping row.
         Both are owner-only: nobody else is served a pending or hidden doc. -->
    <!-- Status strip, floated over the top-left corner.
         It used to sit inline under the doc type, which read as another label
         about the document rather than a note about its state — and on a
         greyed card the one thing that explains the grey belongs where the eye
         lands first. The actions menu holds the opposite corner.

         Pin lives here too: both are markers on the card rather than content,
         and sharing one flex row is what stops them overlapping when a pending
         upload is also pinned. -->
    <div
      v-if="reviewBadge || isHidden || isPinned"
      class="absolute top-3 left-3 z-10 flex flex-wrap items-center gap-1.5"
    >
      <svg
        v-if="isPinned"
        class="h-4 w-4 shrink-0 text-primary"
        viewBox="0 0 640 640"
        fill="currentColor"
      >
        <path
          d="M160 96C160 78.3 174.3 64 192 64L448 64C465.7 64 480 78.3 480 96C480 113.7 465.7 128 448 128L418.5 128L428.8 262.1C465.9 283.3 494.6 318.5 507 361.8L510.8 375.2C513.6 384.9 511.6 395.2 505.6 403.3C499.6 411.4 490 416 480 416L160 416C150 416 140.5 411.3 134.5 403.3C128.5 395.3 126.5 384.9 129.3 375.2L133 361.8C145.4 318.5 174 283.3 211.2 262.1L221.5 128L192 128C174.3 128 160 113.7 160 96zM288 464L352 464L352 576C352 593.7 337.7 608 320 608C302.3 608 288 593.7 288 576L288 464z"
        />
      </svg>
      <span
        v-if="reviewBadge"
        class="inline-block w-fit rounded-full px-2 py-0.5 text-[11px] font-medium"
        :class="reviewBadge.tone"
        >{{ reviewBadge.label }}</span
      >
      <span
        v-if="isHidden"
        class="inline-block w-fit rounded-full bg-gray-200 px-2 py-0.5 text-[11px] font-medium text-gray-600"
        >{{ t('dashboard.documents.statusHidden') }}</span
      >
    </div>

    <!-- Author + date — mt-auto pins it to the bottom of the card. -->
    <p class="mt-auto pt-3 text-sm font-semibold leading-none text-[#9E9E9E]">
      {{ postBy }} &nbsp;•&nbsp; {{ dateText }}
    </p>
  </article>

  <ConfirmDeleteModal
    v-if="showDeleteModal"
    :target="doc.title"
    @cancel="closeDeleteModal"
    @confirm="confirmDelete"
  />
</template>
