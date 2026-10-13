<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useBooksStore } from '@/stores/books.store'
import DashboardSidebar from '@/components/dashboard/DashboardSidebar.vue'

const route = useRoute()
const { t } = useI18n({ useScope: 'global' })
const booksStore = useBooksStore()

/**
 * Profile is the one child that is a single form rather than its own set of
 * panels, so the column gives it the card the other views bring themselves.
 */
const isProfile = computed(() => route.name === 'profile')

/**
 * Children whose content is meant to END level with the sidebar and scroll
 * inside itself. That needs a FIXED height to push against — a min-height just
 * grows with the content, so nothing ever overflows enough to scroll.
 *
 * Profile is here for the same reason as the panels, even though it is a form:
 * it outgrew the viewport once the Telegram card joined it, and scrolling the
 * whole page to reach the bottom of one card left the sidebar sliding away.
 * The form scrolls within its card instead — see ProfileView's root.
 *
 * A list, not every route: the books grids rely on the column growing, and a
 * fixed height would clip them.
 */
const FILLS_COLUMN = [
  'dashboard',
  'dashboard-documents',
  'profile',
  // The review queue scrolls inside its own panel, so the column has to stop
  // growing for there to be an overflow at all.
  'dashboard-review-documents',
  'dashboard-review-files',
]

/**
 * Routes that render the page title themselves, beside their own header
 * controls. The generic heading below would otherwise repeat it on a line of
 * its own — two rows saying the same thing.
 */
const OWN_MOBILE_TITLE = [
  'dashboard',
  // Names the submission in its own header card, so the generic heading would
  // only repeat it — and has no mobileTitle key, which is why it showed raw.
  'dashboard-review-files',
  'dashboard-books',
  'dashboard-books-approve',
  'dashboard-books-reserved',
  'dashboard-books-requesting',
]
const ownsMobileTitle = computed(() => OWN_MOBILE_TITLE.includes(route.name as string))
const fillsColumn = computed(() => FILLS_COLUMN.includes(route.name as string))

const currentLabel = computed(() => {
  const key = route.name as string
  return key ? t(`dashboard.mobileTitle.${key}`) : ''
})

// The sidebar badge needs the pending-request count on every tab; each child
// route fetches only the data its own view requires.
onMounted(() => {
  booksStore.fetchBookStats()
})
</script>

<template>
  <!-- Not min-h-screen: UserLayout already offsets content by pt-25 (100px)
       to clear the fixed navbar, so a full 100vh on top of that guarantees a
       scrollbar even on an empty page. Subtract the offset instead. -->
  <div class="min-h-[calc(100vh-100px)] bg-[#F7F8FA]">
    <!-- pb-28 on a phone: the sidebar is fixed over the page down there, so
         without it the last row of content sits under the bar and cannot be
         scrolled into view. -->
    <div
      class="mx-auto max-w-7xl px-4 sm:px-6 pb-28 md:pb-0 flex flex-col md:flex-row gap-6 items-start"
    >
      <DashboardSidebar />

      <!-- ── Content ──────────────────────────────────────────────────────── -->
      <!-- Same height as the sidebar so both columns bottom out together. Fixed
           on the routes whose panels scroll internally, a minimum everywhere
           else so long pages can still grow. -->
      <div
        :class="[
          // w-full matters on a phone, where the wrapper is flex-col and
          // `items-start` makes the cross axis horizontal: without it this
          // column is sized to its content, so an overflow-x-auto row inside
          // has nothing to overflow and widens the whole page instead. The
          // sidebar never hit this because <aside> already carries w-full.
          // gap-3 on a phone: the column's only children are the mobile title
          // and the page, so this gap is the space under that heading — 24px
          // there read as a break rather than a label sitting on its content.
          'w-full flex-1 min-w-0 flex flex-col gap-3 md:gap-6',
          fillsColumn ? 'md:h-[calc(100vh-148px)] md:min-h-0' : 'md:min-h-[calc(100vh-148px)]',
          isProfile ? 'bg-white border border-gray-100 rounded-2xl p-6 md:p-8' : '',
        ]"
      >
        <!-- Mobile title -->
        <div v-if="!ownsMobileTitle" class="md:hidden">
          <h1 class="text-xl font-bold text-gray-900">{{ currentLabel }}</h1>
        </div>

        <router-view />
      </div>
    </div>
  </div>
</template>
