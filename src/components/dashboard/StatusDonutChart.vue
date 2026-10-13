<script setup lang="ts">
import { computed, ref } from 'vue'

/**
 * Documents by state, as parts of a whole.
 *
 * A donut is legal here for the two reasons it is usually not: there are four
 * segments (the ceiling is six), and the question is "what share of the archive
 * is still in circulation" rather than a comparison of close values. The server
 * buckets every non-pending upload with a single CASE, so the four really do
 * sum to the centre total — a donut built on four independent counts could
 * drift and would be quietly lying.
 *
 * ── Palette ────────────────────────────────────────────────────────────────
 * Four nominal states, so colour carries identity and the hues are assigned by
 * slot, never cycled. Validated as a categorical palette in this ring order
 * (light surface): worst adjacent CVD ΔE 22.7, normal-vision floor 32.0, and
 * the wrap-around pair rejected↔active 17.1 — a ring closes, so that pair is
 * adjacent too and has to clear the same gate.
 *
 * `#eda100` sits below 3:1 against white, which obliges secondary encoding
 * rather than being dismissable: the legend prints every label and percentage,
 * and the table below carries the same numbers. Do not drop either.
 *
 * Active takes the product's own primary so the slice matches the badge the
 * Documents tab already shows for that state.
 */
const SEGMENTS = [
  { key: 'active', label: 'Active', color: '#008cb9' },
  { key: 'hidden', label: 'Hidden', color: '#eda100' },
  { key: 'expired', label: 'Expired', color: '#4a3aa7' },
  { key: 'rejected', label: 'Not approved', color: '#e34948' },
] as const

const props = withDefaults(
  defineProps<{
    /** Any order; the component renders them in the fixed slot order above. */
    data: { status: string; count: number }[]
    size?: number
  }>(),
  { size: 200 },
)

const STROKE = 26 // ring thickness
const GAP_DEG = 2 // surface gap between neighbouring fills
const DRAW_MS = 900 // one full turn of the ring, shared out by segment share

const hovered = ref<number | null>(null)

const total = computed(() => props.data.reduce((sum, d) => sum + d.count, 0))

const radius = computed(() => (props.size - STROKE) / 2)
const centre = computed(() => props.size / 2)

const arcs = computed(() => {
  let cursor = 0
  let delay = 0
  return SEGMENTS.map((segment, i) => {
    const count = props.data.find((d) => d.status === segment.key)?.count ?? 0
    const share = total.value ? count / total.value : 0
    const start = cursor * 360
    cursor += share
    const sweep = cursor * 360 - start
    /**
     * Arc length, for the dash-offset draw. Each segment waits for the one
     * before it, so the ring is drawn once around rather than four segments
     * appearing at once.
     *
     * Time is shared by proportion, which keeps the sweep at a roughly even
     * speed — except at the floor: a sliver given its true share would flick
     * past in under a frame, so 120ms is the shortest a segment may take. Below
     * about 13% of the ring a segment therefore draws slower than the rest,
     * which is the right trade: being seen matters more than being exact.
     */
    const length = 2 * Math.PI * radius.value * (sweep / 360)
    const duration = Math.max(120, share * DRAW_MS)
    const startedAt = delay
    delay += duration
    return {
      ...segment,
      i,
      count,
      share,
      startDeg: start,
      endDeg: cursor * 360,
      // Rounded to whole numbers for display; the table carries the counts.
      percent: Math.round(share * 100),
      length,
      duration,
      delay: startedAt,
    }
  })
})

/**
 * One arc as a stroked path.
 *
 * The gap is taken off each end rather than between segments, so a segment that
 * is too small to survive it collapses to nothing instead of inverting — which
 * is what a naive `start + gap > end` produces.
 */
function arcPath(startDeg: number, endDeg: number) {
  const sweep = endDeg - startDeg
  if (sweep <= 0) return ''
  // A full ring has no neighbour to be separated from.
  const gap = sweep >= 360 ? 0 : Math.min(GAP_DEG, sweep / 3)
  const from = startDeg + gap / 2
  const to = endDeg - gap / 2
  const r = radius.value
  const c = centre.value

  // Two half-circles: a single arc of exactly 360° has identical endpoints and
  // renders as nothing at all.
  if (to - from >= 359.9) {
    return `M${c},${c - r} A${r},${r} 0 1 1 ${c},${c + r} A${r},${r} 0 1 1 ${c},${c - r}`
  }

  const point = (deg: number) => {
    // -90 so 0° is twelve o'clock, which is where a reader starts.
    const rad = ((deg - 90) * Math.PI) / 180
    return [c + r * Math.cos(rad), c + r * Math.sin(rad)]
  }
  const [x1, y1] = point(from)
  const [x2, y2] = point(to)
  const largeArc = to - from > 180 ? 1 : 0
  return `M${x1},${y1} A${r},${r} 0 ${largeArc} 1 ${x2},${y2}`
}

