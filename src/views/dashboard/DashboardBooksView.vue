<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useBooksStore } from '@/stores/books.store'
import { useToast } from '@/composables/useToast'
import AcceptRequestModal from '@/components/books/AcceptRequestModal.vue'
import DeclineRequestModal from '@/components/books/DeclineRequestModal.vue'
import ConfirmActionModal from '@/components/base/ConfirmActionModal.vue'
import RequestDetailPanel from '@/components/books/RequestDetailPanel.vue'
import DonateBookModal from '@/components/books/DonateBookModal.vue'
import IconTextButton from '@/components/base/IconTextButton.vue'
import BookGridCard from '@/components/books/BookGridCard.vue'
import IncomingRequestCard from '@/components/books/IncomingRequestCard.vue'
import ReservedBookCard from '@/components/books/ReservedBookCard.vue'
import MyBookPanel from '@/components/books/MyBookPanel.vue'
import LoadingSpinner from '@/components/base/LoadingSpinner.vue'
import SelectDropdown from '@/components/base/SelectDropdown.vue'
import RowActionsMenu, { type RowAction } from '@/components/base/RowActionsMenu.vue'
import type { MyBook, OutgoingBookRequest } from '@/types/books.types'
import { displayName } from '@/utils/format'

const route = useRoute()
const router = useRouter()
const { t } = useI18n({ useScope: 'global' })
const booksStore = useBooksStore()
const { showToast } = useToast()

/**
 * Three lists, one view: your shelf, requests others have made of you, and the
 * ones you have made of them. Driven by the route rather than a local tab, so
 * each is linkable.
 */
const bookFilter = computed(() => {
  if (route.name === 'dashboard-books-approve') return 'approve'
  if (route.name === 'dashboard-books-reserved') return 'reserved'
  if (route.name === 'dashboard-books-requesting') return 'received'
  return 'yourBook'
})

// Mobile tabs for the Book Activity group (desktop uses the sidebar sub-nav).
// The group's three entries and nothing else — My books is a separate sidebar
// icon, so it is reached from there rather than from inside this row.
const bookFilters = computed(() => [
  { value: 'approve', label: t('dashboard.sidebar.filters.approve') },
  { value: 'reserved', label: t('dashboard.sidebar.filters.reserved') },
  { value: 'received', label: t('dashboard.sidebar.filters.myRequests') },
])

/**
 * Status of your own listings. Only applies to the "My book" view — the
 * request/received lists are keyed on REQUEST status, not book status, so the
 * dropdown is hidden there rather than silently doing nothing.
 */
type BookStatusFilter = 'all' | 'available' | 'donated' | 'received' | 'pending' | 'accepted'
const STATUS_VALUES: BookStatusFilter[] = [
  'all',
  'available',
  'donated',
  'received',
  'pending',
  'accepted',
]

/**
 * Seeded from `?status=` so a notification can deep-link straight to the books
 * waiting on an answer. Validated, since it comes from the URL.
 */
const queryStatus = route.query.status as BookStatusFilter | undefined
const selectedStatus = ref<BookStatusFilter>(
  queryStatus && STATUS_VALUES.includes(queryStatus) ? queryStatus : 'all',
)

/** My books only — the filter is hidden on "My requests". Book status, not
 * request status. */
const statusOptions = computed(() => [
  { label: t('dashboard.books.statusAll'), value: 'all' },
  { label: t('dashboard.books.availableStatus'), value: 'available' },
  // No 'pending': a book awaiting your answer is shown in Book Activity now,
  // so the option would only ever produce an empty shelf here.
  { label: t('dashboard.books.donatedStatus'), value: 'donated' },
  // The shelf holds both sides of a handover, so each gets its own option.
  { label: t('dashboard.books.receivedStatus'), value: 'received' },
])

// My books only. "My requests" is a short list you read top to bottom, and the
// step track already says which stage each one is at. Hidden with a listing
// open too: both controls act on the shelf, which is not on screen then.
// (Lazy getter, so reading openedBook — declared further down — is fine.)
const showShelfTools = computed(() => bookFilter.value === 'yourBook' && !openedBook.value)

