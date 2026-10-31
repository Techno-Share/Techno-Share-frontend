<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import type { PreviewableFile } from '@/types/documents.types'
import PdfViewer from '@/components/documents/PdfViewer.vue'
import * as documentsApi from '@/services/documents.api'
import { isInlinePreviewable } from '@/utils/format'

// Fullscreen in-app viewer for a single file. Handles three kinds inline:
//  - images        → <img> with zoom, pan and rotate
//  - pdf           → PdfViewer (pdf.js) — our own canvas renderer, so the file
//                    gets a page-thumbnail rail instead of the browser's toolbar
//  - office docs   → only if the row carries a PDF rendition
//                    (file.preview_url). Those exist on documents uploaded
//                    before the LibreOffice conversion was removed from the
//                    API; everything newer has none and is offered as a
//                    download instead. There is deliberately no fallback to
//                    Microsoft's Office Online viewer — it needs a publicly
//                    fetchable URL, the bucket is private, and a URL that DID
//                    work would be a signed key handed to a third party.
// Anything else isn't previewable; the parent downloads it instead.
const props = defineProps<{
  modelValue: boolean
  file: PreviewableFile | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  download: [file: PreviewableFile]
}>()

const { t } = useI18n({ useScope: 'global' })

/**
 * A URL minted when this modal opens, not when the list was fetched.
 *
 * The URLs on the row are presigned with a short TTL — five minutes by default
 * — and signed once, when the page loaded. Anything opened after that window
 * gets `403 Request has expired`, which renders as a blank viewer with nothing
 * in the console to explain it. A page left open on a second screen fails
 * every time.
 *
 * So the modal asks the API for a fresh one. That also re-authorises: the
 * endpoint checks the viewer against the upload's audience, status and hidden
 * state before it signs anything, so a link cannot outlive the permission that
 * produced it.
 */
const freshUrl = ref('')
const loadingUrl = ref(false)
const urlError = ref(false)

watch(
  () => [props.modelValue, props.file?.id] as const,
  async ([open, id]) => {
    freshUrl.value = ''
    urlError.value = false
    if (!open || !id) return

    /**
     * Refuse to open for something that cannot be rendered.
     *
     * Every caller already chooses between previewing and downloading with
     * the same helper, but this modal has four of them and a fifth that
     * forgot would show an empty frame. Downloading and closing is the
     * outcome the click wanted either way.
     */
    if (!isInlinePreviewable(props.file)) {
      emit('download', props.file!)
      close()
      return
    }

    loadingUrl.value = true
    try {
      const { url } = await documentsApi.fileAccessUrl(id, 'preview')
      freshUrl.value = url
    } catch {
      // Falls back to the list's URL below, which may still be valid if the
      // page was loaded moments ago.
      urlError.value = true
    } finally {
      loadingUrl.value = false
    }
  },
  { immediate: true },
)

function ext(name: string | null | undefined): string {
  return (name ?? '').split('.').pop()?.toLowerCase() ?? ''
}

const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg']
const OFFICE_EXTS = ['ppt', 'pptx', 'doc', 'docx', 'xls', 'xlsx']

const kind = computed<'image' | 'pdf' | 'office' | 'none'>(() => {
  const e = ext(props.file?.original_name)
  if (IMAGE_EXTS.includes(e)) return 'image'
  if (e === 'pdf') return 'pdf'
  if (OFFICE_EXTS.includes(e)) return 'office'
  return 'none'
})

/**
 * Whether this office file has a server-generated PDF rendition.
 *
 * Uploads no longer produce one — the LibreOffice conversion was removed from
 * the API — so this is true only for documents uploaded before that change.
 * Those keep previewing; everything newer is offered as a download.
 *
 * There is deliberately no fallback to Microsoft's Office Online viewer. It
 * needs a publicly fetchable URL and the documents bucket is private, so it
 * could only ever show an error — and handing it a URL that DID work would
 * mean sending a signed, time-limited key to a third party.
 */
const hasRendition = computed(() => !!props.file?.preview_url)

// Hides the built-in PDF chrome (filename, page box, zoom, download, print) —
// the modal's own top bar already offers those. Chromium honours these; other
// engines ignore them harmlessly.
function withoutPdfToolbar(url: string) {
  return `${url}#toolbar=0&navpanes=0&statusbar=0`
}

