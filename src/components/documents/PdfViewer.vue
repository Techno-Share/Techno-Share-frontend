<script setup lang="ts">
import { computed, ref, shallowRef, watch, nextTick, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import * as pdfjs from 'pdfjs-dist'
import type {
  OnProgressParameters,
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  RenderTask,
} from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { formatFileSize } from '@/utils/format'

/**
 * PDF reader with a page-thumbnail rail, rendered with pdf.js rather than the
 * browser's built-in viewer (which brings its own toolbar and gives no way to
 * show thumbnails).
 *
 * Pages render lazily: a canvas is only painted once it scrolls near the
 * viewport, so a 200-page file costs the same to open as a 2-page one.
 */
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

const props = defineProps<{ src: string }>()
const { t } = useI18n({ useScope: 'global' })

const doc = shallowRef<PDFDocumentProxy | null>(null)
let loadingTask: PDFDocumentLoadingTask | null = null
const pages = ref<{ num: number; width: number; height: number }[]>([])
const loading = ref(true)
const failed = ref(false)

/**
 * Download progress for the file itself.
 *
 * pdf.js reports bytes as they arrive, but it can only report a `total` when
 * the response carries a Content-Length. A presigned MinIO GET does; a
 * chunked or compressed one does not. So 0 here means "size unknown", not
 * "nothing yet" — the bar runs indeterminate instead of sitting at 0%.
 */
const loadedBytes = ref(0)
const totalBytes = ref(0)

/**
 * 'download' while bytes are arriving, 'prepare' once they all have and the
 * page boxes are being measured. That second step has no byte count to report
 * and is not free on a long file — up to 60 getPage() calls — so it gets its
 * own indeterminate phase rather than leaving the bar frozen at 100%.
 */
const phase = ref<'download' | 'prepare'>('download')

/** null when the total is unknown, which is what drives the indeterminate bar. */
const percent = computed(() =>
  totalBytes.value > 0
    ? Math.min(100, Math.round((loadedBytes.value / totalBytes.value) * 100))
    : null,
)

/** "1.2 MB / 8.4 MB", or just the loaded part when there is no total. */
const progressLabel = computed(() => {
  if (!loadedBytes.value) return ''
  const done = formatFileSize(Math.round(loadedBytes.value / 1024))
  if (!totalBytes.value) return done
  return `${done} / ${formatFileSize(Math.round(totalBytes.value / 1024))}`
})

/** The line under the bar: a percentage when there is one, bytes either way. */
const progressText = computed(() => {
  if (phase.value === 'prepare') return ''
  if (percent.value === null) return progressLabel.value
  return progressLabel.value ? `${percent.value}% · ${progressLabel.value}` : `${percent.value}%`
})

const currentPage = ref(1)
const scale = ref(1)

const scroller = ref<HTMLElement | null>(null)
const pageEls = new Map<number, HTMLElement>()
const pageCanvases = new Map<number, HTMLCanvasElement>()
const thumbCanvases = new Map<number, HTMLCanvasElement>()
const paintedAt = new Map<number, number>()
const paintedThumbs = new Set<number>()
const tasks = new Map<number, RenderTask>()

const dpr = Math.min(window.devicePixelRatio || 1, 2)
const THUMB_WIDTH = 108
/** Widest a page is ever drawn, however much room the pane has. */
const BASE_WIDTH = 820

/**
 * True once the reader has zoomed by hand. Fit-to-width then stops chasing the
 * pane, so rotating a phone or resizing a window no longer throws away the
 * magnification they chose.
 */
let userZoomed = false
let paneObserver: ResizeObserver | null = null

let pageObserver: IntersectionObserver | null = null
let thumbObserver: IntersectionObserver | null = null
/**
 * Which page you are actually looking at — a separate observer from the one
 * that paints, because painting needs a generous rootMargin and that margin
 * inflates intersectionRatio for pages still below the fold.
 */
let currentObserver: IntersectionObserver | null = null
/** Last known ratio per page, so the most-visible one can be picked. */
const pageRatios = new Map<number, number>()

function setPageEl(num: number, el: Element | null) {
  if (el) {
    pageEls.set(num, el as HTMLElement)
    pageObserver?.observe(el)
  }
}

function setPageCanvas(num: number, el: Element | null) {
  if (el) pageCanvases.set(num, el as HTMLCanvasElement)
}

function setThumbCanvas(num: number, el: Element | null) {
  if (el) {
    thumbCanvases.set(num, el as HTMLCanvasElement)
    thumbObserver?.observe(el)
  }
}

async function paintPage(num: number) {
  const pdf = doc.value
  const canvas = pageCanvases.get(num)
  if (!pdf || !canvas || paintedAt.get(num) === scale.value) return

  tasks.get(num)?.cancel()
  const page = await pdf.getPage(num)
  const viewport = page.getViewport({ scale: scale.value * dpr })
  canvas.width = viewport.width
  canvas.height = viewport.height
  canvas.style.width = `${viewport.width / dpr}px`
  canvas.style.height = `${viewport.height / dpr}px`

  const context = canvas.getContext('2d')
  if (!context) return
  const task = page.render({ canvas, canvasContext: context, viewport })
  tasks.set(num, task)
  try {
    await task.promise
    paintedAt.set(num, scale.value)
  } catch {
    /* superseded by a newer render — the latest one wins */
  }
}

async function paintThumb(num: number) {
  const pdf = doc.value
  const canvas = thumbCanvases.get(num)
  if (!pdf || !canvas || paintedThumbs.has(num)) return
  paintedThumbs.add(num)

  const page = await pdf.getPage(num)
  const base = page.getViewport({ scale: 1 })
  const viewport = page.getViewport({ scale: (THUMB_WIDTH / base.width) * dpr })
  canvas.width = viewport.width
  canvas.height = viewport.height
  canvas.style.width = `${THUMB_WIDTH}px`
  canvas.style.height = `${viewport.height / dpr}px`

  const context = canvas.getContext('2d')
  if (!context) return
  try {
    await page.render({ canvas, canvasContext: context, viewport }).promise
  } catch {
    paintedThumbs.delete(num)
  }
}

function goToPage(num: number) {
  pageEls.get(num)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/**
 * Left and right step a page at a time.
 *
 * Deliberately NOT up/down: those already scroll the document line by line, and
 * taking them over would cost the only way to read across a page break.
 *
 * currentPage is maintained by the intersection observer, so this follows
 * wherever the reader has scrolled to rather than a separate counter.
 */
function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
  // Let the browser's own shortcuts through, and leave typing alone.
  if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return
  const el = document.activeElement as HTMLElement | null
  if (el?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el?.tagName ?? '')) return
  if (!pages.value.length) return

  const next = currentPage.value + (e.key === 'ArrowRight' ? 1 : -1)
  if (next < 1 || next > pages.value.length) return
  e.preventDefault()
  currentPage.value = next
  goToPage(next)
}