// The option sets do not overlap, so a value carried across tabs would be
// meaningless (or invalid) on the new one. A ?status= on the incoming route
// wins, so a notification deep-link survives switching tabs.
watch(bookFilter, () => {
  const q = route.query.status as BookStatusFilter | undefined
  selectedStatus.value = q && STATUS_VALUES.includes(q) ? q : 'all'
})

const bookActions = computed<RowAction[]>(() => [
  { key: 'edit', label: t('dashboard.books.edit') },
  { key: 'delete', label: t('dashboard.books.delete'), tone: 'danger' as const },
])

function onBookAction(key: string, book: MyBook) {
  if (key === 'edit') onEditBook(book)
  else if (key === 'delete') onAskDeleteBook(book.id)
}

const ROUTE_BY_FILTER: Record<string, string> = {
  approve: 'dashboard-books-approve',
  reserved: 'dashboard-books-reserved',
  received: 'dashboard-books-requesting',
  yourBook: 'dashboard-books',
}

function setFilter(value: string) {
  router.push({ name: ROUTE_BY_FILTER[value] ?? 'dashboard-books' })
}

/**
 * Your shelf, minus anything with a request waiting on you — those move to
 * Book Activity, where they can actually be answered. A listing under request
 * cannot be edited or deleted anyway, so it is a decision, not a shelf entry.
 */
const myBooks = computed(() =>
  booksStore.myBooks.filter(
    (b) =>
      b.request?.status !== 'pending' &&
      // A reserved listing is a handover in flight, not a shelf entry — it is
      // shown under Book Activity, where it can be cancelled.
      !(b.status === 'reserved' && b.role === 'donor'),
  ),
)

/** The other half of that split: what Book Activity's Approve entry shows. */
const incomingRequests = computed(() =>
  booksStore.myBooks.filter((b) => b.request?.status === 'pending'),
)

/** Handovers in flight — accepted, waiting on the receiver to confirm. */
const reservedBooks = computed(() =>
  booksStore.myBooks.filter((b) => b.status === 'reserved' && b.role === 'donor'),
)

/**
 * Still needed alongside the server-side status filter: on "All statuses" the
 * API returns declined and cancelled requests too, and those are a dead end on
 * this screen — the decline arrives as a notification with the donor's reason
 * instead.
 *
 * 'completed' is NOT here: once you confirm receipt the book is yours, and it
 * moves to My books as a received listing. Leaving it would show the same book
 * on two shelves.
 */
const RECEIVED_STATUSES = ['pending', 'accepted']

const receivedBooks = computed(() =>
  booksStore.outgoingRequests.filter((r) => RECEIVED_STATUSES.includes(r.status)),
)

const loading = ref(false)

async function loadFilter() {
  loading.value = true
  try {
    switch (bookFilter.value) {
      case 'approve':
        // 'pending' server-side = your listings with an unanswered request.
        await booksStore.fetchMyBooks('pending')
        break
      case 'reserved':
        // Accepted, waiting on the receiver to confirm.
        await booksStore.fetchMyBooks('reserved')
        break
      case 'received':
        // No status → pending AND accepted AND completed, so the requester sees
        // what they are waiting on and what they have already received.
        await booksStore.fetchOutgoingRequests(
          selectedStatus.value === 'pending' || selectedStatus.value === 'accepted'
            ? selectedStatus.value
            : undefined,
        )
        break
      default: // yourBook — narrowed by the status dropdown
        await booksStore.fetchMyBooks(
          selectedStatus.value === 'accepted' ? 'all' : selectedStatus.value,
        )
    }
  } finally {
    loading.value = false
  }
}

watch([bookFilter, selectedStatus], loadFilter, { immediate: true })

const requestAction = ref<string | null>(null)

async function refresh() {
  await Promise.all([loadFilter(), booksStore.fetchBookStats()])
}

