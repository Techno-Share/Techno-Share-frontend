import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth.store'

/**
 * Whether this account still owes us a department and year.
 *
 * Was also the open/dismiss state for a modal. That modal is gone: the prompt
 * is the `/welcome` route now, and the navigation guard enforces it, so there
 * is no dialog to open and nothing to dismiss. What remains is the question
 * itself, which both the guard and the page need to answer.
 */
export function useCompleteProfile() {
  const auth = useAuthStore()

  /**
   * Finished Foundation and due a rollover, so the department they moved into
   * is still unknown. The server decides this — the date rule lives there.
   */
  const needsPromotion = computed(() => !!auth.user?.needs_department_choice)

  /**
   * Signed in, but missing the pair the audience rule filters on — either
   * never set, or gone stale because Foundation ended.
   */
  const needsProfile = computed(
    () => !!auth.user && (!auth.user.major_id || !auth.user.year_level || needsPromotion.value),
  )

  return { needsProfile, needsPromotion }
}
