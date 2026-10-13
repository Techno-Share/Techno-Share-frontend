<script setup lang="ts">
import { ref, onBeforeUnmount } from 'vue'

export type RowAction = {
  key: string
  label: string
  tone?: 'success' | 'danger'
}

/**
 * Icons keyed by action, not passed in by callers: every menu in the app draws
 * from the same small vocabulary, so resolving here keeps Edit and Delete
 * identical across the documents, books and admin menus, and a new menu gets
 * them for free.
 *
 * Outline paths on a 24 viewBox, matching the stroke icons used elsewhere. The
 * pin repeats the silhouette DocumentCard shows on a pinned card, so the menu
 * entry and the marker it produces read as the same thing.
 */
const ICONS: Record<string, string> = {
  approve: 'M5 13l4 4L19 7',
  unban: 'M5 13l4 4L19 7',
  ban: 'M18.4 5.6a9 9 0 11-12.8 12.8 9 9 0 0112.8-12.8zM5.6 5.6l12.8 12.8',
  role: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
  /**
   * Shield with a tick, for granting moderator rights. Distinct from `approve`,
   * which is a bare tick: that one clears a single submission, this one hands
   * someone the standing authority to clear them. A second person silhouette
   * would have been indistinguishable from `role` at 16px.
   */
  moderator:
    'M9 12.75L11.25 15 15 9.75M12 2.714a11.959 11.959 0 01-8.402 3.286A11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152a11.959 11.959 0 01-8.25-3.285z',
  /**
   * The same shield with a minus where the tick is — grant and revoke differ
   * only by the mark inside, which is what makes the pair readable at 16px.
   *
   * Not the struck-through treatment `unhidden` and `unpinned` use: a diagonal
   * long enough to read as a slash swallows the shield at this size, leaving
   * something closer to a no-entry sign than a revoked badge.
   */
  'remove-moderator':
    'M12 2.714a11.959 11.959 0 01-8.402 3.286A11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152a11.959 11.959 0 01-8.25-3.285z M9 12.75h6',
  placement:
    'M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.42A12 12 0 0118 15.29 12 12 0 0112 21a12 12 0 01-6.16-5.71A12 12 0 015.84 10.58L12 14z',
  reject: 'M6 18L18 6M6 6l12 12',
}

/**
 * Icons drawn as a filled shape on a 640 grid rather than a stroked 24 one.
 * They cannot share the outline <svg> above — `fill="none"` would render them
 * invisible — so the template picks the element by which map the key is in.
 */