/** What the embedded viewer loads: a PDF gets the chrome stripped. */
const embedSrc = computed(() => {
  if (!props.file) return ''
  if (kind.value === 'pdf') {
    return withoutPdfToolbar(freshUrl.value || props.file.file_url || '')
  }
  // An office file is only embeddable when a rendition exists. Without one the
  // signed URL points at the .docx itself, and handing that to a PDF viewer
  // renders a parse error where a document should be.
  if (!hasRendition.value) return ''
  if (freshUrl.value) return withoutPdfToolbar(freshUrl.value)
  return withoutPdfToolbar(props.file.preview_url ?? '')
})

/** What a "open in a new tab" link should point at for the current file. */
const externalSrc = computed(() => freshUrl.value || (props.file?.file_url ?? ''))

const title = computed(() => props.file?.original_name?.trim() || 'Preview')

// ── Image viewport ─────────────────────────────────────────────────────────
// Zoom is applied as a CSS transform on the <img>: no re-decode, and panning is
// just a translation. The PDF kinds keep the browser's own viewer controls.
const MIN_ZOOM = 0.25
const MAX_ZOOM = 6
const zoom = ref(1)
const rotation = ref(0)
const offset = ref({ x: 0, y: 0 })
const isPanning = ref(false)
let panStart = { x: 0, y: 0, offsetX: 0, offsetY: 0 }

const imageStyle = computed(() => ({
  transform: `translate(${offset.value.x}px, ${offset.value.y}px) scale(${zoom.value}) rotate(${rotation.value}deg)`,
  cursor: zoom.value > 1 ? (isPanning.value ? 'grabbing' : 'grab') : 'zoom-in',
}))

function resetView() {
  zoom.value = 1
  rotation.value = 0
  offset.value = { x: 0, y: 0 }
}

function setZoom(next: number) {
  zoom.value = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(next.toFixed(2))))
  // Back at fit, recentre — otherwise the image can sit off-screen.
  if (zoom.value === 1) offset.value = { x: 0, y: 0 }
}

function zoomBy(factor: number) {
  setZoom(zoom.value * factor)
}

function rotate() {
  rotation.value = (rotation.value + 90) % 360
}

function onWheel(event: WheelEvent) {
  if (kind.value !== 'image') return
  event.preventDefault()
  zoomBy(event.deltaY < 0 ? 1.15 : 1 / 1.15)
}

function onDoubleClick() {
  if (zoom.value > 1) resetView()
  else setZoom(2)
}

function startPan(event: MouseEvent) {
  if (zoom.value <= 1) return
  isPanning.value = true
  panStart = {
    x: event.clientX,
    y: event.clientY,
    offsetX: offset.value.x,
    offsetY: offset.value.y,
  }
}

function onPan(event: MouseEvent) {
  if (!isPanning.value) return
  offset.value = {
    x: panStart.offsetX + (event.clientX - panStart.x),
    y: panStart.offsetY + (event.clientY - panStart.y),
  }
}

function endPan() {
  isPanning.value = false
}

function close() {
  emit('update:modelValue', false)
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    close()
    return
  }
  if (kind.value !== 'image') return
  if (e.key === '+' || e.key === '=') zoomBy(1.2)
  else if (e.key === '-') zoomBy(1 / 1.2)
  else if (e.key === '0') resetView()
  else if (e.key.toLowerCase() === 'r') rotate()
}

// A fresh file (or a fresh open) starts at fit, not at the last zoom.
watch(() => props.file, resetView)
watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      resetView()
      window.addEventListener('keydown', handleKeydown)
    } else {
      window.removeEventListener('keydown', handleKeydown)
    }
  },
)

