<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth.store'
import UserAvatar from '@/components/base/UserAvatar.vue'
import { useBooksStore } from '@/stores/books.store'

const route = useRoute()
const router = useRouter()
const { t } = useI18n({ useScope: 'global' })
const auth = useAuthStore()
const booksStore = useBooksStore()

const greetingName = computed(() => auth.user?.first_name || 'there')
const userInitials = computed(
  () =>
    ((auth.user?.first_name?.[0] ?? '') + (auth.user?.last_name?.[0] ?? '')).toUpperCase() || 'U',
)

type SidebarRoute =
  | 'dashboard'
  | 'dashboard-documents'
  | 'dashboard-books'
  | 'dashboard-books-approve'
  | 'dashboard-books-reserved'
  | 'dashboard-books-requesting'
  | 'profile'
  | 'dashboard-review-documents'

type NavItem = {
  name: SidebarRoute
  label: string
  /**
   * What the phone's icon row prints under the icon. The full label is written
   * for a 256px column — "Approve requests" wraps to three lines in a 64px tab —
   * so every entry names itself in one word instead of being truncated into
   * something unreadable.
   */
  short: string
  badge?: boolean
}

/**
 * A heading with its own entries under it. Book Activity is the only one: the
 * two directions of request traffic are different lists, not a filter of one,
 * so each gets a destination and the group name just says what they have in
 * common. Clicking the heading opens the group on its first entry — see
 * openActivity.
 */
type NavGroup = { label: string; short: string; children: NavItem[] }

const navItems = computed<NavItem[]>(() => [
  {
    name: 'dashboard',
    label: t('dashboard.sidebar.nav.activity'),
    short: t('dashboard.sidebar.short.activity'),
  },
  {
    name: 'dashboard-documents',
    label: t('dashboard.sidebar.nav.documents'),
    short: t('dashboard.sidebar.short.documents'),
  },
  {
    name: 'dashboard-books',
    label: t('dashboard.sidebar.filters.yourBook'),
    short: t('dashboard.sidebar.short.books'),
  },
])

const bookActivity = computed<NavGroup>(() => ({
  label: t('dashboard.sidebar.filters.received'),
  short: t('dashboard.sidebar.short.requests'),
  children: [
    // The pending count belongs on the entry that can actually answer them.
    {
      name: 'dashboard-books-approve',
      label: t('dashboard.sidebar.filters.approve'),
      short: t('dashboard.sidebar.short.requests'),
      badge: true,
    },
    // Accepted and waiting on the receiver: your handovers in flight.
    {
      name: 'dashboard-books-reserved',
      label: t('dashboard.sidebar.filters.reserved'),
      short: t('dashboard.sidebar.short.books'),
    },
    {
      name: 'dashboard-books-requesting',
      label: t('dashboard.sidebar.filters.myRequests'),
      short: t('dashboard.sidebar.short.requests'),
    },
  ],
}))

/**
 * Admins and department moderators both review submissions, so both see the
 * entry; a student never does. It opens the existing approvals screen rather
 * than a second one.
 *
 * This decides what is *shown*, never what may be reviewed: the queue itself
 * comes back already narrowed to the reviewer's departments by the server.
 */
const canReview = computed(
  () => auth.user?.role?.toLowerCase() === 'admin' || !!auth.user?.is_moderator,
)

const trailingItems = computed<NavItem[]>(() => [
  {
    name: 'profile',
    label: t('common.profilePage.title'),
    short: t('dashboard.sidebar.short.profile'),
  },
])

/**
 * The review queue — a plain entry, not a heading.
 *
 * It used to expand into subjects and documents, two queues with their own
 * filters. Subjects are no longer reviewed, so the group had one child left: a
 * chevron that revealed a single row repeating the heading above it. The
 * content moved up into the entry itself, which now goes straight to the
 * document queue. The admin panel settled the same question the same way.
 */
const reviewItem = computed<NavItem>(() => ({
  name: 'dashboard-review-documents',
  label: t('dashboard.sidebar.nav.review'),
  short: t('dashboard.sidebar.short.review'),
}))

/** Open state of the Book Activity group. */
const activityOpen = ref(false)

const activityActive = computed(() =>
  bookActivity.value.children.some((child) => route.name === child.name),
)

