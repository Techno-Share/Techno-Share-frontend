<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth.store'
import { useMajorsStore } from '@/stores/majors.store'
import { useCompleteProfile } from '@/composables/useCompleteProfile'
import { isFoundationMajor, yearLevelsForMajor } from '@/utils/format'
import RingSpinner from '@/components/base/RingSpinner.vue'
import SelectDropdown from '@/components/base/SelectDropdown.vue'

/**
 * The department-and-year gate every account passes through once.
 *
 * These two fields are what `canView` matches an upload's audience against, so
 * until they are set a student sees only unrestricted documents — a feed that
 * looks broken rather than empty. This used to be a dismissible modal, which
 * meant a student could decline it and then spend the session wondering where
 * everything was.
 *
 * It is a route rather than a blocking modal because the router guard can then
 * do the enforcing: anyone signed in without these fields is redirected here
 * from anywhere, including on a later visit, and there is no dialog to escape.
 */
const { t } = useI18n({ useScope: 'global' })
const router = useRouter()
const auth = useAuthStore()
const majorsStore = useMajorsStore()
const { needsPromotion } = useCompleteProfile()

const form = reactive({ major_id: '', year_level: '' })
const errors = reactive({ major_id: '', year_level: '' })
const saving = ref(false)

/**
 * Departments a student can actually be in.
 *
 * Both the dropdown and the rotating badge read from this one list. They used
 * to filter separately, and the badge advertised DFL — a department the
 * dropdown does not offer, so it cycled past and could not be chosen.
 */
const selectableMajors = computed(() =>
  majorsStore.majors.filter((m) => {
    const acronym = String(m.acronym ?? '').toLowerCase()
    // DFL is a service department nobody registers into — every student takes
    // its courses alongside their own major.
    if (acronym === 'dfl') return false
    // Promotion means leaving Foundation, so offering it back is a dead end.
    if (needsPromotion.value && isFoundationMajor(acronym)) return false
    return true
  }),
)

const majorOptions = computed(() =>
  selectableMajors.value.map((m) => ({ value: m.id, label: m.acronym })),
)

const selectedAcronym = computed(
  () => majorsStore.majors.find((m) => m.id === form.major_id)?.acronym,
)

const yearOptions = computed(() =>
  yearLevelsForMajor(selectedAcronym.value).map((y) => ({
    value: String(y),
    label: t('auth.register.yearN', { year: y }),
  })),
)

/**
 * Leaving Foundation puts you in the first year of your new department, so
 * there is nothing to ask and the field is hidden. Read from the rule rather
 * than hardcoded, so it stays right if a department ever starts elsewhere.
 */
const promotedYear = computed(() => yearLevelsForMajor(selectedAcronym.value)[0])

watch(
  () => form.major_id,
  () => {
    form.year_level = ''
  },
)

// ── The rotating department badge ──────────────────────────────────────────
//
// Every major carries a logo (`image_url`), so the panel shows the institute
// rather than a generic graduation cap. It rotates to make the point that the
// choice below is about one of these — and it stops the moment the student
// picks, because an animation competing with the field they are filling in is
// just noise.

const ROTATE_MS = 2600
const slide = ref(0)
let timer: ReturnType<typeof setInterval> | undefined

/**
 * What the badge rotates through: the selectable departments that have a logo.
 * A department with no image would rotate to an empty frame.
 */
const showcase = computed(() => selectableMajors.value.filter((m) => m.image_url))

const current = computed(() => showcase.value[slide.value % (showcase.value.length || 1)])

/** The chosen department, once there is one — otherwise whatever is rotating. */
const featured = computed(
  () => selectableMajors.value.find((m) => m.id === form.major_id) ?? current.value,
)

function startRotating() {
  stopRotating()
  // Respect a reader who has asked for less motion: they still get the logos,
  // just not the carousel.
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  timer = setInterval(() => {
    slide.value = (slide.value + 1) % Math.max(showcase.value.length, 1)
  }, ROTATE_MS)
}

function stopRotating() {
  if (timer) clearInterval(timer)
  timer = undefined
}

// Once a department is chosen the panel shows it and holds still.
watch(
  () => form.major_id,
  (id) => (id ? stopRotating() : startRotating()),
)

onMounted(async () => {
  await majorsStore.fetchMajors()
  startRotating()
})

onBeforeUnmount(stopRotating)

