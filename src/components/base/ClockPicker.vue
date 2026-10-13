<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

/**
 * An hour/minute picker, drawn by us — the clock half of CalendarPicker.
 *
 * Replaces the browser's time picker for the same reasons the calendar
 * replaced its date one: three browsers draw three different panels, none can
 * be styled, and Safari has no picker to open at all. A field that looked like
 * the rest of the form opened something that did not.
 *
 * Two columns rather than a clock face: every minute has to be reachable
 * because the default expiry is 23:59, and a face that offers five-minute
 * steps cannot express it. Both columns scroll the selection into view on
 * open, so the current value is what you see first.
 *
 * v-model is 24-hour 'HH:mm'.
 */
const props = defineProps<{
  modelValue: string // 'HH:mm'
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void
  (e: 'close'): void
}>()

const { t } = useI18n({ useScope: 'global' })

const pad = (n: number) => String(n).padStart(2, '0')

const hours = Array.from({ length: 24 }, (_, i) => i)
const minutes = Array.from({ length: 60 }, (_, i) => i)

/** The current value, split. Anything unparseable reads as 00:00. */
const parts = computed(() => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(props.modelValue || '')
  const h = match ? Number(match[1]) : 0
  const m = match ? Number(match[2]) : 0
  return {
    hour: h >= 0 && h <= 23 ? h : 0,
    minute: m >= 0 && m <= 59 ? m : 0,
  }
})

/**
 * Emitting both halves on every click keeps this a controlled component: the
 * parent owns the value and there is no local copy to drift from it.
 */
function setHour(h: number) {
  emit('update:modelValue', `${pad(h)}:${pad(parts.value.minute)}`)
}

function setMinute(m: number) {
  emit('update:modelValue', `${pad(parts.value.hour)}:${pad(m)}`)
}

function setNow() {
  const now = new Date()
  emit('update:modelValue', `${pad(now.getHours())}:${pad(now.getMinutes())}`)
}

const hourList = ref<HTMLElement | null>(null)
const minuteList = ref<HTMLElement | null>(null)

/**
 * Put the selected row in the middle of its column.
 *
 * scrollIntoView() would scroll the whole modal to reach the panel, so the
 * offset is set on the column itself. Centring rather than aligning to the top
 * shows what is on either side, which is what makes a long list feel scrollable
 * rather than clipped.
 */
function revealSelection() {
  for (const [list, index] of [
    [hourList.value, parts.value.hour],
    [minuteList.value, parts.value.minute],
  ] as const) {
    if (!list) continue
    const row = list.children[index] as HTMLElement | undefined
    if (!row) continue
    list.scrollTop = row.offsetTop - list.clientHeight / 2 + row.clientHeight / 2
  }
}

onMounted(() => void nextTick(revealSelection))

// Reopening with a different value should land on that value, not wherever the
// column was left. Only follows the hour/minute, not every keystroke mid-typing.
watch(
  () => [parts.value.hour, parts.value.minute],
  () => void nextTick(revealSelection),
)

const rowClass = (active: boolean) =>
  [
    'w-full rounded-lg py-1.5 text-center text-sm transition hover:cursor-pointer',
    active ? 'bg-primary font-semibold text-white' : 'text-gray-700 hover:bg-gray-100',
  ].join(' ')
</script>

<template>
  <div
    class="w-44 rounded-xl border border-gray-200 bg-white p-2 shadow-lg"
    @click.stop
    @keydown.esc="emit('close')"
  >
    <div class="mb-1 grid grid-cols-2 gap-1 text-center text-[11px] font-medium text-gray-400">
      <span>{{ t('common.timeField.hour') }}</span>
      <span>{{ t('common.timeField.minute') }}</span>
    </div>

    <div class="grid grid-cols-2 gap-1">
      <!-- scrollbar-hide keeps the two columns the same width whether or not
           the platform draws a scrollbar. -->
      <div ref="hourList" class="scrollbar-hide h-44 overflow-y-auto overscroll-contain">
        <button
          v-for="h in hours"
          :key="h"
          type="button"
          :class="rowClass(h === parts.hour)"
          @click="setHour(h)"
        >
          {{ pad(h) }}
        </button>
      </div>

      <div ref="minuteList" class="scrollbar-hide h-44 overflow-y-auto overscroll-contain">
        <button
          v-for="m in minutes"
          :key="m"
          type="button"
          :class="rowClass(m === parts.minute)"
          @click="setMinute(m)"
        >
          {{ pad(m) }}
        </button>
      </div>
    </div>

    <div class="mt-2 flex items-center justify-between border-t border-gray-100 pt-2">
      <button
        type="button"
        class="rounded-lg px-2 py-1 text-xs font-medium text-primary transition hover:cursor-pointer hover:bg-primary/10"
        @click="setNow"
      >
        {{ t('common.timeField.now') }}
      </button>
      <button
        type="button"
        class="rounded-lg px-2 py-1 text-xs font-medium text-gray-500 transition hover:cursor-pointer hover:bg-gray-100 hover:text-gray-700"
        @click="emit('close')"
      >
        {{ t('common.dateField.close') }}
      </button>
    </div>
  </div>
</template>