onBeforeUnmount(() => window.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <Teleport to="body">
    <div
      v-if="modelValue && file"
      class="fixed inset-0 z-60 flex flex-col bg-black/90"
      @click.self="close"
      @mousemove="onPan"
      @mouseup="endPan"
      @mouseleave="endPan"
    >
      <!-- Top bar. The controls keep their size and the filename takes what
           is left: min-w-0 lets the span shrink below its text, which a flex
           item will not do on its own, so on a phone the name truncates
           instead of pushing Open and Download off the edge. -->
      <div class="flex items-center gap-2 px-3 py-3 text-white sm:gap-3 sm:px-4">
        <span class="min-w-0 flex-1 truncate text-sm font-medium">{{ title }}</span>

        <!-- Image controls -->
        <div v-if="kind === 'image'" class="ml-auto flex items-center gap-1">
          <button
            class="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20 hover:cursor-pointer disabled:opacity-40"
            :disabled="zoom <= 0.25"
            aria-label="Zoom out"
            @click="zoomBy(1 / 1.2)"
          >
            <svg
              class="h-5 w-5"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14" />
            </svg>
          </button>
          <button
            class="min-w-14 rounded-full bg-white/10 px-2 py-1.5 text-xs font-medium transition-colors hover:bg-white/20 hover:cursor-pointer"
            :aria-label="`Zoom ${Math.round(zoom * 100)}%, click to reset`"
            @click="resetView"
          >
            {{ Math.round(zoom * 100) }}%
          </button>
          <button
            class="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20 hover:cursor-pointer disabled:opacity-40"
            :disabled="zoom >= 6"
            aria-label="Zoom in"
            @click="zoomBy(1.2)"
          >
            <svg
              class="h-5 w-5"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 5v14M5 12h14" />
            </svg>
          </button>
          <button
            class="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20 hover:cursor-pointer"
            aria-label="Rotate"
            @click="rotate"
          >
            <svg
              class="h-5 w-5"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M20 20v-5h-5M20 15a8 8 0 10-2.3 4.6"
              />
            </svg>
          </button>
        </div>

        <div class="flex items-center gap-2" :class="kind === 'image' ? '' : 'ml-auto'">
          <!-- The browser's own viewer is the best fallback when an embedded
               one can't render (iOS Safari won't show PDFs inline). -->
          <a
            :href="externalSrc"
            target="_blank"
            rel="noopener"
            class="flex h-9 shrink-0 items-center justify-center gap-2 rounded-full bg-white/10 text-sm transition-colors hover:bg-white/20 max-sm:w-9 sm:px-3"
          >
            <svg
              class="h-4 w-4"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M14 3h7v7m0-7L10 14M19 14v5a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h5"
              />
            </svg>
            <span class="max-sm:sr-only">
              {{ t('document.documentDetailsPage.preview') }}
            </span>
          </a>
          <button
            class="flex h-9 shrink-0 items-center justify-center gap-2 rounded-full bg-white/10 text-sm transition-colors hover:bg-white/20 hover:cursor-pointer max-sm:w-9 sm:px-3"
            @click="emit('download', file)"
          >
            <svg
              class="h-4 w-4"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3"
              />
            </svg>
            <span class="max-sm:sr-only">
              {{ t('document.documentDetailsPage.download') }}
            </span>
          </button>
          <button
            class="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 hover:cursor-pointer"
            aria-label="Close"
            @click="close"
          >
            <svg
              class="h-5 w-5"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <!-- Body -->
      <div
        class="flex flex-1 items-center justify-center overflow-hidden p-2 sm:p-4"
        @wheel="onWheel"
      >
        <img
          v-if="kind === 'image'"
          :src="file.file_url ?? ''"
          :alt="title"
          draggable="false"
          class="max-h-full max-w-full select-none object-contain transition-transform duration-100"
          :style="imageStyle"
          @click.stop
          @dblclick="onDoubleClick"
          @mousedown.prevent="startPan"
        />

        <!-- <object>, not <iframe>: when a browser can't display the PDF it
             renders the children instead, so the fallback shows itself. -->
        <PdfViewer v-else-if="(kind === 'pdf' || kind === 'office') && embedSrc" :src="embedSrc" />

        <object
          v-else-if="kind === 'pdf' || kind === 'office'"
          :data="embedSrc"
          type="application/pdf"
          class="h-full w-full rounded-lg bg-white"
          @click.stop
        >
          <div
            class="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center"
          >
            <p class="text-sm text-gray-600">{{ title }}</p>
            <a
              :href="externalSrc"
              target="_blank"
              rel="noopener"
              class="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white"
            >
              {{ t('document.documentDetailsPage.preview') }}
            </a>
          </div>
        </object>
      </div>

      <!-- Hint, images only -->
      <p v-if="kind === 'image'" class="pb-3 text-center text-xs text-white/50">
        {{ t('document.documentDetailsPage.viewerHint') }}
      </p>
    </div>
  </Teleport>
</template>