async function submit() {
  errors.major_id = form.major_id ? '' : 'auth.register.enterDepartment'
  errors.year_level = needsPromotion.value || form.year_level ? '' : 'auth.register.enterYear'
  if (errors.major_id || errors.year_level) return

  saving.value = true
  try {
    await auth.updateMe({
      major_id: form.major_id,
      year_level: needsPromotion.value ? promotedYear.value : Number(form.year_level),
    })
    // The guard that sent us here now lets everything through.
    await router.replace({ name: 'home' })
  } catch {
    // auth.error renders in the banner below.
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="flex min-h-screen flex-col bg-white lg:flex-row">
    <!-- ── Showcase panel ──────────────────────────────────────────────── -->
    <section
      class="relative flex items-center justify-center overflow-hidden bg-primary px-6 py-10 lg:w-1/2 lg:py-0"
    >
      <!-- The soft shape behind the badge, echoing the department cards. -->
      <div
        class="absolute h-[clamp(240px,34vw,460px)] w-[clamp(240px,34vw,460px)] rounded-[28%_28%_28%_60%] bg-white/10"
        aria-hidden="true"
      />

      <div class="relative flex flex-col items-center gap-6 text-center">
        <!-- aria-live so a screen reader is told what is on screen, but
             'polite' so the rotation never interrupts the form. -->
        <div
          class="flex h-44 w-44 items-center justify-center rounded-3xl bg-white p-6 shadow-xl sm:h-52 sm:w-52"
          aria-live="polite"
        >
          <Transition name="badge" mode="out-in">
            <img
              v-if="featured?.image_url"
              :key="featured.id"
              :src="featured.image_url"
              :alt="featured.name"
              class="max-h-full max-w-full object-contain"
            />
            <RingSpinner v-else key="loading" />
          </Transition>
        </div>

        <Transition name="badge" mode="out-in">
          <div :key="featured?.id ?? 'none'" class="flex flex-col gap-1">
            <p class="text-3xl font-extrabold tracking-wide text-white sm:text-4xl">
              {{ featured?.acronym ?? '' }}
            </p>
            <p class="max-w-xs text-sm leading-relaxed text-white/80">
              {{ featured?.name ?? '' }}
            </p>
          </div>
        </Transition>

        <!-- Position dots: a quiet cue that this is a set, not a glitch. -->
        <div v-if="!form.major_id && showcase.length > 1" class="flex gap-1.5">
          <span
            v-for="(m, i) in showcase"
            :key="m.id"
            class="h-1.5 rounded-full transition-all duration-300"
            :class="i === slide % showcase.length ? 'w-5 bg-white' : 'w-1.5 bg-white/40'"
          />
        </div>
      </div>
    </section>

    <!-- ── Form ────────────────────────────────────────────────────────── -->
    <section class="flex flex-1 items-center justify-center px-6 py-10 sm:px-10">
      <form class="w-full max-w-sm" novalidate @submit.prevent="submit">
        <h1 class="text-3xl font-extrabold text-gray-900">
          {{ needsPromotion ? t('auth.welcome.titlePromoted') : t('auth.welcome.title') }}
        </h1>
        <p class="mt-2 text-sm leading-relaxed text-gray-500">
          {{ t('auth.welcome.subtitle') }}
        </p>

        <div class="mt-8 flex flex-col gap-5">
          <div>
            <label class="mb-1.5 block text-sm font-semibold text-gray-800">
              {{ t('auth.register.department') }}
            </label>
            <SelectDropdown
              v-model="form.major_id"
              :options="majorOptions"
              :placeholder="t('auth.register.chooseDepartment')"
            />
            <p v-if="errors.major_id" class="mt-1.5 text-xs text-red-600">
              {{ t(errors.major_id) }}
            </p>
          </div>

          <!-- Hidden when leaving Foundation: the year follows from the
               department, so asking would invite a wrong answer. -->
          <div v-if="!needsPromotion">
            <label class="mb-1.5 block text-sm font-semibold text-gray-800">
              {{ t('auth.register.year') }}
            </label>
            <SelectDropdown
              v-model="form.year_level"
              :options="yearOptions"
              :disabled="!form.major_id"
              :placeholder="t('auth.register.chooseYear')"
            />
            <p v-if="errors.year_level" class="mt-1.5 text-xs text-red-600">
              {{ t(errors.year_level) }}
            </p>
          </div>

          <p class="flex items-start gap-2 text-xs leading-relaxed text-amber-700">
            <span aria-hidden="true">⚠</span>
            <span>{{ t('auth.welcome.permanent') }}</span>
          </p>

          <p v-if="auth.error" class="text-sm text-red-600">{{ auth.error }}</p>

          <button
            type="submit"
            :disabled="saving"
            class="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-bold text-white transition-colors hover:cursor-pointer hover:bg-primary-hover disabled:opacity-60"
          >
            <RingSpinner v-if="saving" class="h-4 w-4" />
            {{ t('auth.welcome.continue') }}
          </button>

          <!-- Deliberately no "Not now". The feed is filtered by these two
               fields, so skipping them is choosing a broken app. -->
        </div>
      </form>
    </section>
  </div>
</template>

<style scoped>
.badge-enter-active,
.badge-leave-active {
  transition:
    opacity 0.4s ease,
    transform 0.4s ease;
}
.badge-enter-from {
  opacity: 0;
  transform: translateY(10px) scale(0.96);
}
.badge-leave-to {
  opacity: 0;
  transform: translateY(-10px) scale(0.96);
}

@media (prefers-reduced-motion: reduce) {
  .badge-enter-active,
  .badge-leave-active {
    transition: none;
  }
}
</style>
