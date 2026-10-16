<script setup lang="ts">
/**
 * Re-reads one table, without reloading the page.
 *
 * A browser refresh would also throw away the open tab, every filter, the page
 * number and the scroll position — all of which the admin has just set by hand.
 * This asks the one list in front of them for fresh rows and leaves the rest
 * alone.
 *
 * The caller keeps the `refreshing` flag separate from its own first-load flag
 * on purpose. Each tab replaces its table with a centred spinner while loading,
 * which is right the first time and wrong here: rows that vanish and come back
 * are the page reload this button exists to avoid. Held apart, the stale rows
 * stay on screen and only the icon spins.
 */
defineProps<{
  refreshing?: boolean
  /** The tab's own loading flag, so a press during the first load is ignored. */
  loading?: boolean
  /** Names the list for screen readers — "Refresh users", "Refresh books". */
  label: string
}>()

defineEmits<{ (e: 'refresh'): void }>()
</script>

<template>
  <!-- p-2.5 with a 16px icon, not p-2: the filters and search box beside this
       are `py-2` around `text-sm`, whose line box is 20px, so they stand 38px
       tall. 16 + 2*10 + 2 borders matches that exactly and keeps the button
       square; p-2 left it 4px short and visibly out of line. -->
  <button
    type="button"
    class="h-auto flex shrink-0 items-center justify-center rounded-xl border bg-white border-gray-200 p-2.5 text-gray-500 transition hover:border-primary hover:text-primary hover:cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
    :disabled="refreshing || loading"
    :aria-label="label"
    :title="refreshing ? 'Refreshing…' : 'Refresh'"
    @click="$emit('refresh')"
  >
    <svg
      class="h-4 w-4"
      :class="refreshing ? 'animate-spin' : ''"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      stroke-width="2"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M16.023 9.348h4.992V4.356m0 4.992-3.181-3.183a8.25 8.25 0 0 0-13.803 3.7M7.977 14.652H2.985v4.992m0-4.992 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7"
      />
    </svg>
  </button>
</template>
