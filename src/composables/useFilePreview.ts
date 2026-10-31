import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import * as documentsApi from '@/services/documents.api'
import { isInlinePreviewable } from '@/utils/format'
import { useToast } from '@/composables/useToast'
import type { PreviewableFile } from '@/types/documents.types'

/**
 * Opening and downloading a document file, for any view that lists them.
 *
 * Four views had their own copy and had drifted into three behaviours. The
 * drift mattered more than the repetition: a download fails whenever the
 * viewer's access was revoked between render and click — the audience changed,
 * the file was hidden, the upload was rejected — and only one of the four
 * copies caught that. The rest left an unhandled rejection and a dead button.
 *
 * An anchor rather than `window.open`, because the signed URL is cross-origin:
 * the `download` attribute is only advisory and the filename comes from the
 * `Content-Disposition` the API signs in either way. The anchor just avoids a
 * tab opening and closing behind the page.
 */
export function useFilePreview() {
  const { t } = useI18n({ useScope: 'global' })
  const { showToast } = useToast()

  /** Whether the preview modal is open. Bind with `v-model`. */
  const previewOpen = ref(false)
  /** The file the modal is showing. */
  const previewTarget = ref<PreviewableFile | null>(null)

  /**
   * Fetch a fresh authorised URL and save the file.
   *
   * Always re-signed at click time: the URL embedded in a list row was signed
   * when the page loaded and is dead within minutes, and this endpoint
   * re-authorises the caller before it signs anything.
   */
  async function downloadFile(file: PreviewableFile) {
    try {
      const { url } = await documentsApi.fileAccessUrl(file.id, 'download')
      const a = document.createElement('a')
      a.href = url
      a.download = file.original_name?.trim() || 'file'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch {
      // A refusal here means the file is no longer visible to this viewer.
      // There is nothing to retry, so say so rather than failing silently.
      showToast(t('document.documentDetailsPage.downloadFailed'), { type: 'error' })
    }
  }

  /**
   * Open the viewer, or download when there is nothing to render.
   *
   * Archives, and office files with no PDF rendition, have no in-browser
   * view — going straight to the download is what the click wanted anyway.
   */
  function openPreview(file: PreviewableFile) {
    if (!isInlinePreviewable(file)) {
      void downloadFile(file)
      return
    }
    previewTarget.value = file
    previewOpen.value = true
  }

  return { previewOpen, previewTarget, openPreview, downloadFile }
}