window.addEventListener('keydown', onKeydown)

function zoomBy(factor: number) {
  userZoomed = true
  scale.value = Math.min(3, Math.max(0.4, scale.value * factor))
  paintedAt.clear()
  for (const num of pageEls.keys()) if (isNear(num)) void paintPage(num)
}

/**
 * How wide one page may be drawn — measured from the pane, not assumed.
 *
 * The scale used to come from a flat BASE_WIDTH / pageWidth, so every page was
 * laid out for an 820px pane. On a 390px phone that painted a page twice the
 * width of the screen and left the right-hand half unreachable.
 *
 * The padding is read back off the element rather than hard-coded, so the
 * responsive `p-2 sm:p-4` on the scroller cannot drift out of sync with it.
 */
function availableWidth() {
  const el = scroller.value
  if (!el || !el.clientWidth) return BASE_WIDTH // pre-mount: no pane to measure
  const style = getComputedStyle(el)
  const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)
  return Math.max(200, Math.min(BASE_WIDTH, el.clientWidth - padding))
}

/** Scale the pages so one fits the pane's width. */
function fitToWidth() {
  const first = pages.value[0]
  if (!first) return
  const next = Math.min(1.6, availableWidth() / first.width)
  // Sub-percent differences are invisible and would repaint every page.
  if (Math.abs(next - scale.value) < 0.01) return
  scale.value = next
  paintedAt.clear()
  for (const num of pageEls.keys()) if (isNear(num)) void paintPage(num)
}

/**
 * Re-fit when the pane changes width — a rotated phone, a resized window, a
 * modal that grew. ResizeObserver rather than a window listener: the pane can
 * change size while the window does not.
 */
function watchPaneWidth() {
  paneObserver?.disconnect()
  if (!scroller.value) return
  let last = scroller.value.clientWidth
  paneObserver = new ResizeObserver(() => {
    const width = scroller.value?.clientWidth ?? 0
    // Height-only changes (the phone's URL bar sliding away) must not repaint.
    if (!width || width === last) return
    last = width
    if (!userZoomed) fitToWidth()
  })
  paneObserver.observe(scroller.value)
}

/** Cheap visibility test used when re-painting after a zoom. */
function isNear(num: number) {
  const el = pageEls.get(num)
  const box = scroller.value?.getBoundingClientRect()
  if (!el || !box) return false
  const rect = el.getBoundingClientRect()
  return rect.bottom > box.top - box.height && rect.top < box.bottom + box.height
}

