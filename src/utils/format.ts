export function formatRelativeDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const normalized = iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z'
  const date = new Date(normalized)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)

  if (diffSec < 60) return 'just now'
  if (diffMin < 60) return `${diffMin} min ago`
  if (diffHour < 24) return `${diffHour} hour${diffHour > 1 ? 's' : ''} ago`
  if (diffDay <= 3) return `${diffDay} day${diffDay > 1 ? 's' : ''} ago`

  return date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function formatFileSize(kb: number): string {
  if (kb < 1024) return `${kb} KB`
  return `${(kb / 1024).toFixed(1)} MB`
}

/** Lowercased file extension (without the dot), or '' when there's none. */
export function fileExtension(name: string | null | undefined): string {
  return (name ?? '').split('.').pop()?.toLowerCase() ?? ''
}

/** True for raster image files that can be shown directly in an <img>. */
export function isImageFile(name: string | null | undefined): boolean {
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(fileExtension(name))
}

/**
 * How a file type is drawn, everywhere it appears — one entry per family so a
 * colour is never spelled out twice.
 *
 *   solid — filled badge with a white label (file lists, notifications)
 *   soft  — tinted panel with a coloured glyph (upload cards)
 *
 * The classes are written in full because Tailwind scans source text: a
 * composed string like `bg-${colour}-500` would never make it into the build.
 */
export type FileTypeStyle = { label: string; solid: string; soft: string }

const FILE_TYPE_STYLES: Record<string, FileTypeStyle> = {
  pdf: { label: 'PDF', solid: 'bg-white', soft: 'bg-white text-red-500' },
  word: { label: 'DOC', solid: 'bg-white', soft: 'bg-white text-blue-500' },
  slides: { label: 'PPT', solid: 'bg-white', soft: 'bg-white text-orange-500' },
  image: { label: 'IMG', solid: 'bg-white', soft: 'bg-white text-green-600' },
  archive: { label: 'ZIP', solid: 'bg-white', soft: 'bg-white text-yellow-600' },
  sheet: { label: 'XLS', solid: 'bg-white', soft: 'bg-white text-teal-600' },
  other: { label: 'FILE', solid: 'bg-white', soft: 'bg-white text-gray-500' },
}

const FILE_TYPE_BY_EXTENSION: Record<string, keyof typeof FILE_TYPE_STYLES> = {
  pdf: 'pdf',
  doc: 'word',
  docx: 'word',
  ppt: 'slides',
  pptx: 'slides',
  xls: 'sheet',
  xlsx: 'sheet',
  jpg: 'image',
  jpeg: 'image',
  png: 'image',
  gif: 'image',
  webp: 'image',
  svg: 'image',
  zip: 'archive',
  rar: 'archive',
  '7z': 'archive',
}

/** Colours and short label for a file, by its extension. */
export function fileTypeStyle(name: string | null | undefined): FileTypeStyle {
  const family = FILE_TYPE_BY_EXTENSION[fileExtension(name)] ?? 'other'
  return FILE_TYPE_STYLES[family]!
}

/** Colored badge (background class + short label) for a file by its extension. */
export function getFileIcon(name: string | null | undefined): { bg: string; label: string } {
  const style = fileTypeStyle(name)
  return { bg: style.solid, label: style.label }
}

export function telegramHref(contact: string): string | null {
  const trimmed = contact.trim()
  if (trimmed.startsWith('@')) return `https://t.me/${trimmed.slice(1)}`
  const match = trimmed.match(/^(?:https?:\/\/)?t\.me\/(.+)$/i)
  return match ? `https://t.me/${match[1]}` : null
}

export function reqStatusBadge(status: string): string {
  if (status === 'accepted') return 'bg-green-100 text-green-700'
  if (status === 'declined') return 'bg-red-100 text-red-600'
  return 'bg-yellow-100 text-yellow-700'
}

/**
 * A person's name in title case, for display.
 *
 * Names are stored exactly as typed at sign-up, which is often all lowercase
 * ("pa roth"). Capitalising in CSS is not an option where the name sits inside
 * a translated sentence — `capitalize` would title-case the whole line.
 */
export function displayName(first?: string | null, last?: string | null): string {
  return [first, last]
    .filter(Boolean)
    .join(' ')
    .replace(/\S+/g, (word) => word[0]!.toUpperCase() + word.slice(1))
}

export function reqInitials(first?: string, last?: string): string {
  return ((first?.[0] ?? '') + (last?.[0] ?? '')).toUpperCase()
}

