<script setup lang="ts">
import logoUrl from '@/assets/images/techno_share_logo_trimmed.png'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

/**
 * Site footer. Mounted by HomeView alone, not by UserLayout: the inner pages
 * are working surfaces — a dashboard column that scrolls to the sidebar's
 * height, a feed that pages — and a footer under those either floats in the
 * middle of a short page or has to be scrolled past to reach the pager.
 *
 * Three groups on one row: identity, then the pages, then the accounts.
 */
const { t } = useI18n({ useScope: 'global' })

// Not a literal: the notice would quietly go stale every 1 January.
const year = computed(() => new Date().getFullYear())

/**
 * The middle group. Destinations are placeholders — these three pages do not
 * exist yet, and '#' is here to be replaced by a route, a mailto:, or a
 * Telegram link once they do.
 */
const links = [
  { key: 'about', href: '#' },
  { key: 'support', href: '#' },
  { key: 'feedback', href: '#' },
] as const

/**
 * Brand marks, drawn at 24px on a 24 viewBox so `h-5 w-5` scales them evenly.
 * Inline rather than an icon package: three icons do not earn a dependency,
 * and these inherit currentColor so the hover state is one class.
 */
const socials = [
  {
    key: 'facebook',
    href: '#',
    path: 'M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z',
  },
  {
    key: 'instagram',
    href: '#',
    path: 'M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0Zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03Zm0 3.678a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324ZM12 16c-2.209 0-4-1.791-4-4s1.791-4 4-4 4 1.791 4 4-1.791 4-4 4Zm7.846-10.405a1.441 1.441 0 0 1-2.88 0 1.44 1.44 0 0 1 2.88 0Z',
  },
  {
    key: 'x',
    href: '#',
    path: 'M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z',
  },
] as const
</script>

<template>
  <footer class="mt-16 border-t border-gray-100 bg-white">
    <!-- Stacked and centred on a phone, one row from md up. The md:items-start
         is deliberate on the wide layout: the left group is two lines tall and
         the others are one, so centring there would hang the links off the
         logo's midpoint. Stacked, there is no row to align to — each group is
         its own line, and a left edge with nothing beside it reads as ragged. -->
    <div
      class="mx-auto flex max-w-7xl flex-col items-center gap-8 px-6 py-10 text-center md:flex-row md:items-start md:justify-between md:text-left"
    >
      <!-- Identity -->
      <div class="flex flex-col items-center gap-2 md:items-start">
        <router-link to="/" class="transition hover:opacity-80 hover:cursor-pointer">
          <img :src="logoUrl" alt="ITC Sharing" class="h-10 w-auto object-contain" />
        </router-link>
        <p class="text-xs text-gray-400">
          {{ t('common.footer.copyright', { year }) }} {{ t('common.footer.rights') }}
        </p>
      </div>

      <!-- Pages -->
      <nav class="flex flex-wrap items-center justify-center gap-6 md:mr-15 md:justify-start">
        <a
          v-for="link in links"
          :key="link.key"
          :href="link.href"
          class="text-sm font-medium text-gray-900 transition hover:text-primary hover:cursor-pointer"
        >
          {{ t(`common.footer.${link.key}`) }}
        </a>
      </nav>

      <!-- Accounts -->
      <div class="flex items-center justify-center gap-4 md:justify-start">
        <a
          v-for="social in socials"
          :key="social.key"
          :href="social.href"
          target="_blank"
          rel="noopener noreferrer"
          :aria-label="t(`common.footer.${social.key}`)"
          class="text-gray-900 transition hover:text-primary hover:cursor-pointer"
        >
          <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path :d="social.path" />
          </svg>
        </a>
      </div>
    </div>
  </footer>
</template>