function teardown() {
  for (const task of tasks.values()) task.cancel()
  tasks.clear()
  paneObserver?.disconnect()
  paneObserver = null
  pageObserver?.disconnect()
  thumbObserver?.disconnect()
  currentObserver?.disconnect()
  pageObserver = thumbObserver = currentObserver = null
  pageRatios.clear()
  pageEls.clear()
  pageCanvases.clear()
  thumbCanvases.clear()
  paintedAt.clear()
  paintedThumbs.clear()
  void loadingTask?.destroy()
  loadingTask = null
  doc.value = null
}

/**
 * Which load() call currently owns the component's state.
 *
 * `src` changes once on nearly every open: the modal mounts this viewer with
 * the list's URL and swaps in a freshly signed one the moment it arrives. The
 * second load tears the first one down — and destroying a pdf.js loading task
 * REJECTS its promise, so the superseded call lands in the catch below and sets
 * failed = true on top of a newer load that is about to succeed. That printed
 * "This PDF couldn't be displayed" above a perfectly rendered document.
 *
 * Every write below is gated on still being the newest call.
 */
let runId = 0

async function load(src: string) {
  const run = ++runId
  teardown()
  loading.value = true
  failed.value = false
  loadedBytes.value = 0
  totalBytes.value = 0
  phase.value = 'download'
  pages.value = []
  currentPage.value = 1
  scale.value = 1
  userZoomed = false

  try {
    loadingTask = pdfjs.getDocument({ url: src })
    // Gated on run like every other write here: a superseded load keeps
    // streaming for a moment after teardown(), and its bytes must not drive
    // the bar belonging to the load that replaced it.
    loadingTask.onProgress = ({ loaded, total }: OnProgressParameters) => {
      if (run !== runId) return
      loadedBytes.value = loaded
      totalBytes.value = total
    }
    const pdf = await loadingTask.promise
    if (run !== runId) {
      // Resolved after a newer load took over: release the worker rather than
      // leaking it. destroy() lives on the loading task, not the document.
      void pdf.loadingTask.destroy()
      return
    }
    doc.value = pdf
    phase.value = 'prepare'

    // Page boxes are needed up front so the scrollbar is the right length
    // before anything is painted. Past 60 pages that costs more than it's
    // worth, so the first page's ratio stands in for the rest.
    const first = await pdf.getPage(1)
    const firstView = first.getViewport({ scale: 1 })
    scale.value = Math.min(1.6, BASE_WIDTH / firstView.width)

    const sampleAll = pdf.numPages <= 60
    const sizes: { num: number; width: number; height: number }[] = []
    for (let num = 1; num <= pdf.numPages; num++) {
      const view =
        sampleAll && num > 1 ? (await pdf.getPage(num)).getViewport({ scale: 1 }) : firstView
      sizes.push({ num, width: view.width, height: view.height })
    }
    pages.value = sizes
    loading.value = false

    await nextTick()
    if (run !== runId) return
    // Now that the pane is in the DOM its width can be measured; this corrects
    // the provisional scale above before the first page is painted.
    fitToWidth()
    watchPaneWidth()
    observe()
  } catch {
    // A superseded load reaches here by design — teardown() destroyed its task.
    // Only the newest call may report failure.
    if (run !== runId) return
    loading.value = false
    failed.value = true
  }
}

function observe() {
  const root = scroller.value
  if (!root) return

  // A page is painted once it comes within one screen of the viewport.
  pageObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) void paintPage(Number((entry.target as HTMLElement).dataset.page))
      }
    },
    { root, rootMargin: '100% 0px', threshold: 0 },
  )

  /**
   * The current page is whichever covers most of the viewport — no rootMargin
   * here, or a page a full screen below would count as visible, which is what
   * made the rail highlight page 2 while page 1 filled the screen.
   */
  currentObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        pageRatios.set(Number((entry.target as HTMLElement).dataset.page), entry.intersectionRatio)
      }
      let best = 0
      let bestRatio = 0
      for (const [num, ratio] of pageRatios) {
        if (ratio > bestRatio) {
          bestRatio = ratio
          best = num
        }
      }
      if (best) currentPage.value = best
    },
    { root, threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] },
  )
  thumbObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting)
          void paintThumb(Number((entry.target as HTMLElement).dataset.page))
      }
    },
    { rootMargin: '200px' },
  )

  for (const el of pageEls.values()) {
    pageObserver.observe(el)
    currentObserver.observe(el)
  }
  for (const el of thumbCanvases.values()) thumbObserver.observe(el)
}

watch(() => props.src, load, { immediate: true })
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  teardown()
})
</script>

