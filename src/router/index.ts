import { createRouter, createWebHistory, type RouteLocationNormalized } from 'vue-router'
import { useAuthStore } from '@/stores/auth.store'

const routes = [
  /**
   * The department-and-year gate.
   *
   * Deliberately outside UserLayout: the navbar would offer links the guard
   * below immediately bounces back here, which reads as the app being broken.
   * A student at this page has exactly one thing to do.
   */
  {
    path: '/welcome',
    name: 'welcome',
    component: () => import('@/views/auth/WelcomeView.vue'),
    meta: { requiresAuth: true },
  },
  // ── Main layout ───────────────────────────────────────────────────────────
  {
    path: '/',
    component: () => import('@/layouts/UserLayout.vue'),
    children: [
      {
        path: '',
        name: 'home',
        component: () => import('@/views/HomeView.vue'),
      },
      {
        path: 'documents',
        name: 'documents',
        component: () => import('@/views/documents/DocumentInNavView.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'documents/details',
        name: 'document-details',
        component: () => import('@/views/documents/DocumentDetailsView.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'notifications',
        name: 'notifications',
        component: () => import('@/views/notifications/NotificationsView.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'notifications/detail',
        name: 'notification-detail',
        component: () => import('@/views/notifications/NotificationDetailView.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'books',
        name: 'books',
        component: () => import('@/views/books/BookView.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'books/:id',
        name: 'book-detail',
        component: () => import('@/views/books/BookDetailView.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'dashboard',
        component: () => import('@/views/dashboard/DashboardView.vue'),
        meta: { requiresAuth: true },
        children: [
          {
            path: '',
            name: 'dashboard',
            component: () => import('@/views/dashboard/DashboardActivityView.vue'),
          },
          {
            path: 'documents',
            name: 'dashboard-documents',
            component: () => import('@/views/dashboard/DashboardDocumentsView.vue'),
          },
          // Two book views, two paths. The list they show is a different thing,
          // not a filter of the same thing, so it belongs in the path — leaving
          // ?status= for what is genuinely a filter.
          {
            path: 'books',
            name: 'dashboard-books',
            component: () => import('@/views/dashboard/DashboardBooksView.vue'),
          },
          // Book Activity's two halves: requests others have made of you, and
          // the ones you have made of them. Separate paths for the same reason
          // as above — different lists, not a filter of one.
          {
            path: 'books/approve',
            name: 'dashboard-books-approve',
            component: () => import('@/views/dashboard/DashboardBooksView.vue'),
          },
          {
            path: 'books/reserved',
            name: 'dashboard-books-reserved',
            component: () => import('@/views/dashboard/DashboardBooksView.vue'),
          },
          /**
           * The review queue, for admins and department moderators.
           *
           * Its own page rather than a doorway into the admin dashboard: a
           * moderator is an ordinary student who also reviews, and that screen
           * is headed "Admin Panel" and full of tabs they cannot open. What
           * they may review is still decided entirely by the server.
           */
          {
            path: 'review/documents',
            name: 'dashboard-review-documents',
            component: () => import('@/views/dashboard/DashboardReviewView.vue'),
            meta: { requiresReviewer: true },
          },
          {
            // One submission's files. A child of the dashboard so the sidebar
            // and the phone's tab bar stay put while a reviewer looks through
            // a folder. Same guard as the queue it is reached from — the
            // server re-checks the department either way.
            path: 'review/documents/:groupId',
            name: 'dashboard-review-files',
            component: () => import('@/views/dashboard/ReviewFilesView.vue'),
            meta: { requiresReviewer: true },
          },
          // The bare path kept as a redirect: anything already pointing at
          // /dashboard/review still lands somewhere useful.
          { path: 'review', redirect: { name: 'dashboard-review-documents' } },
          {
            path: 'books/requesting',
            name: 'dashboard-books-requesting',
            component: () => import('@/views/dashboard/DashboardBooksView.vue'),
          },
          {
            // Absolute path: the URL stays /profile, but the view renders
            // inside the dashboard layout so the sidebar does not disappear.
            path: '/profile',
            name: 'profile',
            component: () => import('@/views/ProfileView.vue'),
          },
        ],
      },
      {
        path: 'dep/:slug',
        name: 'department',
        component: () => import('@/views/departments/DepartmentView.vue'),
        props: true,
        meta: { requiresAuth: true },
      },
      {
        path: 'department/:slug/year/:year',
        name: 'subjects',
        component: () => import('@/views/subjects/SubjectsView.vue'),
        props: true,
        meta: { requiresAuth: true },
      },
      {
        path: 'department/:slug/year/:year/subject/:subjectId',
        name: 'subject-documents',
        component: () => import('@/views/documents/DocumentsView.vue'),
        props: true,
        meta: { requiresAuth: true },
      },
      {
        // Every document of one level, without going through a subject.
        path: 'department/:slug/year/:year/documents',
        name: 'level-documents',
        component: () => import('@/views/documents/DocumentsView.vue'),
        props: true,
        meta: { requiresAuth: true },
      },
      /**
       * Short link for notifications arriving from outside the app — Telegram,
       * today. Deliberately terse: it is pasted into chat messages, and the
       * view behind it resolves the real destination.
       */
      {
        path: 'n/:id',
        name: 'notification-open',
        component: () => import('@/views/notifications/NotificationRedirectView.vue'),
        meta: { requiresAuth: true },
      },
      // ── 404 ─────────────────────────────────────────────────────────────
      // A child of the layout, not a route of its own: a wrong URL is still a
      // page of the site, and the nav is what gets the visitor out of it.
      {
        path: ':pathMatch(.*)*',
        name: 'not-found',
        component: () => import('@/views/NotFoundView.vue'),
      },
    ],
  },

  // ── Admin (no layout — has its own sidebar) ───────────────────────────────
  {
    path: '/admin/dashboard',
    name: 'admin',
    component: () => import('@/views/dashboard/AdminDashboardView.vue'),
    /**
     * Admins and department moderators both. The page itself shows each of
     * them only what they can use — a moderator sees the review queue and
     * nothing else. Access to the data behind it is settled by the server.
     */
    meta: { requiresReviewer: true },
  },
  {
    path: '/admin/review/:groupId',
    name: 'admin-review',
    component: () => import('@/views/dashboard/AdminDocumentReviewView.vue'),
    meta: { requiresReviewer: true },
  },

  // ── Auth layout ───────────────────────────────────────────────────────────
  {
    path: '/auth',
    component: () => import('@/layouts/UserAuthLayout.vue'),
    meta: { guestOnly: true },
    children: [
      {
        path: 'login',
        name: 'login',
        component: () => import('@/views/auth/LoginView.vue'),
      },
      {
        path: 'register',
        name: 'register',
        component: () => import('@/views/auth/RegisterView.vue'),
      },
      {
        // Where the backend's Google callback drops the browser. Sits under
        // /auth so it inherits guestOnly — it is only ever reached signed out.
        path: 'callback',
        name: 'auth-callback',
        component: () => import('@/views/auth/GoogleCallbackView.vue'),
      },
      // The three link-driven screens. All under /auth, so they inherit
      // guestOnly: each is reached from an email by someone who is, by
      // definition, not signed in — and the paths must match the URLs the
      // server builds in issueEmailToken().
      {
        path: 'verify-email',
        name: 'verify-email',
        component: () => import('@/views/auth/VerifyEmailView.vue'),
      },
      {
        path: 'forgot-password',
        name: 'forgot-password',
        component: () => import('@/views/auth/ForgotPasswordView.vue'),
      },
      {
        path: 'reset-password',
        name: 'reset-password',
        component: () => import('@/views/auth/ResetPasswordView.vue'),
      },
    ],
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

/**
 * The 404 rendered in place, on the URL that was asked for.
 *
 * Used instead of bouncing an unauthorised visitor somewhere else: a redirect
 * answers the question "is this a real page?", and trying a handful of guesses
 * would map the admin area out. A route you may not have looks exactly like a
 * route that was never there.
 *
 * pathMatch is an array because the catch-all is repeatable (`:pathMatch(.*)*`),
 * one entry per segment.
 */
function notFound(to: RouteLocationNormalized) {
  return {
    name: 'not-found',
    params: { pathMatch: to.path.slice(1).split('/') },
    query: to.query,
    hash: to.hash,
  }
}

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  await auth.init()

  // Before the sign-in check, and covering the signed-out case itself: sending
  // a stranger to the login page would confirm the path just as plainly.
  const isAdmin = auth.user?.role?.toLowerCase() === 'admin'
  if (to.meta.requiresAdmin && !isAdmin) {
    return notFound(to)
  }

  /**
   * Review screens: an admin, or anyone who moderates a department. Separate
   * from requiresAdmin because a moderator's role is still `user` — promoting
   * them to admin to open one screen would hand them the whole admin surface.
   */
  if (to.meta.requiresReviewer && !isAdmin && !auth.user?.is_moderator) {
    return notFound(to)
  }

  // The rest of the app is no secret — /dashboard exists for everyone — so the
  // useful thing here is the login page, not a denial.
  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: 'login' }
  }

  if (to.meta.guestOnly && auth.isAuthenticated) {
    return { name: 'home' }
  }

  /**
   * The department-and-year gate.
   *
   * These two fields are what the audience rule matches on, so an account
   * without them sees only unrestricted documents — a feed that looks broken
   * rather than empty. Enforced here rather than by a dismissible modal, so it
   * also holds on a later visit: close the tab halfway through and the next
   * sign-in lands right back here.
   *
   * `isAuthenticated` is checked first because a signed-out visitor has no
   * profile to be missing, and bouncing them here instead of to the login page
   * would strand them.
   */
  const incomplete =
    auth.isAuthenticated &&
    !!auth.user &&
    (!auth.user.major_id || !auth.user.year_level || !!auth.user.needs_department_choice)

  // `welcome` itself must stay reachable, or the redirect loops forever.
  if (incomplete && to.name !== 'welcome') {
    return { name: 'welcome' }
  }

  // Nothing left to ask: the page has no reason to exist for this account.
  if (!incomplete && to.name === 'welcome') {
    return { name: 'home' }
  }
})

export default router
