// API response shapes, not raw TypeORM entities — the backend reshapes rows
// before sending them. Nullability mirrors the database exactly.

import type { UserRef } from '@/types/user.types'
import type { MajorRef } from '@/types/major.types'
import type { SubjectRef } from '@/types/subjects.types'

/** Enforced by a CHECK constraint on `uploads.status`. */
export type UploadStatus = 'pending' | 'active' | 'rejected'

/** A single file inside an upload, as returned by the feed and detail endpoints. */
/**
 * The subset a preview needs: what to call it, and where to fetch it.
 *
 * Narrower than UploadFile on purpose. The admin tables carry file rows that
 * have no review state of their own, and requiring `status` there would mean
 * inventing a value to satisfy a type rather than to describe the data.
 *
 * `file_url` is nullable because the API signs it from a storage ref, and a row
 * written before the ref existed has nothing to sign.
 */
export interface PreviewableFile {
  id: string
  original_name: string | null
  file_url: string | null
  preview_url: string | null
}

export interface UploadFile {
  id: string
  file_url: string
  /**
   * PDF rendition of an office file (pptx/docx/xlsx), generated on upload for
   * in-browser preview. Null for files needing none (pdf/images) or when
   * server-side conversion was unavailable.
   */
  preview_url: string | null
  /** Null on legacy rows written before the size was recorded. */
  file_size_kb: number | null
  original_name: string | null
  /**
   * Review state of this file on its own. A file added to an upload that was
   * already approved is 'pending' until a moderator clears it — the upload
   * stays in the feed, only the file is hidden.
   *
   * Always 'active' in the feed and for anyone but the uploader/admins, who are
   * the only ones served a non-active file.
   */
  status: UploadStatus
  /** Why a moderator turned this file down. Only ever set when rejected. */
  rejection_reason: string | null
  /**
   * Non-null when the uploader has hidden this file. Hiding the last visible
   * file also hides its upload; only the uploader and admins are served one.
   */
  hidden_at: string | null
  /**
   * When this file was attached — its own date, not its upload's. Optional
   * because rows written before AddDocumentCreatedAt reached older clients
   * without it; the UI falls back to the upload's date.
   */
  created_at?: string | null
}

/** `GET /documents/mine` omits `file_url` — the dashboard only lists names and sizes. */
export type MyUploadFile = Omit<UploadFile, 'file_url'>

/** One department + year that may see an upload. */
export interface AudienceEntry {
  major_id: string
  year_level: number
}

/**
 * An upload as returned by `GET /documents` (feed) and `GET /documents/:id`.
 * Both go through `toFeedShape`, so they share one type.
 */
export interface Upload {
  id: string
  title: string
  /** Optional free-text description (replaced tags). */
  description: string | null
  doc_type: string
  year_level: number
  academic_year: string | null
  /** Audience restriction (multi-select). Empty array = no restriction on that axis. */
  audience: AudienceEntry[]
  /** Soft expiry (ISO). null = never. Once past, hidden from all but the uploader/admins. */
  expires_at: string | null
  uploaded_at: string
  /**
   * Review state. Always 'active' in the public feed, which filters on it —
   * meaningful only when listing your own uploads with ?status=…
   */
  status: UploadStatus
  /** Non-null when the uploader has hidden it — only they and admins see it. */
  hidden_at: string | null
  /**
   * Non-null when the uploader pinned it. Sorts their own dashboard list only;
   * the public feed ignores it.
   */
  pinned_at: string | null
  users: UserRef | null
  majors: MajorRef | null
  subjects: SubjectRef | null
  documents: UploadFile[]
}

/**
 * An upload as returned by `GET /documents/mine`. Distinct from `Upload`: it
 * carries moderation fields the public feed never exposes, and its nested
 * `subjects` has no acronym and its `documents` have no `file_url`.
 */
export interface MyUpload {
  id: string
  title: string
  description: string | null
  doc_type: string
  year_level: number
  academic_year: string | null
  /** Never 'active': `findMine` filters to pending|rejected in SQL. */
  status: Exclude<UploadStatus, 'active'>
  rejection_reason: string | null
  rejected_at: string | null
  uploaded_at: string
  /** Carried for the dashboard's edit form, which writes these back. */
  audience: AudienceEntry[]
  expires_at: string | null
  subjects: Omit<SubjectRef, 'acronym'> | null
  majors: MajorRef | null
  documents: MyUploadFile[]
}

/** `GET /documents/stats` — aggregated server-side. */
export interface DocumentStats {
  total: number
  size_kb: number
}
