<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * Approved uploads per month — one series, so no legend: the card's title says
 * what's plotted.
 *
 * Values live in the hover tooltip and the screen-reader table rather than being
 * printed on every column; only the tallest month is labelled, which is what
 * makes a direct label worth reading.
 */
const props = withDefaults(
  defineProps<{
    /** Oldest first. `month` is 'YYYY-MM'. */
    data: { month: string; count: number }[]
    height?: number
  }>(),
  { height: 180 },
)

/**
 * The viewBox tracks the element's real width, so the chart is drawn at 1:1 CSS
 * pixels and fills the card.
 *
 * It used to be a fixed 600. An SVG whose viewBox is narrower than its box does
 * not stretch to fit: `preserveAspectRatio` scales uniformly, and the height is
 * the binding constraint here, so the drawing stayed at 1:1 and was CENTRED —
 * which is where the empty gutter on either side came from. Measuring hands the
 * spare room to the bands instead of to two margins.
 */
const root = ref<HTMLElement | null>(null)
/** 600 until the observer first reports — one frame, and whenever unmeasured. */
const measured = ref(600)
/**
 * Below this the drawing stops growing and `preserveAspectRatio` takes over
 * again, shrinking the whole chart to fit.
 *
 * The admin sidebar is a fixed 224px, so on a phone this card is barely 70px
 * across. Drawn 1:1 that is a 3px bar under six colliding month labels; scaled
 * down it is at least a legible miniature, which is what the fixed viewBox used
 * to give for free. The floor keeps that fallback and only lets the chart fill
 * containers wide enough to be worth filling.
 */
const MIN_WIDTH = 360
const chartWidth = computed(() => Math.max(MIN_WIDTH, measured.value))
let observer: ResizeObserver | undefined

onMounted(() => {
  if (!root.value) return
  observer = new ResizeObserver(([entry]) => {
    const w = entry?.contentRect.width ?? 0
    // A card on a hidden tab measures 0. Keeping the last good width avoids
    // dividing the plot into zero-width bands and undoing it a tick later.
    if (w > 0) measured.value = w
  })
  observer.observe(root.value)
})
onBeforeUnmount(() => observer?.disconnect())
const PAD = { top: 16, right: 8, bottom: 26, left: 32 }
const BAR_MAX = 56 // cap the mark — the band's leftover is air
const BAR_RADIUS = 4 // rounded data-end, square at the baseline

const hovered = ref<number | null>(null)

const plot = computed(() => ({
  w: chartWidth.value - PAD.left - PAD.right,
  h: props.height - PAD.top - PAD.bottom,
}))

const TICK_DIVISIONS = 2 // 0, mid, top — recessive, just enough to read heights

/**
 * Axis top: a clean number that also divides by the tick count, so the middle
 * gridline is a whole upload rather than "2.5". Never zero, or every bar would
 * scale to nothing.
 */
const yMax = computed(() => {
  const peak = Math.max(1, ...props.data.map((d) => d.count))
  const step = peak <= 10 ? 2 : peak <= 50 ? 10 : peak <= 200 ? 50 : 100
  return Math.ceil(peak / step) * step
})

const ticks = computed(() =>
  Array.from({ length: TICK_DIVISIONS + 1 }, (_, i) => {
    const value = (yMax.value / TICK_DIVISIONS) * i
    return { value, y: PAD.top + plot.value.h - (value / yMax.value) * plot.value.h }
  }),
)

const bars = computed(() => {
  const band = plot.value.w / Math.max(1, props.data.length)
  const width = Math.min(BAR_MAX, band - 2) // 2px surface gap between neighbours
  const peak = Math.max(...props.data.map((d) => d.count))

  return props.data.map((d, i) => {
    const h = (d.count / yMax.value) * plot.value.h
    const x = PAD.left + band * i + (band - width) / 2
    const y = PAD.top + plot.value.h - h
    return {
      ...d,
      i,
      x,
      y,
      w: width,
      h,
      bandX: PAD.left + band * i,
      bandW: band,
      isPeak: d.count === peak && d.count > 0,
      label: monthLabel(d.month),
    }
  })
})

/** Path with a rounded top and square feet, so the mark sits on the baseline. */
function barPath(bar: { x: number; y: number; w: number; h: number }) {
  const r = Math.min(BAR_RADIUS, bar.w / 2, Math.max(0, bar.h))
  const bottom = bar.y + bar.h
  if (bar.h <= 0) return ''
  return `M${bar.x},${bottom} L${bar.x},${bar.y + r} Q${bar.x},${bar.y} ${bar.x + r},${bar.y} L${bar.x + bar.w - r},${bar.y} Q${bar.x + bar.w},${bar.y} ${bar.x + bar.w},${bar.y + r} L${bar.x + bar.w},${bottom} Z`
}