export function truncateText(text: string, maxChars = 120): string {
  return text.length > maxChars ? `${text.slice(0, maxChars).trimEnd()}…` : text
}

// Human-readable text — letters (any language, incl. Khmer marks), numbers,
// spaces, hyphens and underscores, with at least one letter/number.
//
// Underscores and hyphens are here because titles are usually typed from a file
// name: `hello_world` and `lab-report-2` are the normal shape of one, and
// rejecting them made the field fight the most common way it gets filled.
// Neither character means anything to a template or a query — the characters
// that do are refused separately by FORBIDDEN_TEXT_PATTERN.
export const TEXT_NAME_PATTERN = /^(?=.*[\p{L}\p{N}])[\p{L}\p{M}\p{N}\s_-]+$/u

// Strip disallowed characters (e.g. from an auto-filled file name) so the value
// passes TEXT_NAME_PATTERN without surprising the user with an instant error.
export function sanitizeTextName(raw: string): string {
  return raw
    .replace(/[^\p{L}\p{M}\p{N}\s_-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// A single tag — letters/numbers (any language) joined by single hyphens.
// No spaces and no special characters.

// Characters never allowed in free-text fields (template-injection chars).
export const FORBIDDEN_TEXT_PATTERN = /[${}]/

// ─── Academic level helpers ──────────────────────────────────────────────────
// Departments count in plain academic years. The Department of Foreign
// Languages (DFL) is the exception: every student takes its courses alongside
// their own department, so nobody registers into it, and its `year_level` slot
// holds the LANGUAGE rather than a year — 1 = English, 2 = French. The CEFR
// levels below that (A1, A2, B1, …) are ordinary subject rows.

export function isLanguageMajor(acronym?: string | null): boolean {
  return (acronym ?? '').toLowerCase() === 'dfl'
}

// Indexed by DFL's year_level (1-based).
const DFL_LANGUAGE_KEYS = [
  'common.departmentPage.languageEnglish',
  'common.departmentPage.languageFrench',
]

/**
 * i18n key naming what a major's `year_level` stands for, or null when it's a
 * plain academic year. Callers translate it; null means "use Year N".
 */
export function languageLabelKey(
  acronym: string | null | undefined,
  year: number | string,
): string | null {
  const n = Number(year)
  if (isLanguageMajor(acronym) && n >= 1 && n <= DFL_LANGUAGE_KEYS.length)
    return DFL_LANGUAGE_KEYS[n - 1]!
  return null
}

/**
 * The foundation programme — the first two years, before a student joins a
 * department. `TC` (Tronc Commun) is the current acronym; `FOUNDATION` is the
 * old one, still matched so an older database keeps behaving.
 *
 * Mirrors isFoundationMajor() in the backend's documents/utils/year-levels.ts.
 */
export function isFoundationMajor(acronym?: string | null): boolean {
  const a = (acronym ?? '').toLowerCase()
  return a === 'tc' || a === 'foundation'
}

/**
 * How a cohort is written at ITC: the year, then the department — "I3-GIC".
 *
 * Falls back to the acronym alone where a year would be misleading: DFL's
 * `year_level` holds a LANGUAGE rather than a year, so "I1-DFL" would read as a
 * first-year cohort that does not exist.
 */
export function yearMajorLabel(
  acronym?: string | null,
  yearLevel?: number | string | null,
): string {
  const code = (acronym ?? '').trim()
  if (!code) return '—'
  if (!yearLevel || isLanguageMajor(code)) return code
  return `I${yearLevel}-${code}`
}

/**
 * The values a major's `year_level` can take: the foundation programme covers
 * years 1–2, DFL holds its two languages, and every department major takes
 * students from year 3 onwards.
 */
export function yearLevelsForMajor(acronym?: string | null): number[] {
  const a = (acronym ?? '').toLowerCase()
  if (a === 'dfl') return [1, 2]
  if (isFoundationMajor(a)) return [1, 2]
  return [3, 4, 5]
}

/**
 * "I3-GIC, I4-GIC" — who an upload is visible to, from its stored audience.
 *
 * An empty list is the "Everyone" choice, which is also what a language course
 * always stores. A pair whose department is not in `majors` falls back to the
 * bare year rather than printing a raw uuid.
 */
export function audienceLabel(
  audience: { major_id: string; year_level: number }[] | null | undefined,
  majors: { id: string; acronym: string }[],
  everyone = 'Everyone',
): string {
  if (!audience?.length) return everyone
  return audience
    .map((entry) => {
      const acronym = majors.find((m) => m.id === entry.major_id)?.acronym
      return acronym ? yearMajorLabel(acronym, entry.year_level) : `Year ${entry.year_level}`
    })
    .join(', ')
}

/**
 * True when the pairs picked already cover every department and year on offer.
 *
 * Ticking all of them one by one is the same answer as "Everyone", and the
 * upload forms collapse it to that: 35 chips say nothing 1 chip doesn't, and
 * the server stores an unrestricted upload as no pairs at all.
 *
 * An empty department list returns false, not true. `every` on an empty array
 * is vacuously true, which would read "everything is covered" while the majors
 * are still loading and collapse a selection the user never made.
 */
export function coversEveryAudiencePair(
  picked: { major_id: string; year_level: number }[],
  departments: { id: string; years: { value: number }[] }[],
): boolean {
  if (!departments.length) return false
  const chosen = new Set(picked.map((p) => `${p.major_id}:${p.year_level}`))
  return departments.every((d) => d.years.every((y) => chosen.has(`${d.id}:${y.value}`)))
}

/**
 * Whether an upload's soft expiry has passed.
 *
 * Deliberately not a status value. `expires_at` is a date and the row stays
 * 'active' in the database — which is what keeps the upload visible to its
 * owner on their dashboard after it has dropped out of everyone else's feed.
 * Turning it into a stored status would need a job to flip rows and would
 * break the server's visibility rules, which key off 'active'.
 *
 * Shared so the card and the list row cannot drift: two places rendering the
 * same badge from two copies of the comparison is how one of them ends up
 * off by a timezone.
 */
export function isExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false
  const at = Date.parse(expiresAt)
  return Number.isFinite(at) && at <= Date.now()
}

/** What is wrong with a name, or null when nothing is. */
export type NameProblem = 'spaces' | 'invalid' | 'lowercase' | null

/**
 * The rule for a first or last name, in one place.
 *
 * Registration and the profile editor both enforce it, and they used to hold
 * two copies of the pattern with a comment on one saying it had to match the
 * other — which is a drift waiting to happen rather than a rule.
 *
 * Returns which rule was broken rather than a message, because the two callers
 * live in different i18n namespaces and would otherwise have to share message
 * keys they do not share anything else with.
 *
 * ── On the capital letter ────────────────────────────────────────────────
 * Only checked for Latin script. Khmer has no letter case at all, so a name
 * written in Khmer has no capital to start with, and demanding one would make
 * it impossible to register under your own name in your own language. A Khmer
 * first character therefore passes this check rather than failing it.
 */
export function checkName(raw: string): NameProblem {
  // Surrounding whitespace is stripped before the rule is applied — " Dara "
  // is a typo, not a violation. Anything left is an internal space.
  const value = raw.trim()

  if (/\s/.test(value)) return 'spaces'
  if (!/^[A-Za-zក-៿]+$/.test(value)) return 'invalid'
  // Latin lower-case start. Any other first character — upper-case Latin or
  // Khmer — is fine by the note above.
  if (/^[a-z]/.test(value)) return 'lowercase'

  return null
}

/**
 * An expiry written out in full, for display: "Sun, 11 Oct 2026, 11:59 PM".
 *
 * Expiry carries a time now, and a date alone cannot say whether something
 * disappears at breakfast or at midnight — which matters most on the day it
 * happens. The weekday is there because "11 Oct" tells you less than "Sunday"
 * when you are deciding how long to leave something up.
 *
 * Locale-driven: the reader's own conventions decide 11:59 PM vs 23:59 and the
 * month's name. Shared so the upload form, the review queue and the document
 * page cannot drift into three different renderings of one timestamp.
 */
export function formatExpiry(iso: string | null | undefined): string | null {
  if (!iso) return null
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return null
  return at.toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** Local 'YYYY-MM-DD' and 'HH:mm' for an ISO instant — the two form inputs. */
export function isoToDateAndTime(iso: string | null | undefined): {
  date: string
  time: string
} {
  if (!iso) return { date: '', time: '' }
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return { date: '', time: '' }
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  }
}

/**
 * The two expiry inputs back into an ISO instant, or null for "never".
 *
 * An empty time means end of day — the old date-only behaviour, kept so a
 * document chosen to expire "on the 11th" still lasts through the 11th.
 */
export function dateAndTimeToIso(date: string, time: string): string | null {
  if (!date) return null
  const at = new Date(`${date}T${time || '23:59'}:00`)
  return Number.isNaN(at.getTime()) ? null : at.toISOString()
}
