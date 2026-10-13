// API response shapes, not raw TypeORM entities — the backend reshapes rows
// before sending them. Nullability mirrors the database exactly.

import type { MajorRef } from '@/types/major.types'

/**
 * Enforced by a CHECK constraint on `subjects.status`.
 *
 * Only 'active' is ever written now — subjects have no review, so one is live
 * the moment its department's moderator creates it. 'pending' survives for
 * rows left mid-review when that was removed; the constraint still permits
 * 'rejected' too, but nothing can produce it.
 */
export type SubjectStatus = 'pending' | 'active'

export interface SubjectRef {
  id: string
  name: string
  /** Short display code — initials of `name`, uppercased. */
  acronym: string
  /** Null for subjects recorded without one. */
  semester: number | null
}

/**
 * `GET /subjects` — a partial row. The query selects only these six columns,
 * so `status`, `major_id` and the timestamps are genuinely absent, not just
 * unread.
 */
export interface Subject {
  id: string
  name: string
  /** Short display code — initials of `name`, uppercased. */
  acronym: string
  year_level: number
  semester: number | null
  subject_url: string | null
}

/**
 * `GET /subjects/mine` — the caller's own leftover submissions.
 *
 * Returns only rows still marked 'pending', which no longer happens: these are
 * subjects that were awaiting review when review was removed.
 */
export interface MySubject extends Subject {
  status: SubjectStatus
  created_at: string
  majors: MajorRef | null
}
