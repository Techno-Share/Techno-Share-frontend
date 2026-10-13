<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

/**
 * A password box with a show/hide eye.
 *
 * Shared rather than repeated: there are seven password inputs across sign-in,
 * registration and the two reset screens, and a toggle that exists on some of
 * them is worse than none — the reader learns it is there and then finds it
 * missing on the screen where they mistyped.
 *
 * Starts hidden, always. Revealing is a deliberate act by the person at the
 * keyboard; a field that remembered "shown" would eventually display someone's
 * password to whoever is standing behind them.
 *
 * `class` lands on the INPUT (so each screen keeps its own field styling) while
 * `wrapperClass` positions the box — they cannot share one attribute, because
 * the eye is positioned against the input and a margin on the wrapper would
 * push it off centre.
 */
defineOptions({ inheritAttrs: false })

defineProps<{
  modelValue: string
  /** Layout classes for the wrapper, e.g. spacing above the field. */
  wrapperClass?: string
}>()

const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>()

const { t } = useI18n({ useScope: 'global' })
const visible = ref(false)
</script>

<template>
  <div :class="['relative', wrapperClass]">
    <!-- pr-12 reserves the eye's column so a long password never runs under it. -->
    <input
      v-bind="$attrs"
      :type="visible ? 'text' : 'password'"
      :value="modelValue"
      class="pr-12"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />

    <button
      type="button"
      tabindex="-1"
      :aria-pressed="visible"
      :aria-label="t(visible ? 'common.password.hide' : 'common.password.show')"
      :title="t(visible ? 'common.password.hide' : 'common.password.show')"
      class="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-gray-400 transition hover:cursor-pointer hover:text-primary"
      @click="visible = !visible"
    >
      <!-- Open eye while hidden: the icon shows what the click will DO, which
           is the reading people check against. -->
      <svg
        v-if="!visible"
        class="h-5 w-5"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M2.036 12.322a1 1 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178a1 1 0 010 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
        />
        <circle cx="12" cy="12" r="3" />
      </svg>
      <svg
        v-else
        class="h-5 w-5"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243"
        />
      </svg>
    </button>
  </div>
</template>