// Being on one of its pages opens the group, so the entry you are looking at is
// never hidden behind a collapsed heading — including on a fresh page load.
watch(
  activityActive,
  (active) => {
    if (active) activityOpen.value = true
  },
  { immediate: true },
)

/**
 * Flattened for rendering: one v-for keeps the icon switch in a single place
 * rather than repeating the button markup per section.
 */
type NavRow = { heading: string; short: string } | { item: NavItem; child?: boolean }

const navRows = computed<NavRow[]>(() => [
  ...navItems.value.map((item) => ({ item })),
  {
    heading: bookActivity.value.label,
    short: bookActivity.value.short,
  },
  ...(activityOpen.value ? bookActivity.value.children.map((item) => ({ item, child: true })) : []),
  ...(canReview.value ? [{ item: reviewItem.value }] : []),
  ...trailingItems.value.map((item) => ({ item })),
])

function isActive(item: NavItem) {
  return route.name === item.name
}

const pendingIncomingCount = computed(() => booksStore.bookStats.pendingIncoming)

async function handleLogout() {
  auth.logout()
  await router.push('/')
}

function onNavClick(item: NavItem) {
  router.push({ name: item.name })
}

/**
 * The heading is a destination as well as a toggle: clicking it opens the group
 * and lands on its first entry, which is the one with requests to answer.
 * Collapsing is left to the chevron beside it, so the row does not have to
 * guess which of the two you meant.
 */
function openActivity() {
  activityOpen.value = true
  const first = bookActivity.value.children[0]
  if (first) void router.push({ name: first.name })
}
</script>

