/**
 * Shapes returned by the /admin endpoints.
 *
 * These are bespoke payloads assembled in AdminService, not entities — the
 * backend picks specific fields per screen. Written out here because the admin
 * views previously held them as `ref<any[]>`, which meant a renamed field
 * produced a blank column at runtime instead of a build error.
 *
 * Derived from admin.service.ts. If a payload there changes, change it here
 * too — a mismatch is the one thing this file cannot catch on its own.
 */

/** A department, as every admin payload embeds it. */
export interface AdminMajorRef {
  id: string
  acronym: string
}

/** A person, as every admin payload embeds them. */
export interface AdminUserRef {
  id: string
  first_name: string
  last_name: string
}

/** GET /admin/users */
export interface AdminUser {
  id: string
  first_name: string
  last_name: string
  email: string
  role: string
  year_level: number | null
  created_at: string
  /** Profile photo, null when the account has never set one. */
  avatar_url: string | null
  majors: AdminMajorRef | null
  banned_at: string | null
  ban_reason: string | null
  /** Departments this user moderates; empty for an ordinary account. */
  moderates: AdminMajorRef[]
}

/** One file inside an admin document payload. */
export interface AdminDocumentFile {
  id: string
  upload_id?: string
  original_name: string | null
  file_size_kb: number | null
  file_url: string | null
  preview_url: string | null
  /** The FILE's own review state, distinct from its upload's. */
  file_status?: string
  hidden_at?: string | null
}

/** GET /admin/documents — one published submission. */
export interface AdminDocument {
  id: string
  title: string
  doc_type: string
  uploaded_at: string
  /**
   * The REVIEW state, and only ever 'active' or 'rejected' here — a pending
   * upload belongs to the Approvals queue and getAllDocuments refuses to list
   * one. Hidden and expired are separate facts; see `hidden_at`/`expires_at`
   * and docDisplayStatus, which folds all four into the one Status column.
   */
  status: 'active' | 'rejected'
  /** Set when the uploader withdrew it from circulation. */
  hidden_at: string | null
  /** Why it was turned down; null unless rejected. */
  rejection_reason: string | null
  description: string | null
  year_level: number | null
  users: AdminUserRef | null
  /** Who approved it. Null if approved before reviewers were recorded, or if
   *  that account has since been deleted. */
  approved_by: AdminUserRef | null
  majors: AdminMajorRef | null
  /** Which academic year the material belongs to, e.g. "2025-2026". */
  academic_year: string | null
  /** Who may see it, as (department, year) pairs. Empty means everyone. */
  audience: { major_id: string; year_level: number }[]
  /** Soft expiry (ISO). Null = never. */
  expires_at: string | null
  subjects: { id: string; name: string } | null
  documents: AdminDocumentFile[]
}

/**
 * GET /admin/pending/documents — ONE ROW PER FILE.
 *
 * flattenUpload spreads the upload's metadata into every file it contains, so
 * a submission with three files arrives as three rows sharing a `group_id`.
 * The review screens group by that id. This is why the file fields sit at the
 * top level rather than inside a `documents` array.
 */
export interface AdminPendingDocument {
  /** The FILE's id. The submission's is `group_id`. */
  id: string
  file_url: string | null
  preview_url: string | null
  original_name: string | null
  file_size_kb: number | null
  /** The FILE's own review state, distinct from the upload's `status`.
   *  Same three values — the column is `text` with a CHECK constraint. */
  file_status: 'pending' | 'active' | 'rejected'

  group_id: string
  title: string
  doc_type: string
  uploaded_at: string
  users: AdminUserRef | null
  majors: AdminMajorRef | null
  year_level: number | null
  academic_year: string | null
  /** Who may see it, as (department, year) pairs. Empty means everyone. */
  audience: { major_id: string; year_level: number }[]
  expires_at: string | null
  subjects: { id: string; name: string; acronym: string | null } | null
  /** 'group' for a whole pending upload, 'file' for files added to one already
   *  approved. Decides which endpoint the queue calls. */
  review_scope: 'group' | 'file'
  status?: string
}
