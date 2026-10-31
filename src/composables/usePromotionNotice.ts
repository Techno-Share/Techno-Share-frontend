import { computed, ref } from 'vue'
import { useAuthStore } from '@/stores/auth.store'

/**
 * Whether to congratulate this student on moving up a year.
 *
 * The server decides, and says so once: `promoted_to_year` is non-null only on
 * the response that actually advanced them. That keeps the rule in one place
 * and makes the "show it once" behaviour fall out of the data rather than
 * needing a flag in storage.
 *
 * Module scope, like the layout it is mounted in: dismissing it on one page
 * must not bring it back on the next.
 */
const dismissed = ref(false)

export function usePromotionNotice() {
  const auth = useAuthStore()

  /** The year they just reached, or null if this visit promoted nobody. */
  const promotedToYear = computed(() => auth.user?.promoted_to_year ?? null)

  const showNotice = computed(() => !dismissed.value && promotedToYear.value !== null)

  function dismiss() {
    dismissed.value = true
  }

  return { promotedToYear, showNotice, dismiss }
}
