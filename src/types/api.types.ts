// Shapes returned by the API, not the raw TypeORM entities.
//
// The backend reshapes uploads before sending them (`toFeedShape` in
// documents.service.ts), keeping the nested `users` / `majors` / `subjects`
// keys the frontend has read since the Supabase days. Mirror that shape here,
// including nullability — a field that is `| null` in the database is `| null`
// here, so the compiler makes us handle it at the point of use.

/**
 * A paginated list response. `total` is the full filtered count — every row
 * matching the search and filters, not just the ones on this page — so a pager
 * can derive its page count without a second request.
 *
 * The admin list endpoints (`/admin/users`, `/admin/documents`,
 * `/admin/subjects`) always paginate: omitting `limit` yields the server's
 * default page, never the whole table.
 */
export interface Paginated<T> {
  items: T[]
  total: number
  page: number
  limit: number
}
