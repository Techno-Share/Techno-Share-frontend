import { nextTick, onBeforeUnmount, ref, watch, type Ref } from 'vue'

/**
 * Place a floating panel against the field that opened it.
 *
 * The panel is teleported to <body> and positioned `fixed`, in viewport
 * coordinates. That is what lets a picker opened inside a modal paint in front
 * of it: an absolutely-positioned child is trapped by its ancestors' stacking
 * context and clipped by any of them that scrolls, so a panel anchored to a
 * field near the bottom of a dialog ends up half outside it with no way to
 * reach the rest.
 *
 * Two rules, both about staying on screen:
 *
 *   - Opens downward, and flips above the field when it would not fit below
 *     and there is more room up there.
 *   - Right-aligned with the field, then clamped so neither edge leaves the
 *     viewport.
 *
 * Re-placed on scroll and resize while open — `capture: true` because the
 * scroll that matters is usually a dialog's own body, which does not bubble.
 */
export function useAnchoredPanel(
  open: Ref<boolean>,
  anchor: Ref<HTMLElement | null>,
  panel: Ref<HTMLElement | null>,
) {
  /** Gap between the field and the panel. */
  const GAP = 4
  /** Smallest distance the panel is allowed to sit from a viewport edge. */
  const EDGE = 8

  const style = ref<Record<string, string>>({ top: '-9999px', left: '-9999px' })

  function place() {
    const box = anchor.value?.getBoundingClientRect()
    const el = panel.value
    if (!box || !el) return

    const width = el.offsetWidth
    const height = el.offsetHeight
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    const roomBelow = viewportHeight - box.bottom - GAP - EDGE
    const roomAbove = box.top - GAP - EDGE
    const flip = height > roomBelow && roomAbove > roomBelow

    const top = flip ? Math.max(EDGE, box.top - GAP - height) : box.bottom + GAP
    const left = Math.min(
      Math.max(EDGE, box.right - width),
      Math.max(EDGE, viewportWidth - width - EDGE),
    )

    style.value = { top: `${top}px`, left: `${left}px` }
  }

  function stopListening() {
    window.removeEventListener('scroll', place, true)
    window.removeEventListener('resize', place)
  }

  watch(open, async (isOpen) => {
    if (!isOpen) {
      stopListening()
      // Park it off-screen so the next open cannot flash at the old position
      // for the frame before place() runs.
      style.value = { top: '-9999px', left: '-9999px' }
      return
    }
    // The panel has to exist and have been laid out before it can be measured.
    await nextTick()
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
  })

  onBeforeUnmount(stopListening)

  return { style, place }
}
