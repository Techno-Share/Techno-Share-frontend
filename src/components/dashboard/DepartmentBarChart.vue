<script setup lang="ts">
import { computed, ref } from 'vue'

/**
 * Approved documents per department — one series, so no legend: the card's
 * title says what is plotted.
 *
 * Horizontal on purpose. Thirteen department acronyms as column labels either
 * rotate or collide; as row labels they read straight and leave the length of
 * the bar as the only thing to compare.
 *
 * Every bar is the SAME hue. The departments are nominal — reordering them
 * changes nothing — so colour has no identity work to do here, and colouring
 * each bar by its own value would re-encode what the bar length already shows.
 */
const props = withDefaults(
  defineProps<{
    /** Busiest first; the server orders it. */
    data: { acronym: string; count: number }[]
    /** Height of one row, including its gap. */
    rowHeight?: number
  }>(),
  { rowHeight: 26 },
)

// Fixed viewBox; the SVG scales to its container width.
const WIDTH = 600
const PAD = { top: 4, right: 36, bottom: 18, left: 46 }
const BAR_MAX = 14 // thin mark — the row's leftover is air
const BAR_RADIUS = 4 // rounded data-end, square at the baseline

const hovered = ref<number | null>(null)

const height = computed(() => PAD.top + PAD.bottom + props.data.length * props.rowHeight)

const plot = computed(() => ({
  w: WIDTH - PAD.left - PAD.right,
  h: props.data.length * props.rowHeight,
}))

const TICK_DIVISIONS = 2 // 0, mid, top — just enough to read lengths

/**
 * Axis end: a clean number that also divides by the tick count, so the middle
 * gridline is a whole document rather than "2.5". Never zero, or every bar
 * would scale to nothing.
 */
const xMax = computed(() => {
  const peak = Math.max(1, ...props.data.map((d) => d.count))
  const step = peak <= 10 ? 2 : peak <= 50 ? 10 : peak <= 200 ? 50 : 100
  return Math.ceil(peak / step) * step
})

const ticks = computed(() =>
  Array.from({ length: TICK_DIVISIONS + 1 }, (_, i) => {
    const value = (xMax.value / TICK_DIVISIONS) * i
    return { value, x: PAD.left + (value / xMax.value) * plot.value.w }
  }),
)

const bars = computed(() => {
  const barHeight = Math.min(BAR_MAX, props.rowHeight - 2) // 2px gap between rows
  const peak = Math.max(...props.data.map((d) => d.count))

  return props.data.map((d, i) => {
    const w = (d.count / xMax.value) * plot.value.w
    const bandY = PAD.top + props.rowHeight * i
    return {
      ...d,
      i,
      w,
      x: PAD.left,
      y: bandY + (props.rowHeight - barHeight) / 2,
      h: barHeight,
      bandY,
      bandH: props.rowHeight,
      isPeak: d.count === peak && d.count > 0,
    }
  })
})

/** Path with a rounded end and a square foot, so the mark sits on the axis. */
function barPath(bar: { x: number; y: number; w: number; h: number }) {
  if (bar.w <= 0) return ''
  const r = Math.min(BAR_RADIUS, bar.h / 2, bar.w)
  const end = bar.x + bar.w
  return `M${bar.x},${bar.y} L${end - r},${bar.y} Q${end},${bar.y} ${end},${bar.y + r} L${end},${bar.y + bar.h - r} Q${end},${bar.y + bar.h} ${end - r},${bar.y + bar.h} L${bar.x},${bar.y + bar.h} Z`
}

const active = computed(() => (hovered.value === null ? null : (bars.value[hovered.value] ?? null)))
</script>

