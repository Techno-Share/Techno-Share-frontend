import { computed } from 'vue'
import { useRouter, type RouteLocationRaw } from 'vue-router'
import { useI18n } from 'vue-i18n'
import i18n from '@/i18n'
import { useNotificationsStore, type Notification } from '@/stores/notifications.store'
import { useSubjectsStore } from '@/stores/subjects.store'

/**
 * Where a notification leads, for the cases that can be decided on the spot.
 *
 * Exported so a toast can offer the same destination as the bell item without
 * duplicating the rules. The one case it cannot answer is an approved subject,
 * which needs a lookup to build its route — handleNotifClick does that before
 * falling back here, and the toast lands on the detail page instead, which
 * handles every ref type.
 */
export function notificationRoute(n: Notification): RouteLocationRaw {
  const detail: RouteLocationRaw = {
    name: 'notification-detail',
    query: {
      notif_id: n.id,
      ...(n.ref_id ? { ref_id: n.ref_id } : {}),
      ...(n.ref_type ? { ref_type: n.ref_type } : {}),
    },
  }

  if (n.ref_type === 'book_request') {
    // Someone wants one of your books — answered under Book Activity, which is
    // where a pending request now lives.
    if (n.type === 'book_request') return { name: 'dashboard-books-approve' }
    /**
     * Accepted: the handover is yours to finish. ref_id is the request id (see
     * books.service.ts), so `?request=` opens its progress panel directly
     * rather than dropping you on the grid to find it again.
     */
    if (n.type === 'book_accepted') {
      return {
        name: 'dashboard-books-requesting',
        ...(n.ref_id ? { query: { request: n.ref_id } } : {}),
      }
    }
    // Declined stays on the detail page — the reason exists nowhere else.
    return detail
  }

  /**
   * A reviewer's own queue. These are the only notifications that point INTO
   * the admin area, and they go straight to the thing needing a decision rather
   * than to the dashboard for the reader to find it again.
   */
  if (n.type === 'document_pending' && n.ref_id) {
    return { name: 'admin-review', params: { groupId: n.ref_id } }
  }
  // No subject_pending route: subjects have no review queue any more. Rows
  // written before that change fall through to the detail page, which still
  // renders them — removing the destination must not strand old notifications.

  /**
   * Anything about one of your own documents opens that document.
   *
   * Approvals went here and rejections did not, which put the two halves of the
   * same decision on different screens: approved took you to the document,
   * rejected to a page that restated the notification you had just read. The
   * document's own page carries the reason now, in the banner and the title
   * badge, and it is also where the problem can actually be dealt with — the
   * file replaced, or the submission deleted.
   *
   * `ref_id` is the UPLOAD id for file-level notifications too (see
   * AdminService.rejectFile), so a rejected added-file lands on the folder that
   * holds it rather than nowhere.
   */
  if (n.ref_type === 'document' && n.ref_id) {
    return { name: 'document-details', query: { upload_id: n.ref_id } }
  }

  return detail
}

/**
 * The notification's text in the reader's language.
 *
 * The server stores an English sentence AND the pieces to rebuild it. New rows
 * carry a key, so they follow the language toggle; rows written before that
 * only have the English, which is better than showing nothing.
 */
export function notificationMessage(n: Notification) {
  const key = n.i18n_key ? `notification.${n.i18n_key}` : ''
  // i18n.global, not useI18n(): a toast is raised from the store and from the
  // socket handler, neither of which is inside a component's setup.
  if (!key || !i18n.global.te(key)) return n.message
  return i18n.global.t(key, (n.i18n_params ?? {}) as Record<string, unknown>)
}

/** The same text, for templates. */
export function useNotificationText() {
  return notificationMessage
}

// Shared notification logic used by both the desktop bell dropdown and the
// mobile full-page list (grouping, relative time, icon, click routing).
export function useNotifications() {
  const router = useRouter()
  const { t } = useI18n({ useScope: 'global' })
  const notifStore = useNotificationsStore()
  const subjectsStore = useSubjectsStore()

  function toUtc(dateStr: string) {
    return dateStr.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(dateStr) ? dateStr : dateStr + 'Z'
  }

  function timeAgo(dateStr: string) {
    const utc = toUtc(dateStr)
    const diff = Math.floor((Date.now() - new Date(utc).getTime()) / 1000)
    if (diff < 60) return t('common.notifications.justNow')
    if (diff < 3600) return t('common.notifications.minutesAgo', { n: Math.floor(diff / 60) })
    if (diff < 86400) return t('common.notifications.hoursAgo', { n: Math.floor(diff / 3600) })
    if (diff < 259200) return t('common.notifications.daysAgo', { n: Math.floor(diff / 86400) })
    return new Date(utc).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  }

  const groupedNotifications = computed(() => {
    const now = new Date()
    const todayStr = now.toDateString()
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = yesterday.toDateString()

    const groups: { key: string; label: string; items: Notification[] }[] = []
    const keyMap: Record<string, number> = {}

    for (const n of notifStore.notifications) {
      const d = new Date(toUtc(n.created_at))
      const key = d.toDateString()

      let label: string
      if (key === todayStr) label = t('common.notifications.today')
      else if (key === yesterdayStr) label = t('common.notifications.yesterday')
      else label = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

      if (keyMap[key] === undefined) {
        keyMap[key] = groups.length
        groups.push({ key, label, items: [] })
      }
      groups[keyMap[key]]!.items.push(n)
    }

    return groups
  })

  // Marks read + routes to the right destination based on the notification.
  async function handleNotifClick(n: Notification) {
    if (!n.is_read) await notifStore.markRead(n.id)

    /**
     * An approved subject is the one destination notificationRoute cannot give:
     * the route needs the subject's department and year, which may not be
     * loaded yet. Resolve it here, and fall through if it cannot be found.
     */
    if (n.type.includes('approved') && n.ref_type === 'subject' && n.ref_id) {
      let subject = subjectsStore.mySubjects.find((s) => s.id === n.ref_id)
      if (!subject) {
        await subjectsStore.fetchMine()
        subject = subjectsStore.mySubjects.find((s) => s.id === n.ref_id)
      }
      if (subject) {
        await router.push({
          name: 'subject-documents',
          params: {
            slug: subject.majors?.acronym?.toLowerCase(),
            year: subject.year_level,
            subjectId: n.ref_id,
          },
        })
        return
      }
    }

    await router.push(notificationRoute(n))
  }

  async function markAllRead() {
    await notifStore.markAllRead()
  }

  return { notifStore, groupedNotifications, handleNotifClick, markAllRead, timeAgo }
}