/**
 * The request opened from the grid. Detail lives in a modal so the cards stay a
 * plain list of books.
 */
const openedRequest = ref<OutgoingBookRequest | null>(null)

function openRequest(req: OutgoingBookRequest) {
  openedRequest.value = req
}

/**
 * The listing opened from the My books grid — the donor's counterpart to
 * openedRequest, shown in the same inline-panel way.
 *
 * Held by id and read back from the store, not copied: accepting or cancelling
 * refetches, and a held object would leave the panel on a stale state.
 */
const openedBookId = ref<string | null>(null)

const openedBook = computed(() =>
  openedBookId.value ? (booksStore.myBooks.find((b) => b.id === openedBookId.value) ?? null) : null,
)

// Switching tabs closes it, same as the request panel.
watch(bookFilter, () => {
  openedBookId.value = null
})

/**
 * Closing drops `?request=` too, so Back — or a reload — lands on the grid
 * rather than reopening the panel that was just dismissed.
 */
function closeRequest() {
  openedRequest.value = null
  if (!route.query.request) return
  const query = { ...route.query }
  delete query.request
  void router.replace({ query })
}

// Switching tabs closes any open request, so returning to "My requests" starts
// at the list rather than wherever you were.
watch(bookFilter, closeRequest)

/**
 * Deep link from a book's detail page: /dashboard/books/requesting?request=<id>
 * opens that request's progress instead of the grid.
 *
 * Watched rather than read once on mount, because the list is fetched after
 * this view is created — at mount there is nothing to match against yet.
 */
watch(
  [receivedBooks, () => route.query.request],
  ([list, id]) => {
    if (typeof id !== 'string' || !id) return
    const match = list.find((r) => r.id === id)
    if (match) openedRequest.value = match
  },
  { immediate: true },
)

/** Receiver confirms the handover — the step that marks the book donated. */
async function onConfirmReceived(bookId: string, requestId: string) {
  requestAction.value = requestId
  try {
    await booksStore.completeRequest(bookId, requestId)
    /**
     * Stay on the panel so the closing step is actually seen.
     *
     * The object is patched by hand rather than re-read: completing moves the
     * request out of receivedBooks — the book is a My books listing now — so
     * there is nothing in the store left to point at. Back returns to a grid
     * that no longer holds it, which is correct.
     */
    if (openedRequest.value) {
      openedRequest.value = {
        ...openedRequest.value,
        status: 'completed',
        completed_at: new Date().toISOString(),
      }
    }
    await refresh()
  } catch (e: unknown) {
    const message = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
    showToast(message ?? 'Could not confirm', { type: 'error' })
  } finally {
    requestAction.value = null
  }
}

// Accepting settles which Telegram the receiver will contact, so it opens a
// modal. The book becomes reserved.
const acceptTarget = ref<{ bookId: string; requestId: string; title: string } | null>(null)

function onAskAccept(bookId: string, requestId: string, title: string) {
  acceptTarget.value = { bookId, requestId, title }
}

async function onAcceptRequest(bookId: string, requestId: string) {
  requestAction.value = requestId
  try {
    await booksStore.acceptRequest(bookId, requestId)
    acceptTarget.value = null
    await refresh()
  } catch (e: unknown) {
    const message = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
    showToast(message ?? 'Could not accept the request', { type: 'error' })
  } finally {
    requestAction.value = null
  }
}

/**
 * Cancelling a handover releases a book someone is expecting to collect, so the
 * donor confirms first — the receiver's side asks the same way.
 */
const cancelHandoverTarget = ref<{
  bookId: string
  requestId: string
  name: string
} | null>(null)

/** Called off by either side; the book returns to available. */
async function onCancelReservation(bookId: string, requestId: string) {
  requestAction.value = requestId
  try {
    await booksStore.cancelRequest(bookId, requestId)
    cancelHandoverTarget.value = null
    openedRequest.value = null
    await refresh()
  } catch (e: unknown) {
    const message = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
    showToast(message ?? 'Could not cancel', { type: 'error' })
  } finally {
    requestAction.value = null
  }
}