<template>
  <!-- One solid panel, nav at the top and the account pinned to the bottom —
       the account is a destination you reach for, not the first thing to read. -->
  <!-- A floating bar pinned to the bottom of the screen on a phone, the usual
       column from md up. Fixed rather than sticky: the tabs stay reachable
       wherever the page is scrolled, which is the point of a bottom bar. The
       inset left/right/bottom is what makes it float rather than sit flush, and
       the width comes from those insets — hence no w-full below md. -->
  <aside
    class="fixed bottom-3 left-3 right-3 z-40 shadow-lg shrink-0 md:sticky md:inset-auto md:top-[100px] md:z-auto md:w-64 md:shadow-none rounded-2xl border border-gray-100 bg-white md:min-h-[calc(100vh-148px)] p-3 flex flex-col"
  >
    <!-- Nav -->
    <!-- A row of icons on a phone, the usual column from md up. The panel was
         a full-height list there, so reaching any page meant scrolling past the
         whole menu first. Horizontal overflow rather than wrapping: one line of
         targets stays predictable as entries come and go. -->
    <nav class="flex gap-1 overflow-x-auto scrollbar-hide md:flex-col md:overflow-x-visible">
      <template v-for="(row, i) in navRows" :key="'heading' in row ? row.heading : row.item.label">
        <!-- A row, not a single button: the label navigates and the chevron
             collapses, and a button cannot contain another button. -->
        <div
          v-if="'heading' in row"
          :class="[
            'flex items-center rounded-xl text-sm font-medium transition-all',
            // Phone: a tab — icon over a one-word label. Desktop: the row.
            'relative w-16 shrink-0 flex-col justify-center gap-1 py-1.5 md:w-full md:flex-row md:gap-3 md:py-2.5 md:px-3',
            // The group carries the block of colour; its entries below stay
            // plain, so only one row in the section reads as a panel.
            activityActive
              ? 'bg-primary text-white font-semibold shadow-sm'
              : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700',
            i > 0 ? 'md:mt-1' : '',
          ]"
        >
          <button
            type="button"
            class="flex min-w-0 w-full flex-col items-center justify-center gap-1 hover:cursor-pointer md:w-auto md:flex-1 md:flex-row md:gap-3 md:text-left"
            @click="openActivity()"
          >
            <!-- Open book with a tick: requests about books, answered. Drawn
                 here rather than imported — fill-rule evenodd turns the second
                 subpath into a cut-out, so the tick reads through the page. -->
            <svg class="h-5 w-5 shrink-0" fill="currentColor" viewBox="0 0 640 640">
              <path
                fill-rule="evenodd"
                d="M320 180C260 130 160 120 70 140L70 470C160 450 260 460 320 510C380 460 480 450 570 470L570 140C480 120 380 130 320 180ZM200 330L300 430L470 250L430 210L300 350L240 290Z"
              />
            </svg>
            <!-- Two spans, one per width: `hidden` takes the other out of the
                 accessibility tree as well, so only the visible one is read. -->
            <span class="hidden flex-1 truncate md:block">{{ row.heading }}</span>
            <span class="w-full truncate text-center text-[10px] leading-tight md:hidden">
              {{ row.short }}
            </span>
          </button>

          <!-- Collapsed, the count would otherwise be hidden with its entry. -->
          <span
            v-if="!activityOpen && pendingIncomingCount"
            class="h-5 min-w-5 px-1.5 rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center max-md:absolute max-md:-right-1 max-md:-top-1"
            >{{ pendingIncomingCount }}</span
          >

          <button
            type="button"
            :aria-expanded="activityOpen"
            :aria-label="row.heading"
            class="hidden shrink-0 rounded-lg hover:cursor-pointer md:block"
            @click="activityOpen = !activityOpen"
          >
            <svg
              class="h-4 w-4 shrink-0 transition-transform"
              :class="activityOpen ? 'rotate-180' : ''"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>

        <button
          v-else
          @click="onNavClick(row.item)"
          :class="[
            'flex items-center rounded-xl text-sm font-medium transition-all text-left hover:cursor-pointer',
            // Phone: a tab — icon over a one-word label. Desktop: the row.
            'w-16 shrink-0 flex-col justify-center gap-1 py-1.5 md:w-full md:flex-row md:gap-3 md:justify-start md:py-2.5',
            // A child is one of a group's entries — it only exists once that
            // group is open, which the row has no room to express.
            row.child ? 'max-md:hidden md:pl-7 md:pr-3' : 'md:px-3',
            // Sub-entries wear no panel at all — the heading above is the one
            // filled row in the section, and a second would compete with it.
            row.child
              ? isActive(row.item)
                ? 'text-primary font-semibold'
                : 'text-gray-500 hover:text-gray-700'
              : isActive(row.item)
                ? 'bg-primary text-white font-semibold shadow-sm'
                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700',
          ]"
        >
          <!-- A dot, not an icon: nested entries read as a list under their
               heading, and four icons in a column compete with it. -->
          <span
            v-if="row.child"
            class="h-1.5 w-1.5 shrink-0 rounded-full"
            :class="isActive(row.item) ? 'bg-primary' : 'bg-gray-300'"
          />
          <!-- Filled, not stroked: the same four rounded squares, drawn solid. -->
          <svg
            v-else-if="row.item.name === 'dashboard'"
            class="h-5 w-5 shrink-0"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z"
            />
          </svg>
          <svg
            v-else-if="row.item.name === 'dashboard-documents'"
            class="h-5 w-5 shrink-0"
            fill="currentColor"
            viewBox="0 0 640 640"
          >
            <path
              d="M128 128C128 92.7 156.7 64 192 64L341.5 64C358.5 64 374.8 70.7 386.8 82.7L493.3 189.3C505.3 201.3 512 217.6 512 234.6L512 512C512 547.3 483.3 576 448 576L192 576C156.7 576 128 547.3 128 512L128 128zM336 122.5L336 216C336 229.3 346.7 240 360 240L453.5 240L336 122.5zM248 320C234.7 320 224 330.7 224 344C224 357.3 234.7 368 248 368L392 368C405.3 368 416 357.3 416 344C416 330.7 405.3 320 392 320L248 320zM248 416C234.7 416 224 426.7 224 440C224 453.3 234.7 464 248 464L392 464C405.3 464 416 453.3 416 440C416 426.7 405.3 416 392 416L248 416z"
            />
          </svg>
          <svg
            v-else-if="row.item.name === 'profile'"
            class="h-5 w-5 shrink-0"
            fill="currentColor"
            viewBox="0 0 640 640"
          >
            <path
              d="M320 312C386.3 312 440 258.3 440 192C440 125.7 386.3 72 320 72C253.7 72 200 125.7 200 192C200 258.3 253.7 312 320 312zM290.3 368C191.8 368 112 447.8 112 546.3C112 562.7 125.3 576 141.7 576L498.3 576C514.7 576 528 562.7 528 546.3C528 447.8 448.2 368 349.7 368L290.3 368z"
            />
          </svg>
          <!-- Clipboard with a tick: submissions waiting to be checked. -->
          <svg
            v-else-if="row.item.name === 'dashboard-review-documents'"
            class="h-5 w-5 shrink-0"
            fill="currentColor"
            viewBox="0 0 640 640"
          >
            <path
              d="M384 64C407.7 64 428.4 76.9 439.4 96L448 96C483.3 96 512 124.7 512 160L512 512C512 547.3 483.3 576 448 576L192 576C156.7 576 128 547.3 128 512L128 160C128 124.7 156.7 96 192 96L200.6 96C211.6 76.9 232.3 64 256 64L384 64zM410.9 276.6C400.2 268.8 385.2 271.2 377.4 281.9L291.8 399.6L265.3 372.2C256.1 362.7 240.9 362.4 231.4 371.6C221.9 380.8 221.6 396 230.8 405.5L277.2 453.5C282.1 458.6 289 461.3 296.1 460.8C303.2 460.3 309.7 456.7 313.9 451L416.2 310.1C424 299.4 421.6 284.4 410.9 276.6zM264 128C250.7 128 240 138.7 240 152C240 165.3 250.7 176 264 176L376 176C389.3 176 400 165.3 400 152C400 138.7 389.3 128 376 128L264 128z"
            />
          </svg>
          <svg v-else class="h-5 w-5 shrink-0" fill="currentColor" viewBox="0 0 640 640">
            <path
              d="M480 576L192 576C139 576 96 533 96 480L96 160C96 107 139 64 192 64L496 64C522.5 64 544 85.5 544 112L544 400C544 420.9 530.6 438.7 512 445.3L512 512C529.7 512 544 526.3 544 544C544 561.7 529.7 576 512 576L480 576zM192 448C174.3 448 160 462.3 160 480C160 497.7 174.3 512 192 512L448 512L448 448L192 448zM224 216C224 229.3 234.7 240 248 240L424 240C437.3 240 448 229.3 448 216C448 202.7 437.3 192 424 192L248 192C234.7 192 224 202.7 224 216zM248 288C234.7 288 224 298.7 224 312C224 325.3 234.7 336 248 336L424 336C437.3 336 448 325.3 448 312C448 298.7 437.3 288 424 288L248 288z"
            />
          </svg>
          <span class="hidden flex-1 md:block">{{ row.item.label }}</span>
          <span class="w-full truncate text-center text-[10px] leading-tight md:hidden">
            {{ row.item.short }}
          </span>
          <span
            v-if="row.item.badge && pendingIncomingCount"
            :class="[
              'h-5 min-w-5 px-1.5 rounded-full text-[10px] font-bold flex items-center justify-center',
              // The translucent badge only works against the solid pill, which
              // a sub-entry no longer has — there it was white on white.
              isActive(row.item) && !row.child ? 'bg-white/30 text-white' : 'bg-red-500 text-white',
            ]"
            >{{ pendingIncomingCount }}</span
          >
        </button>
      </template>
    </nav>

    <!-- mt-auto pins this to the bottom on desktop; on mobile the panel is
         short and it simply follows the nav. -->
    <!-- Desktop only: in the phone's icon row there is no bottom to pin it to,
         and the navbar's own avatar menu already reaches the same places. -->
    <div class="mt-auto hidden pt-4 md:block">
      <div class="flex items-center gap-3 rounded-xl bg-gray-50 p-3">
        <div
          class="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-primary flex items-center justify-center"
        >
          <UserAvatar
            :src="auth.user?.avatar_url"
            :initials="userInitials"
            text-class="text-sm !text-white"
          />
        </div>
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-semibold text-gray-900">
            {{ auth.fullName || greetingName }}
          </p>
          <p class="truncate text-[11px] text-gray-400">{{ auth.user?.email }}</p>
        </div>

        <button
          type="button"
          @click="handleLogout"
          :title="t('common.nav.logout')"
          :aria-label="t('common.nav.logout')"
          class="shrink-0 flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 cursor-pointer"
        >
          <svg
            class="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
            />
          </svg>
        </button>
      </div>
    </div>
  </aside>
</template>