<template>
  <div class="flex h-full w-full overflow-hidden rounded-lg bg-[#2B2B2B]" @click.stop>
    <!-- Thumbnail rail -->
    <aside
      v-if="pages.length > 1"
      class="hidden w-40 shrink-0 overflow-y-auto overscroll-contain border-r border-white/10 bg-black/30 py-3 sm:block"
    >
      <button
        v-for="page in pages"
        :key="page.num"
        type="button"
        class="mx-auto mb-3 flex w-[124px] flex-col items-center gap-1 hover:cursor-pointer"
        @click="goToPage(page.num)"
      >
        <canvas
          :ref="(el) => setThumbCanvas(page.num, el as Element | null)"
          :data-page="page.num"
          :style="{
            width: `${THUMB_WIDTH}px`,
            height: `${(THUMB_WIDTH * page.height) / page.width}px`,
          }"
          :class="[
            'rounded bg-white shadow-sm ring-2 transition-shadow',
            currentPage === page.num ? 'ring-primary' : 'ring-transparent',
          ]"
        />
        <span
          :class="[
            'text-[11px] font-medium',
            currentPage === page.num ? 'text-primary' : 'text-white/50',
          ]"
          >{{ page.num }}</span
        >
      </button>
    </aside>

    <!-- Pages -->
    <div class="relative flex min-w-0 flex-1 flex-col">
      <div ref="scroller" class="flex-1 overflow-auto overscroll-contain p-2 sm:p-4">
        <!-- A bar, not a line of text: an office rendition can be tens of
             megabytes over a phone connection, and "Loading…" on its own gives
             no way to tell a slow download from a stalled one. -->
        <div v-if="loading" class="flex flex-col items-center gap-3 py-16">
          <p class="text-sm text-white/60">
            {{
              phase === 'prepare'
                ? t('document.documentDetailsPage.pdfPreparing')
                : t('document.documentDetailsPage.pdfLoading')
            }}
          </p>

          <div
            class="h-1.5 w-56 max-w-[70vw] overflow-hidden rounded-full bg-white/10"
            role="progressbar"
            :aria-label="t('document.documentDetailsPage.pdfLoading')"
            :aria-valuemin="0"
            :aria-valuemax="100"
            :aria-valuenow="phase === 'download' ? (percent ?? undefined) : undefined"
            :aria-valuetext="progressText || undefined"
          >
            <!-- Determinate only while a total is known AND bytes are still
                 arriving. The prepare phase has no number to report, so it
                 reuses the indeterminate sweep rather than freezing at 100%. -->
            <div
              v-if="percent !== null && phase === 'download'"
              class="h-full rounded-full bg-primary transition-[width] duration-200 ease-out"
              :style="{ width: `${percent}%` }"
            />
            <div v-else class="pdf-progress-sweep h-full w-1/3 rounded-full bg-primary" />
          </div>

          <!-- Fixed height so the bar does not jump when the text appears. -->
          <p class="h-4 text-xs tabular-nums text-white/40">{{ progressText }}</p>
        </div>
        <p v-else-if="failed" class="py-16 text-center text-sm text-white/60">
          {{ t('document.documentDetailsPage.pdfFailed') }}
        </p>

        <!-- Chained off the two above so loading, failed and the pages are
             mutually exclusive by construction: the loop used to render
             regardless, which is what let the failure message sit on top of a
             document that had rendered perfectly well. -->
        <template v-else>
          <div
            v-for="page in pages"
            :key="page.num"
            :ref="(el) => setPageEl(page.num, el as Element | null)"
            :data-page="page.num"
            class="mx-auto mb-4 w-fit bg-white shadow-lg"
            :style="{ minHeight: `${(page.height / page.width) * 200}px` }"
          >
            <canvas
              :ref="(el) => setPageCanvas(page.num, el as Element | null)"
              class="block"
              :style="{
                width: `${page.width * scale}px`,
                height: `${page.height * scale}px`,
              }"
            />
          </div>
        </template>
      </div>

      <!-- Page counter + zoom -->
      <div
        v-if="pages.length"
        class="flex items-center justify-center gap-2 border-t border-white/10 bg-black/40 px-3 py-2 text-xs text-white/70"
      >
        <button
          type="button"
          class="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 hover:cursor-pointer hover:bg-white/20"
          aria-label="Zoom out"
          @click="zoomBy(1 / 1.2)"
        >
          −
        </button>
        <span class="min-w-24 text-center tabular-nums">
          {{ currentPage }} / {{ pages.length }}
        </span>
        <button
          type="button"
          class="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 hover:cursor-pointer hover:bg-white/20"
          aria-label="Zoom in"
          @click="zoomBy(1.2)"
        >
          +
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* The indeterminate sweep, for the two moments with no percentage to show: a
   response that arrived without a Content-Length, and the page-measuring
   phase. Transform-only, so it never triggers layout. */
@keyframes pdf-progress-sweep {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(300%);
  }
}

.pdf-progress-sweep {
  animation: pdf-progress-sweep 1.1s ease-in-out infinite;
}

@media (prefers-reduced-motion: reduce) {
  .pdf-progress-sweep {
    width: 100%;
    opacity: 0.4;
    animation: none;
  }
}
</style>