const declineTarget = ref<{ bookId: string; requestId: string } | null>(null)
const declining = ref(false)

function onAskDeclineRequest(bookId: string, requestId: string) {
  declineTarget.value = { bookId, requestId }
}

// The reason is collected and validated by the modal, which is why it arrives
// as an argument rather than being read from state here.
async function confirmDeclineRequest(reason: string) {
  if (!declineTarget.value) return
  const { bookId, requestId } = declineTarget.value
  declining.value = true
  requestAction.value = requestId + '_d'
  try {
    await booksStore.declineRequest(bookId, requestId, reason)
    declineTarget.value = null
    await refresh()
  } finally {
    declining.value = false
    requestAction.value = null
  }
}

// ── Donate / edit / delete a listed book ─────────────────────────────────────
const showDonate = ref(false)
const editingBook = ref<MyBook | null>(null)
const deletingBookId = ref<string | null>(null)
const showDeleteBookModal = ref(false)
const deletingBook = ref(false)

function onEditBook(book: MyBook) {
  editingBook.value = book
  showDonate.value = true
}

/**
 * Closes the donate/edit modal. A method rather than an inline
 * `a = 1; b = null` handler: prettier removes the semicolon that Vue's template
 * parser needs, and the file stops compiling.
 */
/**
 * What a donor's own book is actually doing.
 *
 * `books.status` alone is not the answer: accepting a request leaves the row
 * 'available' until the donor marks it donated, so a spoken-for book showed as
 * "Available" on their own dashboard. The request state has to be folded in.
 */
/**
 * Which of the four states one of your own books is in.
 *
 * Every state wears the same badge (see BOOK_STATUS_BADGE) — the word carries
 * the meaning, and a row of differently-coloured pills read as a severity scale
 * that these states don't have.
 */
function myBookStatus(book: {
  status: string
  role?: string
  request?: { status: string } | null
}) {
  // Same book, opposite sides: 'donated' is what the giver did, 'received' is
  // what happened to you.
  if (book.role === 'receiver') return 'dashboard.books.receivedStatus'
  if (book.status === 'donated') return 'dashboard.books.donatedStatus'
  // Accepted, waiting for the receiver to confirm they have it.
  if (book.status === 'reserved') return 'dashboard.books.reservedStatus'
  if (book.request?.status === 'pending') return 'dashboard.books.requestingStatus'
  return 'dashboard.books.availableStatus'
}

const BOOK_STATUS_BADGE = 'bg-primary/10 text-primary'

function closeDonate() {
  showDonate.value = false
  editingBook.value = null
}

async function onBookDonated() {
  showDonate.value = false
  await refresh()
}

async function onBookUpdated() {
  showDonate.value = false
  editingBook.value = null
  await refresh()
}

function onAskDeleteBook(bookId: string) {
  deletingBookId.value = bookId
  showDeleteBookModal.value = true
}

async function confirmDeleteBook() {
  if (!deletingBookId.value) return
  deletingBook.value = true
  try {
    await booksStore.remove(deletingBookId.value)
    showDeleteBookModal.value = false
    deletingBookId.value = null
    await refresh()
  } finally {
    deletingBook.value = false
  }
}
</script>