const SOLID_ICONS: Record<string, string> = {
  edit: 'M535.6 85.7C513.7 63.8 478.3 63.8 456.4 85.7L432 110.1L529.9 208L554.3 183.6C576.2 161.7 576.2 126.3 554.3 104.4L535.6 85.7zM236.4 305.7C230.3 311.8 225.6 319.3 222.9 327.6L193.3 416.4C190.4 425 192.7 434.5 199.1 441C205.5 447.5 215 449.7 223.7 446.8L312.5 417.2C320.7 414.5 328.2 409.8 334.4 403.7L496 241.9L398.1 144L236.4 305.7zM160 128C107 128 64 171 64 224L64 480C64 533 107 576 160 576L416 576C469 576 512 533 512 480L512 384C512 366.3 497.7 352 480 352C462.3 352 448 366.3 448 384L448 480C448 497.7 433.7 512 416 512L160 512C142.3 512 128 497.7 128 480L128 224C128 206.3 142.3 192 160 192L256 192C273.7 192 288 177.7 288 160C288 142.3 273.7 128 256 128L160 128z',
  // Eye for Hide, struck-through eye for Unhide: the icon shows the state the
  // row is in now, and the label says what the click does.
  hidden:
    'M320 96C239.2 96 174.5 132.8 127.4 176.6C80.6 220.1 49.3 272 34.4 307.7C31.1 315.6 31.1 324.4 34.4 332.3C49.3 368 80.6 420 127.4 463.4C174.5 507.1 239.2 544 320 544C400.8 544 465.5 507.2 512.6 463.4C559.4 419.9 590.7 368 605.6 332.3C608.9 324.4 608.9 315.6 605.6 307.7C590.7 272 559.4 220 512.6 176.6C465.5 132.9 400.8 96 320 96zM176 320C176 240.5 240.5 176 320 176C399.5 176 464 240.5 464 320C464 399.5 399.5 464 320 464C240.5 464 176 399.5 176 320zM320 256C320 291.3 291.3 320 256 320C244.5 320 233.7 317 224.3 311.6C223.3 322.5 224.2 333.7 227.2 344.8C240.9 396 293.6 426.4 344.8 412.7C396 399 426.4 346.3 412.7 295.1C400.5 249.4 357.2 220.3 311.6 224.3C316.9 233.6 320 244.4 320 256z',
  unhidden:
    'M73 39.1C63.6 29.7 48.4 29.7 39.1 39.1C29.8 48.5 29.7 63.7 39 73.1L567 601.1C576.4 610.5 591.6 610.5 600.9 601.1C610.2 591.7 610.3 576.5 600.9 567.2L504.5 470.8C507.2 468.4 509.9 466 512.5 463.6C559.3 420.1 590.6 368.2 605.5 332.5C608.8 324.6 608.8 315.8 605.5 307.9C590.6 272.2 559.3 220.2 512.5 176.8C465.4 133.1 400.7 96.2 319.9 96.2C263.1 96.2 214.3 114.4 173.9 140.4L73 39.1zM236.5 202.7C260 185.9 288.9 176 320 176C399.5 176 464 240.5 464 320C464 351.1 454.1 379.9 437.3 403.5L402.6 368.8C415.3 347.4 419.6 321.1 412.7 295.1C399 243.9 346.3 213.5 295.1 227.2C286.5 229.5 278.4 232.9 271.1 237.2L236.4 202.5zM357.3 459.1C345.4 462.3 332.9 464 320 464C240.5 464 176 399.5 176 320C176 307.1 177.7 294.6 180.9 282.7L101.4 203.2C68.8 240 46.4 279 34.5 307.7C31.2 315.6 31.2 324.4 34.5 332.3C49.4 368 80.7 420 127.5 463.4C174.6 507.1 239.3 544 320.1 544C357.4 544 391.3 536.1 421.6 523.4L357.4 459.2z',
  // Struck-through pin: the action undoes a pin, so it shows the end state.
  unpinned:
    'M73 39.1C63.6 29.7 48.4 29.7 39.1 39.1C29.8 48.5 29.7 63.7 39 73.1L567 601.1C576.4 610.5 591.6 610.5 600.9 601.1C610.2 591.7 610.3 576.5 600.9 567.2L449.8 416L480 416C490 416 499.5 411.3 505.5 403.3C511.5 395.3 513.5 384.9 510.7 375.2L507 361.8C494.6 318.5 466 283.3 428.8 262.1L418.5 128L448 128C465.7 128 480 113.7 480 96C480 78.3 465.7 64 448 64L192 64C184.6 64 177.9 66.5 172.5 70.6L222.1 120.3L217.3 183.4L73 39.1zM314.2 416L181.7 283.6C159 304.1 141.9 331 133 361.9L129.2 375.3C126.4 385 128.4 395.3 134.4 403.4C140.4 411.5 150 416 160 416L314.2 416zM288 576C288 593.7 302.3 608 320 608C337.7 608 352 593.7 352 576L352 464L288 464L288 576z',
  pinned:
    'M160 96C160 78.3 174.3 64 192 64L448 64C465.7 64 480 78.3 480 96C480 113.7 465.7 128 448 128L418.5 128L428.8 262.1C465.9 283.3 494.6 318.5 507 361.8L510.8 375.2C513.6 384.9 511.6 395.2 505.6 403.3C499.6 411.4 490 416 480 416L160 416C150 416 140.5 411.3 134.5 403.3C128.5 395.3 126.5 384.9 129.3 375.2L133 361.8C145.4 318.5 174 283.3 211.2 262.1L221.5 128L192 128C174.3 128 160 113.7 160 96zM288 464L352 464L352 576C352 593.7 337.7 608 320 608C302.3 608 288 593.7 288 576L288 464z',
  delete:
    'M232.7 69.9L224 96L128 96C110.3 96 96 110.3 96 128C96 145.7 110.3 160 128 160L512 160C529.7 160 544 145.7 544 128C544 110.3 529.7 96 512 96L416 96L407.3 69.9C402.9 56.8 390.7 48 376.9 48L263.1 48C249.3 48 237.1 56.8 232.7 69.9zM512 208L128 208L149.1 531.1C150.7 556.4 171.7 576 197 576L443 576C468.3 576 489.3 556.4 490.9 531.1L512 208z',
}

