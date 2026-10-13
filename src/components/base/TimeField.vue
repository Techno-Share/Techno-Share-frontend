<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAnchoredPanel } from '@/composables/useAnchoredPanel'
import ClockPicker from '@/components/base/ClockPicker.vue'

/**
 * The time half of an expiry, beside DateField — and built the same way: a box
 * you can TYPE into (hh:mm, auto-formatted) and a clock button that opens our
 * own panel. No `<input type="time">` anywhere, for the reasons in ClockPicker.
 *
 * The field shows 24-hour time because that is what it stores, and because a
 * box that reads "11:59 PM" cannot be typed into without deciding what to do
 * with a half-finished "11:5". The friendly rendering belongs on the summary
 * line, where formatExpiry puts it in the reader's own convention.
 *
 * v-model is 'HH:mm' ('' = empty).
 */
const props = defineProps<{
  modelValue: string // 'HH:mm' | ''
  placeholder?: string
}>()

const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>()

const { t } = useI18n({ useScope: 'global' })

const text = ref('') // what's shown/typed: 'hh:mm'
const error = ref('')

const pickerOpen = ref(false)
const root = ref<HTMLElement | null>(null)
const panel = ref<HTMLElement | null>(null)
/** The field itself — what the floating panel is positioned against. */
const anchor = ref<HTMLElement | null>(null)

const { style: panelStyle } = useAnchoredPanel(pickerOpen, anchor, panel)

/** 'HHmm' digits → 'HH:mm', or '' when they aren't a real time. */
function digitsToValue(digits: string): string {
  if (digits.length !== 4) return ''
  const h = Number(digits.slice(0, 2))
  const m = Number(digits.slice(2))
  if (h > 23 || m > 59) return ''
  return `${digits.slice(0, 2)}:${digits.slice(2)}`
}

// Sync in from the model only when it differs from what's typed, so the picker
// updates the box without clobbering a half-typed time.
watch(
  () => props.modelValue,
  (v) => {
    if (digitsToValue(text.value.replace(/\D/g, '')) !== v) text.value = v
  },
  { immediate: true },
)

/** Validate the digits so far; `final` (blur) also rejects an incomplete time. */
function validate(digits: string, final: boolean): string {
  if (digits.length >= 2 && Number(digits.slice(0, 2)) > 23)
    return t('common.timeField.invalidHour')
  if (digits.length === 4 && Number(digits.slice(2)) > 59)
    return t('common.timeField.invalidMinute')
  if (digits.length === 4) return ''
  return final && digits.length > 0 ? t('common.timeField.invalid') : ''
}

function onInput(e: Event) {
  const el = e.target as HTMLInputElement
  const digits = el.value.replace(/\D/g, '').slice(0, 4)
  const out = digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits
  text.value = out
  el.value = out

  error.value = validate(digits, false)
  const value = digitsToValue(digits)
  // Only a complete, valid time reaches the model; anything else leaves the
  // last good value alone rather than emitting nonsense on every keystroke.
  if (value) emit('update:modelValue', value)
}

function onBlur() {
  const digits = text.value.replace(/\D/g, '').slice(0, 4)
  error.value = validate(digits, true)
  if (!digits.length) emit('update:modelValue', '')
}

function togglePicker() {
  pickerOpen.value = !pickerOpen.value
}

function onPick(value: string) {
  error.value = ''
  emit('update:modelValue', value)
}

/** Close on a click anywhere else — see DateField for why it's mousedown. */
function onDocumentDown(e: MouseEvent) {
  const target = e.target as Node
  // The panel is teleported out of `root`, so it has to be asked separately —
  // without this, clicking a day would close the picker before it registered.
  if (root.value?.contains(target) || panel.value?.contains(target)) return
  pickerOpen.value = false
}

watch(pickerOpen, (open) => {
  if (open) document.addEventListener('mousedown', onDocumentDown)
  else document.removeEventListener('mousedown', onDocumentDown)
})

onBeforeUnmount(() => document.removeEventListener('mousedown', onDocumentDown))
</script>

<template>
  <div ref="root">
    <div ref="anchor" class="relative">
      <input
        :value="text"
        type="text"
        inputmode="numeric"
        :placeholder="placeholder ?? 'hh:mm'"
        class="w-full rounded-xl border bg-white py-2.5 pl-4 pr-10 text-sm outline-none transition"
        :class="
          error ? 'border-red-400 focus:border-red-500' : 'border-[#D9D9D9] focus:border-primary'
        "
        @input="onInput"
        @blur="onBlur"
      />

      <button
        type="button"
        class="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-gray-500 hover:text-primary hover:cursor-pointer"
        :aria-expanded="pickerOpen"
        aria-label="Open clock"
        @click="togglePicker"
      >
        <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" />
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 7v5l3 2" />
        </svg>
      </button>
    </div>

    <!-- Teleported to <body> and positioned fixed, so it paints in front of
         the dialog instead of being clipped by it. z above every overlay in
         the app (the modals top out at z-[100]). -->
    <Teleport to="body">
      <div v-if="pickerOpen" ref="panel" class="fixed z-[110]" :style="panelStyle">
        <ClockPicker
          :model-value="modelValue"
          @update:model-value="onPick"
          @close="pickerOpen = false"
        />
      </div>
    </Teleport>

    <p v-if="error" class="mt-1 text-xs text-red-600">{{ error }}</p>
  </div>
</template>