<template>
  <!-- ── Books I'm donating ──────────────────────────────────────────── -->
  <!-- A FIXED height while a request is open, a growing column otherwise.
       The grids must be free to grow — capping them would clip rows — but the
       detail panel is meant to end level with the sidebar and scroll inside
       itself, and `flex-1` has nothing to push against until something above
       it is definite. min-height will not do: it grows with the content, so
       the panel never overflows and never scrolls.

       md:flex-none goes with it: `flex-1` means `flex-basis: 0%`, which takes
       over the main axis and leaves the height ignored — the panel then sizes
       to its content and overflows the column instead of scrolling.

       Set here rather than in DashboardView's FILLS_COLUMN because that list
       is keyed on the route, and which shape we are in is local state — the
       grid and its detail share one route. -->
  <div
    class="w-full flex flex-1 min-h-0 flex-col gap-3"
    :class="openedRequest ? 'md:h-[calc(100vh-148px)] md:flex-none' : ''"
  >
    <div class="flex items-center justify-between gap-2">
      <!-- Two titles, one per width. The phone gets the page title itself so
           it shares this row with the controls instead of sitting on a line of
           its own — DashboardView suppresses its generic heading for these
           routes. Keyed off the route because this view serves four of them. -->
      <h1 class="text-xl font-bold text-gray-900 md:hidden">
        {{ t(`dashboard.mobileTitle.${String(route.name)}`) }}
      </h1>
      <p class="hidden text-xs font-semibold uppercase tracking-wide text-gray-400 md:block">
        {{ t('dashboard.books.title') }}
      </p>
      <div class="flex items-center gap-2">
        <div v-if="showShelfTools" class="w-36 shrink-0">
          <SelectDropdown v-model="selectedStatus" :options="statusOptions" />
        </div>
        <!-- Donating is unrelated to the requests you have made, so it is
             offered on "My books" only. -->
        <IconTextButton
          v-if="showShelfTools"
          :text="t('dashboard.books.listABook')"
          @click="showDonate = true"
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

    <!-- Mobile tabs for the Book Activity group (desktop uses the sidebar
         sub-nav). Not shown on My books: that list is its own sidebar entry —
         the Books icon — so on that page the row was four chips offering a
         destination you were already on plus three that belong to a different
         icon. From inside the group they earn their place, and the My books
         chip is how you get back out. -->
    <div
      v-if="bookFilter !== 'yourBook'"
      class="md:hidden flex flex-wrap items-center justify-center gap-1"
    >
      <button
        v-for="f in bookFilters"
        :key="f.value"
        @click="setFilter(f.value)"
        :class="[
          'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all border',
          bookFilter === f.value
            ? 'bg-primary text-white border-primary'
            : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300',
        ]"
      >
        {{ f.label }}
        <span
          v-if="f.value === 'approve' && booksStore.bookStats.pendingIncoming"
          :class="[
            'h-4 min-w-4 px-1 rounded-full text-[9px] font-bold flex items-center justify-center',
            bookFilter === 'approve' ? 'bg-white/30 text-white' : 'bg-red-500 text-white',
          ]"
          >{{ booksStore.bookStats.pendingIncoming }}</span
        >
      </button>
    </div>

    <div v-if="loading" class="flex justify-center py-20"><LoadingSpinner /></div>

    <template v-else>
      <div
        v-if="bookFilter === 'reserved' && !openedBook && !reservedBooks.length"
        class="flex min-h-[55vh] flex-1 flex-col items-center justify-center gap-2 py-12 text-center md:min-h-0 md:rounded-2xl md:border md:border-gray-100 md:bg-white"
      >
        <p class="text-gray-500 font-medium text-sm">{{ t('dashboard.books.noReservedYet') }}</p>
        <p class="text-gray-400 text-xs">{{ t('dashboard.books.reservedHint') }}</p>
      </div>

      <div
        v-if="bookFilter === 'approve' && !incomingRequests.length"
        class="flex min-h-[55vh] flex-1 flex-col items-center justify-center gap-2 py-12 text-center md:min-h-0 md:rounded-2xl md:border md:border-gray-100 md:bg-white"
      >
        <p class="text-gray-500 font-medium text-sm">{{ t('dashboard.books.noIncomingYet') }}</p>
        <p class="text-gray-400 text-xs">{{ t('dashboard.books.incomingHint') }}</p>
      </div>

      <!-- !openedRequest, like the two shelves above: confirming receipt takes
           the request out of receivedBooks on purpose (the book is a My books
           listing now), while onConfirmReceived deliberately keeps the panel up
           so the closing step is seen. Without this guard those two intentions
           collide and "No book requests yet" prints above the open panel. -->
      <div
        v-if="bookFilter === 'received' && !openedRequest && !receivedBooks.length"
        class="flex min-h-[55vh] flex-1 flex-col items-center justify-center gap-2 py-12 text-center md:min-h-0 md:rounded-2xl md:border md:border-gray-100 md:bg-white"
      >
        <p class="text-gray-500 font-medium text-sm">{{ t('dashboard.books.noReceivedYet') }}</p>
        <p class="text-gray-400 text-xs">{{ t('dashboard.books.receivedHint') }}</p>
      </div>

      <div
        v-if="bookFilter === 'yourBook' && !openedBook && !myBooks.length"
        class="flex min-h-[55vh] flex-1 flex-col items-center justify-center gap-2 py-12 text-center md:min-h-0 md:rounded-2xl md:border md:border-gray-100 md:bg-white"
      >
        <p class="text-gray-500 font-medium text-sm">{{ t('dashboard.books.noListedYet') }}</p>
        <p class="text-gray-400 text-xs">{{ t('dashboard.books.listedHint') }}</p>
      </div>

      <!-- Received books (outgoing requests accepted by a donor) -->
      <template v-if="bookFilter === 'received'">
        <!-- Opening a request swaps the grid for its detail, in the same panel
             rather than over it. flex-1 so the panel grows to the bottom of the
             content column, which carries the sidebar's min-height — otherwise
             it stops at its content and ends well short of the nav. -->
        <RequestDetailPanel
          v-if="openedRequest"
          :request="openedRequest"
          :busy="requestAction === openedRequest.id"
          class="min-h-0 flex-1 md:mt-0 mt-3"
          @close="closeRequest"
          @confirm-received="onConfirmReceived(openedRequest!.book.id, openedRequest!.id)"
          @cancel-request="onCancelReservation(openedRequest!.book.id, openedRequest!.id)"
        />

        <div
          v-if="!openedRequest"
          class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:mt-0 mt-3 md:max-h-[calc(100vh-196px)] md:overflow-y-auto scrollbar-hide"
        >
          <!-- Deliberately just the book: cover, title, owner. Progress,
               contact and actions live in the detail modal, so the grid reads
               as a shelf rather than a wall of status. -->
          <BookGridCard
            v-for="req in receivedBooks"
            :key="req.id"
            :cover-url="req.book.cover_image_url"
            class="cursor-pointer transition hover:border-primary"
            role="button"
            tabindex="0"
            @click="openRequest(req)"
            @keydown.enter="openRequest(req)"
          >
            <p class="truncate text-sm font-semibold text-gray-900">
              {{ req.book.title }}
            </p>
            <!-- Once confirmed, "Owner" is no longer true — the book is
                 yours, and what matters is who it came from. -->
            <p class="mt-0.5 truncate text-xs text-gray-500">
              {{
                t(
                  req.status === 'completed'
                    ? 'dashboard.books.receivedFrom'
                    : 'dashboard.books.ownerName',
                  { name: displayName(req.donor.first_name, req.donor.last_name) },
                )
              }}
            </p>
          </BookGridCard>
        </div>
      </template>

      <!-- Requests asked OF you: decisions someone is waiting on, which is why
         they have their own entry rather than sharing one with your own. -->
      <div
        v-if="bookFilter === 'approve'"
        class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:mt-0 mt-3 md:max-h-[calc(100vh-196px)] md:overflow-y-auto scrollbar-hide"
      >
        <IncomingRequestCard
          v-for="book in incomingRequests"
          :key="book.id"
          :book="book"
          :accepting="requestAction === book.request?.id"
          :declining="requestAction === book.request?.id + '_d'"
          @accept="onAskAccept(book.id, book.request!.id, book.title)"
          @decline="onAskDeclineRequest(book.id, book.request!.id)"
        />
      </div>

      <!-- Reserved: the same listing card and panel as My books, so cancelling
           a reservation works identically wherever the book is opened from. -->
      <MyBookPanel
        v-if="bookFilter === 'reserved' && openedBook"
        :book="openedBook"
        :busy="requestAction === openedBook.request?.id"
        class="flex-1 md:mt-0 mt-3"
        @close="openedBookId = null"
        @edit="onEditBook(openedBook)"
        @delete="onAskDeleteBook(openedBook.id)"
        @cancel-handover="
          cancelHandoverTarget = {
            bookId: openedBook.id,
            requestId: openedBook.request!.id,
            name: displayName(
              openedBook.request!.requester.first_name,
              openedBook.request!.requester.last_name,
            ),
          }
        "
      />

      <div
        v-if="bookFilter === 'reserved' && !openedBook"
        class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:mt-0 mt-3 md:max-h-[calc(100vh-196px)] md:overflow-y-auto scrollbar-hide"
      >
        <ReservedBookCard
          v-for="book in reservedBooks"
          :key="book.id"
          :book="book"
          :busy="requestAction === book.request?.id"
          @cancel="
            cancelHandoverTarget = {
              bookId: book.id,
              requestId: book.request!.id,
              name: displayName(
                book.request!.requester.first_name,
                book.request!.requester.last_name,
              ),
            }
          "
        />
      </div>

      <!-- Your Book -->
      <!-- Opening a listing swaps the shelf for its detail, in the same panel
           rather than over it — the same shape as the requester's side. -->
      <MyBookPanel
        v-if="bookFilter === 'yourBook' && openedBook"
        :book="openedBook"
        :busy="requestAction === openedBook.request?.id"
        class="flex-1 md:mt-0 mt-3"
        @close="openedBookId = null"
        @edit="onEditBook(openedBook)"
        @delete="onAskDeleteBook(openedBook.id)"
        @cancel-handover="
          cancelHandoverTarget = {
            bookId: openedBook.id,
            requestId: openedBook.request!.id,
            name: displayName(
              openedBook.request!.requester.first_name,
              openedBook.request!.requester.last_name,
            ),
          }
        "
      />

      <!-- Scrolls inside the panel rather than growing the page: the toolbar
           above stays put while the shelf moves.

           A max-height, not flex-1: the content column carries a MIN-height
           (see DashboardView), so it grows with its content and a flex child
           would never be squeezed into scrolling. 196px ≈ the column's own
           148px offset plus this view's header row and gap. Desktop only —
           on mobile the page scroll is the right behaviour.

           scrollbar-hide (main.css) keeps the scrolling, drops the bar. -->
      <!-- Two independent v-ifs, not a v-if/v-else pair: the block comment
           above sits between them, and a v-else only binds to an immediately
           adjacent branch — which is what left this grid rendering nothing. -->
      <div
        v-if="bookFilter === 'yourBook' && !openedBook"
        class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:mt-0 mt-3 md:max-h-[calc(100vh-196px)] md:overflow-y-auto scrollbar-hide"
      >
        <BookGridCard
          v-for="book in myBooks"
          :key="book.id"
          :cover-url="book.cover_image_url"
          :highlight="book.request?.status === 'pending'"
          class="cursor-pointer"
          role="button"
          tabindex="0"
          @click="openedBookId = book.id"
          @keydown.enter="openedBookId = book.id"
        >
          <!-- Only an available book can be edited or removed; a donated one
               gets the explanatory line below instead of an empty menu. -->
          <!-- Frozen while someone is waiting: editing would change what they
               asked for, deleting would drop their request. Enforced server-side
               too — this only keeps the UI honest. -->
          <!-- Donated books get the explanatory line below instead of an empty
               menu. A book under request is not on this shelf at all — it is in
               Book Activity — so there is nothing to guard against here. A book
               you were GIVEN is on the shelf but not yours to edit or delete. -->
          <template v-if="book.status === 'available' && book.role === 'donor'" #actions>
            <RowActionsMenu :items="bookActions" @select="(key) => onBookAction(key, book)" />
          </template>

          <div class="flex items-center gap-2">
            <div class="flex flex-col gap-0.5 flex-1 min-w-0">
              <p class="text-md font-semibold text-black truncate flex-1 min-w-0">
                {{ book.title }}
              </p>
            </div>
            <span
              :class="`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${BOOK_STATUS_BADGE}`"
            >
              {{ t(myBookStatus(book)) }}
            </span>
          </div>

          <!-- Given to you: the donor is the useful name here, not the
               requester — you are the requester. -->
          <p v-if="book.role === 'receiver'" class="mt-auto text-xs text-gray-500">
            {{
              book.donor
                ? t('dashboard.books.receivedFrom', {
                    name: displayName(book.donor.first_name, book.donor.last_name),
                  })
                : t('dashboard.books.donatedNoRecipient')
            }}
          </p>

          <!-- Donated: say who got it. getMyBooks attaches the accepted request
               with its requester, so the name is already in the payload. -->
          <p v-else-if="book.status !== 'available'" class="mt-auto text-xs text-gray-500">
            {{
              book.request?.requester
                ? t('dashboard.books.donatedTo', {
                    name: displayName(
                      book.request.requester.first_name,
                      book.request.requester.last_name,
                    ),
                  })
                : t('dashboard.books.donatedNoRecipient')
            }}
          </p>

          <!-- Still on the shelf. Says the same kind of thing as the line above,
               so every card carries one and the grid stays even. -->
          <p v-else class="mt-auto text-xs text-gray-500">
            {{ t('dashboard.books.availableHint') }}
          </p>
        </BookGridCard>
      </div>
    </template>
  </div>

  <!-- Donate / edit book modal -->

  <ConfirmActionModal
    v-if="cancelHandoverTarget"
    :title="t('dashboard.books.confirmCancelHandoverTitle')"
    :message="
      t('dashboard.books.confirmCancelHandoverMessage', { name: cancelHandoverTarget.name })
    "
    :confirm-label="t('dashboard.books.cancelHandover')"
    tone="danger"
    :loading="requestAction === cancelHandoverTarget.requestId"
    @cancel="cancelHandoverTarget = null"
    @confirm="onCancelReservation(cancelHandoverTarget!.bookId, cancelHandoverTarget!.requestId)"
  />

  <AcceptRequestModal
    v-if="acceptTarget"
    :loading="requestAction === acceptTarget.requestId"
    @cancel="acceptTarget = null"
    @confirm="onAcceptRequest(acceptTarget!.bookId, acceptTarget!.requestId)"
  />

  <Teleport to="body">
    <DonateBookModal
      v-if="showDonate"
      :edit-book="editingBook"
      @close="closeDonate"
      @donated="onBookDonated"
      @updated="onBookUpdated"
    />
  </Teleport>

  <!-- Delete book confirmation -->
  <Teleport to="body">
    <div
      v-if="showDeleteBookModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4"
      @click.self="showDeleteBookModal = false"
    >
      <div class="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <p class="text-center text-lg font-semibold text-black">
          {{ t('dashboard.books.deleteBookTitle') }}
        </p>
        <p class="mt-2 text-center text-sm text-gray-500">
          {{ t('dashboard.books.deleteBookConfirm') }}
        </p>
        <div class="mt-6 grid grid-cols-2 gap-3">
          <button
            type="button"
            class="rounded-xl border border-[#B0B0B0] py-2 text-sm text-black hover:bg-gray-50"
            @click="showDeleteBookModal = false"
          >
            {{ t('dashboard.books.cancel') }}
          </button>
          <button
            type="button"
            :disabled="deletingBook"
            class="rounded-xl bg-red-500 py-2 text-sm text-white hover:bg-red-600 disabled:opacity-60"
            @click="confirmDeleteBook"
          >
            {{ deletingBook ? t('dashboard.books.deleting') : t('dashboard.books.delete') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- Decline request — ask for a reason -->
  <DeclineRequestModal
    v-if="declineTarget"
    :loading="declining"
    @cancel="declineTarget = null"
    @confirm="confirmDeclineRequest"
  />
</template>