<template>
  <div class="relative w-full">
    <svg
      :viewBox="`0 0 ${WIDTH} ${height}`"
      class="w-full"
      :style="{ height: `${height}px` }"
      role="img"
      aria-label="Approved documents per department"
    >
      <!-- Gridlines: hairline, solid, one step off the surface -->
      <g>
        <line
          v-for="tick in ticks"
          :key="tick.value"
          :x1="tick.x"
          :x2="tick.x"
          :y1="PAD.top"
          :y2="PAD.top + plot.h"
          stroke="#E5E7EB"
          stroke-width="1"
        />
        <text
          v-for="tick in ticks"
          :key="`t-${tick.value}`"
          :x="tick.x"
          :y="height - 4"
          text-anchor="middle"
          class="fill-gray-400 text-[10px]"
        >
          {{ tick.value.toLocaleString() }}
        </text>
      </g>

      <!-- Bars. Hit target is the whole row, not the mark. -->
      <g>
        <template v-for="bar in bars" :key="bar.acronym">
          <rect
            :x="PAD.left"
            :y="bar.bandY"
            :width="plot.w"
            :height="bar.bandH"
            fill="transparent"
            @mouseenter="hovered = bar.i"
            @mouseleave="hovered = null"
          />
          <text
            :x="PAD.left - 8"
            :y="bar.bandY + bar.bandH / 2 + 3"
            text-anchor="end"
            class="text-[10px] font-medium"
            :class="hovered === bar.i ? 'fill-gray-700' : 'fill-gray-500'"
          >
            {{ bar.acronym }}
          </text>
          <!-- A department with nothing in it draws no mark at all, rather
               than an empty path element. Its row still gets a label and a
               zero, which is the point of keeping the row. -->
          <path
            v-if="bar.count > 0"
            :d="barPath(bar)"
            class="bar-grow fill-primary transition-opacity"
            :style="{ animationDelay: `${bar.i * 40}ms` }"
            :opacity="hovered === null || hovered === bar.i ? 1 : 0.45"
            pointer-events="none"
          />
          <!-- Only the busiest department is labelled; the rest live in the
               tooltip and the table. A zero gets a label too, because an empty
               department is the thing this chart exists to show. -->
          <text
            v-if="(bar.isPeak || bar.count === 0) && hovered === null"
            :x="PAD.left + bar.w + 6"
            :y="bar.y + bar.h / 2 + 3"
            class="fill-gray-500 text-[10px] font-semibold"
          >
            {{ bar.count }}
          </text>
        </template>
      </g>
    </svg>

    <!-- Tooltip -->
    <div
      v-if="active"
      class="pointer-events-none absolute -translate-y-1/2 rounded-lg bg-gray-900 px-2.5 py-1.5 text-[11px] whitespace-nowrap text-white shadow-lg"
      :style="{
        left: `${((PAD.left + active.w + 10) / WIDTH) * 100}%`,
        top: `${active.bandY + active.bandH / 2}px`,
      }"
    >
      <p class="font-semibold">{{ active.count }} document{{ active.count === 1 ? '' : 's' }}</p>
      <p class="text-white/60">{{ active.acronym }}</p>
    </div>

    <!-- Same numbers, for screen readers and anyone who can't hover.

         The wrapper carries sr-only, not the table. `width`/`height` on a
         table box are minimums, not fixed sizes, so sr-only's 1px box never
         shrank the table: it laid out at its full intrinsic height — one row
         per department — and, being absolutely positioned inside the card,
         added that height to <main>'s scrollable area. That is the band of
         empty page the dashboard used to scroll past under the last card.
         A plain block honours the 1px box and clips the table inside it. -->
    <div class="sr-only">
      <table>
        <caption>
          Approved documents per department
        </caption>
        <thead>
          <tr>
            <th scope="col">Department</th>
            <th scope="col">Documents</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="bar in bars" :key="bar.acronym">
            <th scope="row">{{ bar.acronym }}</th>
            <td>{{ bar.count }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
/**
 * Bars grow from the axis, staggered down the ranking.
 *
 * `fill-box` makes the origin the mark's own left edge, so a bar grows out of
 * the axis rather than out of the SVG corner. `backwards` holds the from-state
 * during the stagger delay — without it every bar flashes at full length for
 * one frame before its turn.
 *
 * 40ms per row over 13 rows finishes in about a second; longer and the chart
 * feels slow to read, which is the opposite of what a dashboard wants.
 */
.bar-grow {
  transform-box: fill-box;
  transform-origin: left center;
  animation: bar-grow 560ms cubic-bezier(0.22, 1, 0.36, 1) backwards;
}

@keyframes bar-grow {
  from {
    transform: scaleX(0);
  }
}

/* Motion is decoration here — the chart reads identically without it. */
@media (prefers-reduced-motion: reduce) {
  .bar-grow {
    animation: none;
  }
}
</style>
