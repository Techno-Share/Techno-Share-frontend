<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

/**
 * A month calendar, drawn by us.
 *
 * Replaces the browser's own date picker, which DateField used to reach through
 * a hidden `<input type="date">` and `showPicker()`. That had three problems:
 * every browser draws a different thing, Safari and Firefox disagree about
 * whether `showPicker()` exists at all, and none of them can be styled — so the
 * one control in the form that opens a panel looked nothing like the form.
 *
 * Month and weekday names come from Intl in the app's current locale rather
 * than a translation table: nineteen more keys to maintain in two languages,
 * when the platform already knows the answer for every locale.
 *
 * v-model is an ISO 'YYYY-MM-DD' string, the same contract DateField speaks.
 */
const props = defineProps<{
  modelValue: string // 'YYYY-MM-DD' | ''
  min?: string // 'YYYY-MM-DD' — earlier days are shown but not selectable
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void
  (e: 'close'): void
}>()

const { locale, t } = useI18n({ useScope: 'global' })

const pad = (n: number) => String(n).padStart(2, '0')
const toIso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`

function parse(iso: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '')
  if (!match) return null
  return { y: Number(match[1]), m: Number(match[2]) - 1, d: Number(match[3]) }
}

const today = new Date()
const todayIso = toIso(today.getFullYear(), today.getMonth(), today.getDate())

/** The month on screen — follows the selection, or opens on today. */
const selected = computed(() => parse(props.modelValue))
const viewYear = ref(selected.value?.y ?? today.getFullYear())
const viewMonth = ref(selected.value?.m ?? today.getMonth())

// Reopening with a different value should land on that value's month, not
// wherever the panel was left last time.
watch(
  () => props.modelValue,
  (v) => {
    const parsed = parse(v)
    if (!parsed) return
    viewYear.value = parsed.y
    viewMonth.value = parsed.m
  },
)

/** 'days' is the calendar; the other two are the shortcuts out of it. */
const view = ref<'days' | 'months' | 'years'>('days')

const monthNames = computed(() => {
  const fmt = new Intl.DateTimeFormat(locale.value, { month: 'long' })
  return Array.from({ length: 12 }, (_, m) => fmt.format(new Date(2000, m, 1)))
})

const monthNamesShort = computed(() => {
  const fmt = new Intl.DateTimeFormat(locale.value, { month: 'short' })
  return Array.from({ length: 12 }, (_, m) => fmt.format(new Date(2000, m, 1)))
})

/**
 * Weekday initials, Monday first.
 *
 * 2024-01-01 was a Monday, so counting from it gives the week in order without
 * caring what the locale thinks the first day is — ITC reads Monday-first.
 */
const weekdayNames = computed(() => {
  const fmt = new Intl.DateTimeFormat(locale.value, { weekday: 'short' })
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2024, 0, 1 + i)))
})

/**
 * Six weeks of cells, always — a grid that changes height as you page through
 * the months makes the panel jump under the cursor.
 *
 * Days from the neighbouring months are rendered greyed rather than blank, so
 * the first and last rows read as a calendar instead of a ragged edge.
 */
const cells = computed(() => {
  const first = new Date(viewYear.value, viewMonth.value, 1)
  // getDay() is Sunday-based; shift so Monday is 0.
  const lead = (first.getDay() + 6) % 7
  const start = new Date(viewYear.value, viewMonth.value, 1 - lead)

  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    const iso = toIso(d.getFullYear(), d.getMonth(), d.getDate())
    return {
      iso,
      day: d.getDate(),
      outside: d.getMonth() !== viewMonth.value,
      isToday: iso === todayIso,
      isSelected: iso === props.modelValue,
      disabled: !!props.min && iso < props.min,
    }
  })
})

/** A dozen years around the one in view, so a year out is two clicks. */
const yearRange = computed(() => {
  const start = viewYear.value - 6
  return Array.from({ length: 12 }, (_, i) => start + i)
})

/** A whole month is unreachable when even its last day is before `min`. */
function monthDisabled(m: number): boolean {
  if (!props.min) return false
  const last = new Date(viewYear.value, m + 1, 0)
  return toIso(last.getFullYear(), last.getMonth(), last.getDate()) < props.min
}

function yearDisabled(y: number): boolean {
  return !!props.min && `${y}-12-31` < props.min
}

function shiftMonth(by: number) {
  const d = new Date(viewYear.value, viewMonth.value + by, 1)
  viewYear.value = d.getFullYear()
  viewMonth.value = d.getMonth()
}

function pick(iso: string, disabled: boolean) {
  if (disabled) return
  emit('update:modelValue', iso)
  emit('close')
}

function pickToday() {
  if (props.min && todayIso < props.min) return
  pick(todayIso, false)
}

const todayDisabled = computed(() => !!props.min && todayIso < props.min)
</script>

<template>
  <div
    class="w-[17.5rem] rounded-xl border border-gray-200 bg-white p-3 shadow-lg"
    @click.stop
    @keydown.esc="emit('close')"
  >
    <!-- Header: step a month at a time, or jump out to months / years -->
    <div class="mb-2 flex items-center justify-between gap-1">
      <button
        type="button"
        class="flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 transition hover:cursor-pointer hover:bg-gray-100 hover:text-gray-700"
        :aria-label="t('common.dateField.prevMonth')"
        @click="
          view === 'years' ? (viewYear -= 12) : view === 'months' ? viewYear-- : shiftMonth(-1)
        "
      >
        <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      <button
        type="button"
        class="flex-1 rounded-lg px-2 py-1 text-sm font-semibold text-gray-800 transition hover:cursor-pointer hover:bg-gray-100"
        @click="view = view === 'days' ? 'months' : view === 'months' ? 'years' : 'days'"
      >
        <template v-if="view === 'days'">{{ monthNames[viewMonth] }} {{ viewYear }}</template>
        <template v-else-if="view === 'months'">{{ viewYear }}</template>
        <template v-else>{{ yearRange[0] }} – {{ yearRange[yearRange.length - 1] }}</template>
      </button>

      <button
        type="button"
        class="flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 transition hover:cursor-pointer hover:bg-gray-100 hover:text-gray-700"
        :aria-label="t('common.dateField.nextMonth')"
        @click="
          view === 'years' ? (viewYear += 12) : view === 'months' ? viewYear++ : shiftMonth(1)
        "
      >
        <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>

    <!-- Days -->
    <template v-if="view === 'days'">
      <div class="mb-1 grid grid-cols-7 gap-0.5">
        <span
          v-for="(name, i) in weekdayNames"
          :key="i"
          class="py-1 text-center text-[11px] font-medium text-gray-400"
          >{{ name }}</span
        >
      </div>

      <div class="grid grid-cols-7 gap-0.5">
        <button
          v-for="cell in cells"
          :key="cell.iso"
          type="button"
          :disabled="cell.disabled"
          class="relative flex h-8 items-center justify-center rounded-lg text-sm transition"
          :class="[
            cell.disabled
              ? 'cursor-not-allowed text-gray-300'
              : 'hover:cursor-pointer hover:bg-gray-100',
            cell.isSelected
              ? 'bg-primary font-semibold text-white hover:bg-primary'
              : cell.outside
                ? 'text-gray-300'
                : 'text-gray-700',
            cell.isToday && !cell.isSelected ? 'font-semibold text-primary' : '',
          ]"
          @click="pick(cell.iso, cell.disabled)"
        >
          {{ cell.day }}
          <!-- Today keeps a marker even when it is the selection, so the
               calendar never loses its one fixed point of reference. -->
          <span
            v-if="cell.isToday"
            class="absolute bottom-1 h-1 w-1 rounded-full"
            :class="cell.isSelected ? 'bg-white' : 'bg-primary'"
          />
        </button>
      </div>
    </template>

    <!-- Months -->
    <div v-else-if="view === 'months'" class="grid grid-cols-3 gap-1">
      <button
        v-for="(name, m) in monthNamesShort"
        :key="name"
        type="button"
        :disabled="monthDisabled(m)"
        class="rounded-lg py-2 text-sm transition"
        :class="[
          monthDisabled(m)
            ? 'cursor-not-allowed text-gray-300'
            : 'hover:cursor-pointer hover:bg-gray-100',
          m === viewMonth && !monthDisabled(m)
            ? 'bg-primary/10 font-semibold text-primary'
            : 'text-gray-700',
        ]"
        @click="!monthDisabled(m) && ((viewMonth = m), (view = 'days'))"
      >
        {{ name }}
      </button>
    </div>

    <!-- Years -->
    <div v-else class="grid grid-cols-3 gap-1">
      <button
        v-for="y in yearRange"
        :key="y"
        type="button"
        :disabled="yearDisabled(y)"
        class="rounded-lg py-2 text-sm transition"
        :class="[
          yearDisabled(y)
            ? 'cursor-not-allowed text-gray-300'
            : 'hover:cursor-pointer hover:bg-gray-100',
          y === viewYear && !yearDisabled(y)
            ? 'bg-primary/10 font-semibold text-primary'
            : 'text-gray-700',
        ]"
        @click="!yearDisabled(y) && ((viewYear = y), (view = 'months'))"
      >
        {{ y }}
      </button>
    </div>

    <div class="mt-2 flex items-center justify-between border-t border-gray-100 pt-2">
      <button
        type="button"
        :disabled="todayDisabled"
        class="rounded-lg px-2 py-1 text-xs font-medium transition"
        :class="
          todayDisabled
            ? 'cursor-not-allowed text-gray-300'
            : 'text-primary hover:cursor-pointer hover:bg-primary/10'
        "
        @click="pickToday"
      >
        {{ t('common.dateField.today') }}
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