function monthLabel(month: string) {
  const [year, m] = month.split('-')
  const date = new Date(Number(year), Number(m) - 1, 1)
  return date.toLocaleDateString(undefined, { month: 'short' })
}

function monthTitle(month: string) {
  const [year, m] = month.split('-')
  const date = new Date(Number(year), Number(m) - 1, 1)
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

const active = computed(() => (hovered.value === null ? null : (bars.value[hovered.value] ?? null)))
</script>

<template>
  <div ref="root" class="relative w-full">
    <svg
      :viewBox="`0 0 ${chartWidth} ${height}`"
      class="w-full"
      :style="{ height: `${height}px` }"
      role="img"
      aria-label="Approved uploads per month"
    >
      <!-- Gridlines: hairline, solid, one step off the surface -->
      <g>
        <line
          v-for="tick in ticks"
          :key="tick.value"
          :x1="PAD.left"
          :x2="chartWidth - PAD.right"
          :y1="tick.y"
          :y2="tick.y"
          stroke="#E5E7EB"
          stroke-width="1"
        />
        <text
          v-for="tick in ticks"
          :key="`t-${tick.value}`"
          :x="PAD.left - 8"
          :y="tick.y + 4"
          text-anchor="end"
          class="fill-gray-400 text-[10px]"
        >
          {{ tick.value.toLocaleString() }}
        </text>
      </g>

      <!-- Bars. Hit target is the whole band, not the mark. -->
      <g>
        <template v-for="bar in bars" :key="bar.month">
          <rect
            :x="bar.bandX"
            :y="PAD.top"
            :width="bar.bandW"
            :height="plot.h"
            fill="transparent"
            @mouseenter="hovered = bar.i"
            @mouseleave="hovered = null"
          />
          <path
            :d="barPath(bar)"
            class="bar-rise fill-primary transition-opacity"
            :style="{ animationDelay: `${bar.i * 60}ms` }"
            :opacity="hovered === null || hovered === bar.i ? 1 : 0.45"
            pointer-events="none"
          />
          <!-- Only the peak is labelled; the rest live in the tooltip/table. -->
          <text
            v-if="bar.isPeak && hovered === null"
            :x="bar.x + bar.w / 2"
            :y="bar.y - 6"
            text-anchor="middle"
            class="label-in fill-gray-500 text-[10px] font-semibold"
            :style="{ animationDelay: `${bar.i * 60 + 420}ms` }"
          >
            {{ bar.count }}
          </text>
          <text
            :x="bar.bandX + bar.bandW / 2"
            :y="height - 8"
            text-anchor="middle"
            class="text-[10px]"
            :class="hovered === bar.i ? 'fill-gray-700' : 'fill-gray-400'"
          >
            {{ bar.label }}
          </text>
        </template>
      </g>
    </svg>

    <!-- Tooltip -->
    <div
      v-if="active"
      class="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-lg bg-gray-900 px-2.5 py-1.5 text-[11px] text-white shadow-lg"
      :style="{
        left: `${((active.bandX + active.bandW / 2) / chartWidth) * 100}%`,
        top: `${active.y - 8}px`,
      }"
    >
      <p class="font-semibold">{{ active.count }} upload{{ active.count === 1 ? '' : 's' }}</p>
      <p class="text-white/60">{{ monthTitle(active.month) }}</p>
    </div>

    <!-- Same numbers, for screen readers and anyone who can't hover.

         sr-only goes on a block wrapper, not the table: `width`/`height` on a
         table box are minimums, so the table would keep its full intrinsic
         size and add it to the scroll area of whatever contains the card. -->
    <div class="sr-only">
      <table>
        <caption>
          Approved uploads per month
        </caption>
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">Uploads</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="bar in bars" :key="bar.month">
            <th scope="row">{{ monthTitle(bar.month) }}</th>
            <td>{{ bar.count }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
/**
 * Columns rise out of the baseline, left to right across the months — the
 * vertical counterpart of the department chart's bars, and the same curve.
 *
 * `fill-box` puts the origin on the mark itself rather than the SVG's corner,
 * so a column grows from the axis instead of sliding out of the top left.
 * `backwards` holds the from-state through the stagger delay; without it every
 * column flashes at full height for one frame before its turn comes.
 */
.bar-rise {
  transform-box: fill-box;
  transform-origin: center bottom;
  animation: bar-rise 560ms cubic-bezier(0.22, 1, 0.36, 1) backwards;
}

@keyframes bar-rise {
  from {
    transform: scaleY(0);
  }
}

/* The peak's number waits for its own column rather than hanging over a gap. */
.label-in {
  animation: label-in 240ms ease-out backwards;
}

@keyframes label-in {
  from {
    opacity: 0;
  }
}

/* Motion is decoration here — the chart reads identically without it. */
@media (prefers-reduced-motion: reduce) {
  .bar-rise,
  .label-in {
    animation: none;
  }
}
</style>