const props = defineProps<{ items: RowAction[]; disabled?: boolean }>()
const emit = defineEmits<{ (e: 'select', key: string): void }>()

const button = ref<HTMLButtonElement | null>(null)
const open = ref(false)
const pos = ref({ top: 0, right: 0 })

/**
 * The menu is teleported to <body> with fixed coords: rows live inside a card
 * with `overflow-y-auto`, which would clip an absolutely positioned dropdown.
 */
function place() {
  const rect = button.value?.getBoundingClientRect()
  if (!rect) return
  // Anchored by its right edge so the panel sizes to its labels instead of
  // being padded out to a fixed width.
  pos.value = { top: rect.bottom + 6, right: Math.max(8, window.innerWidth - rect.right) }
}

function close() {
  open.value = false
  document.removeEventListener('mousedown', onOutside)
  document.removeEventListener('keydown', onKeydown)
  window.removeEventListener('scroll', close, true)
  window.removeEventListener('resize', close)
}

// `mousedown`, not `click`: a re-render between mousedown and click can detach
// the target, which makes the trigger itself read as "outside".
function onOutside(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (button.value?.contains(target)) return
  if (target?.closest?.('[data-row-actions-menu]')) return
  close()
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}

function toggle() {
  if (props.disabled) return
  if (open.value) {
    close()
    return
  }
  place()
  open.value = true
  document.addEventListener('mousedown', onOutside)
  document.addEventListener('keydown', onKeydown)
  // Scrolling the list would strand the menu, so dismiss instead of tracking.
  window.addEventListener('scroll', close, true)
  window.addEventListener('resize', close)
}

function pick(item: RowAction) {
  close()
  emit('select', item.key)
}

onBeforeUnmount(close)
</script>

<template>
  <button
    ref="button"
    type="button"
    :disabled="disabled"
    aria-label="Actions"
    :aria-expanded="open"
    @click.stop="toggle"
    :class="[
      'flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:cursor-pointer hover:bg-primary/10 hover:text-primary disabled:opacity-50',
      open ? ' text-primary' : '',
    ]"
  >
    <svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="5" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="12" cy="19" r="1.8" />
    </svg>
  </button>

  <Teleport to="body">
    <div
      v-if="open"
      data-row-actions-menu
      :style="{ top: `${pos.top}px`, right: `${pos.right}px` }"
      class="fixed z-100 w-max min-w-32 overflow-hidden rounded-xl border border-gray-100 bg-white py-1 shadow-lg"
      @click.stop
    >
      <button
        v-for="item in items"
        :key="item.key"
        type="button"
        @click="pick(item)"
        :class="[
          'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm font-medium transition-colors hover:cursor-pointer',
          item.tone === 'success'
            ? 'text-primary hover:bg-primary/10'
            : item.tone === 'danger'
              ? 'text-red-600 hover:bg-red-50'
              : 'text-gray-700 hover:bg-gray-50',
        ]"
      >
        <svg
          v-if="SOLID_ICONS[item.key]"
          class="h-4 w-4 shrink-0"
          fill="currentColor"
          viewBox="0 0 640 640"
          aria-hidden="true"
        >
          <path :d="SOLID_ICONS[item.key]" />
        </svg>
        <svg
          v-else-if="ICONS[item.key]"
          class="h-4 w-4 shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="1.8"
          aria-hidden="true"
        >
          <path stroke-linecap="round" stroke-linejoin="round" :d="ICONS[item.key]" />
        </svg>
        <!-- Keeps labels aligned if a menu ever passes a key with no icon. -->
        <span v-else class="h-4 w-4 shrink-0" aria-hidden="true" />
        {{ item.label }}
      </button>
    </div>
  </Teleport>
</template>