const active = computed(() => (hovered.value === null ? null : (arcs.value[hovered.value] ?? null)))
</script>

<template>
  <!-- relative, like the two bar charts: it makes this card the containing
       block for the absolutely-positioned sr-only table below, so <main>
       clips it. Unpositioned, that box anchors to the viewport instead and
       its height lands on the page's own scroll area. -->
  <div class="relative flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
    <!-- Ring -->
    <div class="relative shrink-0" :style="{ width: `${size}px`, height: `${size}px` }">
      <svg
        :viewBox="`0 0 ${size} ${size}`"
        :width="size"
        :height="size"
        role="img"
        aria-label="Documents by status"
      >
        <!-- Track, so an empty archive still reads as a ring rather than a void -->
        <circle
          :cx="centre"
          :cy="centre"
          :r="radius"
          fill="none"
          stroke="#F3F4F6"
          :stroke-width="STROKE"
        />
        <!-- A bucket at zero draws nothing, rather than an empty path. It
             keeps its legend row so the colour slots never shift. -->
        <path
          v-for="arc in arcs.filter((a) => a.count > 0)"
          :key="arc.key"
          :d="arcPath(arc.startDeg, arc.endDeg)"
          fill="none"
          :stroke="arc.color"
          :stroke-width="STROKE"
          class="arc-draw transition-opacity"
          :style="{
            '--len': arc.length,
            animationDuration: `${arc.duration}ms`,
            animationDelay: `${arc.delay}ms`,
          }"
          :opacity="hovered === null || hovered === arc.i ? 1 : 0.35"
          @mouseenter="hovered = arc.i"
          @mouseleave="hovered = null"
        />
      </svg>

      <!-- Centre total. The hero number of the card; the hovered slice
           replaces it so the ring and the figure never disagree. -->
      <div
        class="legend-in pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center"
      >
        <p class="text-[11px] text-gray-500">{{ active ? active.label : 'Total' }}</p>
        <p class="text-2xl font-bold text-gray-900">
          {{ (active ? active.count : total).toLocaleString() }}
        </p>
      </div>
    </div>

    <!-- Legend. Four series, so labels are mandatory rather than optional —
         and they are what relieves the one sub-3:1 fill. Text keeps its own ink;
         the dot beside it carries the identity. -->
    <ul class="legend-in space-y-2.5">
      <li
        v-for="arc in arcs"
        :key="arc.key"
        class="flex items-center gap-2.5"
        @mouseenter="hovered = arc.i"
        @mouseleave="hovered = null"
      >
        <span class="h-2.5 w-2.5 shrink-0 rounded-full" :style="{ backgroundColor: arc.color }" />
        <span class="text-sm text-gray-600">{{ arc.label }}</span>
        <span class="ml-auto pl-3 text-sm font-semibold text-gray-900"> {{ arc.percent }}% </span>
      </li>
    </ul>

    <!-- Same numbers, for screen readers and anyone who can't hover.

         sr-only goes on a block wrapper, not the table: `width`/`height` on a
         table box are minimums, so the table would keep its full intrinsic
         size and add it to the scroll area of whatever contains the card. -->
    <div class="sr-only">
      <table>
        <caption>
          Documents by status
        </caption>
        <thead>
          <tr>
            <th scope="col">Status</th>
            <th scope="col">Documents</th>
            <th scope="col">Share</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="arc in arcs" :key="arc.key">
            <th scope="row">{{ arc.label }}</th>
            <td>{{ arc.count }}</td>
            <td>{{ arc.percent }}%</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
/**
 * The ring draws itself once around, clockwise from twelve.
 *
 * A dash the length of the arc, offset by that same length, hides the stroke
 * completely; animating the offset to zero uncovers it from its start point.
 * `--len` is set per segment from the arc's real length, so the dash always
 * matches the path it is hiding.
 *
 * `backwards` holds the hidden state through the delay — without it a segment
 * is painted in full until its turn arrives, which is the whole effect
 * backwards.
 */
.arc-draw {
  stroke-dasharray: var(--len);
  stroke-dashoffset: 0;
  animation-name: arc-draw;
  animation-timing-function: linear;
  animation-fill-mode: backwards;
}

@keyframes arc-draw {
  from {
    stroke-dashoffset: var(--len);
  }
}

/**
 * Legend dots fade in with the ring rather than sitting there fully formed
 * while it draws. One shared delay, not per-row: the legend is a key, and
 * staggering it would imply an order the colours do not have.
 */
.legend-in {
  animation: legend-in 400ms ease-out 500ms backwards;
}

@keyframes legend-in {
  from {
    opacity: 0;
  }
}

/* Motion is decoration here — the chart reads identically without it. */
@media (prefers-reduced-motion: reduce) {
  .arc-draw,
  .legend-in {
    animation: none;
  }
}
</style>
