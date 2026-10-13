<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import RingSpinner from '@/components/base/RingSpinner.vue'
import DateField from '@/components/base/DateField.vue'
import TimeField from '@/components/base/TimeField.vue'
import { dateAndTimeToIso, formatExpiry, isoToDateAndTime } from '@/utils/format'

/**
 * Picks the date the whole institute moves up a year.
 *
 * A dialog rather than a field on the dashboard: this changes every student's
 * year level at once, and a control that sits inline among read-only statistics
 * invites a stray click. Opening something deliberately, and confirming inside
 * it, matches the weight of what it does.
 */
const props = defineProps<{
  /** The instant currently scheduled, ISO, or null when there is none. */
  currentAt: string | null
  saving?: boolean
}>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'save', isoOrNull: string | null): void
}>()

/**
 * The same DateField + TimeField the upload form uses, rather than a native
 * `datetime-local`.
 *
 * This was the last browser-drawn picker in the app: it looked nothing like the
 * rest of the forms, rendered differently in every browser, and Safari gave no
 * picker at all. Splitting the instant into the two fields is the whole cost.
 *
 * Both halves are local wall-clock; dateAndTimeToIso puts the zone back on.
 */
const initial = isoToDateAndTime(props.currentAt)
const date = ref(initial.date)
const time = ref(initial.time || '00:00')

/** The chosen instant, or null while the date is still blank. */
const chosenIso = computed(() => dateAndTimeToIso(date.value, time.value))

/** Spelled out under the fields, so the choice is legible before committing. */
const summary = computed(() => formatExpiry(chosenIso.value))

/** A time already gone is valid — it simply takes effect at once. Say so. */
const isPast = computed(
  () => !!chosenIso.value && new Date(chosenIso.value).getTime() <= Date.now(),
)

function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape' && !props.saving) emit('close')
}

onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 px-4 py-6"
      @click.self="!props.saving && emit('close')"
    >
      <div class="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-black/10">
        <h2 class="text-lg font-bold text-gray-900">Schedule student promotion</h2>
        <p class="mt-1 text-sm leading-relaxed text-gray-500">
          Every student moves up one year. This is the only thing that promotes them — there is no
          automatic yearly rollover. It is not applied all at once: each student advances on their
          next visit after this moment passes.
        </p>

        <label class="mt-5 block text-sm font-semibold text-gray-600">Date and time</label>
        <div class="mt-1.5 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-start">
          <DateField v-model="date" />
          <div class="sm:w-40"><TimeField v-model="time" /></div>
        </div>

        <p v-if="summary" class="mt-2 flex items-center gap-1.5 text-xs text-primary">
          <svg
            class="h-3.5 w-3.5 shrink-0"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            viewBox="0 0 24 24"
          >
            <circle cx="12" cy="12" r="9" />
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 7v5l3 2" />
          </svg>
          <span>Promotes on {{ summary }}</span>
        </p>

        <p v-if="isPast" class="mt-2 text-xs text-amber-600">
          That time has already passed — it will take effect immediately.
        </p>

        <div class="mt-6 flex flex-col gap-2">
          <button
            type="button"
            :disabled="props.saving || !chosenIso"
            class="flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:cursor-pointer hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
            @click="emit('save', chosenIso)"
          >
            <RingSpinner v-if="props.saving" :size="16" :stroke="3" />
            Schedule
          </button>
          <!-- Clearing lives here too: it is the other half of the same
               decision, and putting it on the card would mean one click could
               undo a promotion nobody meant to touch. -->
          <button
            v-if="props.currentAt"
            type="button"
            :disabled="props.saving"
            class="rounded-xl px-5 py-2.5 text-sm font-semibold text-red-500 transition hover:cursor-pointer hover:bg-red-50 disabled:opacity-50"
            @click="emit('save', null)"
          >
            Remove the schedule
          </button>
          <button
            type="button"
            :disabled="props.saving"
            class="rounded-xl px-5 py-2.5 text-sm font-semibold text-gray-500 transition hover:cursor-pointer hover:bg-gray-100 disabled:opacity-50"
            @click="emit('close')"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
