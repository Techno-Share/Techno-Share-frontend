<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

type SelectOption = {
  label: string
  value: string
}

const props = defineProps({
  modelValue: {
    type: String,
    default: '',
  },
  placeholder: {
    type: String,
    default: '',
  },
  options: {
    type: Array as () => SelectOption[],
    default: () => [],
  },
  disabled: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
  (event: 'change', value: string): void
}>()

const isOpen = ref(false)
const rootRef = ref<HTMLElement | null>(null)
const menuRef = ref<HTMLElement | null>(null)

const selectedLabel = computed(
  () => props.options.find((option) => option.value === props.modelValue)?.label,
)

/**
 * The menu is teleported to <body> and positioned here.
 *
 * As an absolutely-positioned child it was clipped by any ancestor that scrolls
 * or hides overflow — which is every modal in the app, since they cap their
 * height and scroll the body. In the Give a Book dialog that cut the department
 * list off mid-option with no way to reach the rest.
 *
 * Teleporting escapes the clip, but a teleported element no longer moves with
 * its trigger, so the position is measured from the button and refreshed
 * whenever anything could have moved it.
 */
const menuStyle = ref<Record<string, string>>({})

/** Leaves room for the viewport edge so the menu never sits flush against it. */
const VIEWPORT_MARGIN = 8
const MENU_MAX_HEIGHT = 240 // matches max-h-60

function position() {
  const trigger = rootRef.value
  if (!trigger) return
  const rect = trigger.getBoundingClientRect()
  const below = window.innerHeight - rect.bottom - VIEWPORT_MARGIN
  const above = rect.top - VIEWPORT_MARGIN

  // Open upward only when below genuinely cannot hold the menu and above is
  // roomier — otherwise a list near the bottom would flip on every open.
  const flipUp = below < Math.min(MENU_MAX_HEIGHT, above) && above > below

  menuStyle.value = {
    left: `${rect.left}px`,
    minWidth: `${rect.width}px`,
    maxHeight: `${Math.max(120, Math.min(MENU_MAX_HEIGHT, flipUp ? above : below))}px`,
    ...(flipUp
      ? { bottom: `${window.innerHeight - rect.top + 8}px` }
      : { top: `${rect.bottom + 8}px` }),
  }
}

function toggleMenu() {
  if (props.disabled || props.options.length === 0) return
  isOpen.value = !isOpen.value
}

function handleSelect(value: string) {
  emit('update:modelValue', value)
  emit('change', value)
  isOpen.value = false
}

/**
 * The menu now lives outside `rootRef`, so a click on an option is "outside"
 * the trigger. Both elements have to be checked or the menu would close before
 * the option's own handler ran.
 */
function handleClickOutside(event: MouseEvent) {
  const target = event.target as Node
  if (rootRef.value?.contains(target)) return
  if (menuRef.value?.contains(target)) return
  isOpen.value = false
}

/**
 * Capture phase, so scrolling inside a modal body — which does not bubble to
 * window — still moves the menu with its trigger instead of leaving it behind.
 */
function reposition() {
  if (isOpen.value) position()
}

watch(isOpen, (open) => {
  if (open) position()
})

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  window.addEventListener('scroll', reposition, true)
  window.addEventListener('resize', reposition)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside)
  window.removeEventListener('scroll', reposition, true)
  window.removeEventListener('resize', reposition)
})
</script>

<template>
  <div ref="rootRef" class="relative w-full">
    <button
      type="button"
      :disabled="disabled"
      class="flex w-full items-center justify-between rounded-xl border border-[#D9D9D9] bg-white px-4 py-2.5 text-left text-sm outline-none transition focus:border-primary disabled:cursor-not-allowed disabled:bg-[#F5F5F5] disabled:opacity-70 *:hover:cursor-pointer"
      :class="isOpen ? 'border-primary' : ''"
      @click="toggleMenu"
    >
      <span class="truncate" :class="selectedLabel ? 'text-black' : 'text-gray-400'">
        {{ selectedLabel || placeholder }}
      </span>

      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        class="ml-3 h-4 w-4 shrink-0 text-gray-500 transition-transform duration-200"
        :class="isOpen ? 'rotate-180' : ''"
      >
        <path stroke-linecap="round" stroke-linejoin="round" d="m6 9 6 6 6-6" />
      </svg>
    </button>

    <!-- Teleported and fixed, so no scrolling ancestor can clip it. z-[110]
         matches DateField and TimeField, which solve the same problem for the
         same reason — the modals top out at z-[100]. -->
    <Teleport to="body">
      <div
        v-if="isOpen && options.length > 0"
        ref="menuRef"
        :style="menuStyle"
        class="fixed z-[110] w-max max-w-[90vw] overflow-y-auto overscroll-contain rounded-2xl border border-gray-200 bg-white shadow-lg"
      >
        <button
          v-for="option in options"
          :key="option.value"
          type="button"
          class="block w-full px-4 py-2.5 text-left text-sm transition hover:cursor-pointer hover:bg-[#EAF6FB] hover:text-primary"
          :class="option.value === modelValue ? 'bg-[#EAF6FB] text-primary' : 'text-gray-700'"
          @click="handleSelect(option.value)"
        >
          {{ option.label }}
        </button>
      </div>
    </Teleport>
  </div>
</template>
