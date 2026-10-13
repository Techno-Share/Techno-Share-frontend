<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useNotificationsStore } from '@/stores/notifications.store'
import { useDocumentsStore } from '@/stores/documents.store'
import { useSubjectsStore } from '@/stores/subjects.store'
import { useBooksStore } from '@/stores/books.store'
import LoadingSpinner from '@/components/base/LoadingSpinner.vue'
import BackButton from '@/components/base/BackButton.vue'
import { formatFileSize, formatRelativeDate, yearMajorLabel } from '@/utils/format'
import noImage from '@/assets/images/no-image.png'
import FileTypeIcon from '@/components/base/FileTypeIcon.vue'
import type { BookRequestDetail } from '@/types/books.types'
import UserAvatar from '@/components/base/UserAvatar.vue'
import AcceptRequestModal from '@/components/books/AcceptRequestModal.vue'
import DeclineRequestModal from '@/components/books/DeclineRequestModal.vue'
const route = useRoute()
const router = useRouter()
const notifStore = useNotificationsStore()
const docs = useDocumentsStore()
const subjectsStore = useSubjectsStore()
const booksStore = useBooksStore()

const notifId = computed(() => String(route.query.notif_id ?? ''))
const refId = computed(() => String(route.query.ref_id ?? ''))
const refType = computed(() => String(route.query.ref_type ?? ''))

const notification = computed(() => notifStore.notifications.find((n) => n.id === notifId.value))

const upload = computed(() => docs.myUploads.find((u) => u.id === refId.value) ?? null)
const subject = computed(() => subjectsStore.mySubjects.find((s) => s.id === refId.value) ?? null)

// ── Book request detail ─────────────────────────────────────────────────────
const bookRequest = ref<BookRequestDetail | null>(null)
const bookReqLoading = ref(false)
const bookReqMissing = ref(false)
const reqAction = ref<string | null>(null)

function reqStatusBadge(status: string) {
  if (status === 'accepted') return 'bg-green-100 text-green-700'
  if (status === 'declined') return 'bg-red-100 text-red-600'
  return 'bg-yellow-100 text-yellow-700'
}

function reqInitials(first?: string, last?: string) {
  return ((first?.[0] ?? '') + (last?.[0] ?? '')).toUpperCase()
}

function telegramHref(contact: string) {
  const trimmed = contact.trim()
  if (trimmed.startsWith('@')) return `https://t.me/${trimmed.slice(1)}`
  const match = trimmed.match(/^(?:https?:\/\/)?t\.me\/(.+)$/i)
  return match ? `https://t.me/${match[1]}` : null
}

async function loadBookRequest() {
  bookReqMissing.value = false
  if (!refId.value) {
    bookReqMissing.value = true
    return
  }
  bookReqLoading.value = true
  try {
    bookRequest.value = await booksStore.fetchRequestDetail(refId.value)
  } catch {
    // Request no longer exists (deleted book or stale notification)
    bookRequest.value = null
    bookReqMissing.value = true
  } finally {
    bookReqLoading.value = false
  }
}

const showAccept = ref(false)

async function onAccept() {
  if (!bookRequest.value) return
  reqAction.value = 'accept'
  try {
    await booksStore.acceptRequest(bookRequest.value.book.id, bookRequest.value.id)
    showAccept.value = false
    await loadBookRequest()
  } finally {
    reqAction.value = null
  }
}

const showDecline = ref(false)

async function onDecline(reason: string) {
  if (!bookRequest.value) return
  reqAction.value = 'decline'
  try {
    await booksStore.declineRequest(bookRequest.value.book.id, bookRequest.value.id, reason)
    showDecline.value = false
    await loadBookRequest()
  } finally {
    reqAction.value = null
  }
}

const loading = computed(() => docs.loading || subjectsStore.loading || bookReqLoading.value)

function formatDocType(type: string): string {
  return type
}

onMounted(async () => {
  if (notifId.value && notification.value && !notification.value.is_read) {
    await notifStore.markRead(notifId.value)
  }
  if (refType.value === 'document') await docs.fetchMine()
  if (refType.value === 'subject') await subjectsStore.fetchMine()
  if (refType.value === 'book_request') await loadBookRequest()
})
</script>

<template>
  <div class="mx-auto w-full max-w-6xl px-6">
    <!-- Back. Hidden as a row so its mb-6 goes with it on a phone, where
         BackButton itself renders nothing. -->
    <div class="mb-6 hidden md:block">
      <BackButton />
    </div>

    <div class="flex flex-col gap-6">
      <!-- Loading -->
      <div v-if="loading" class="flex justify-center py-20">
        <LoadingSpinner />
      </div>

      <!-- ── Rejected document ──────────────────────────────────────────────── -->
      <template v-else-if="refType === 'document' && upload">
        <!-- Rejection reason -->
        <div
          v-if="upload.rejection_reason"
          class="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 mb-4 flex items-start gap-3"
        >
          <svg
            class="shrink-0 w-5 h-5 text-red-400 mt-0.5"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
            />
          </svg>
          <div>
            <p class="text-xs font-semibold text-red-500 uppercase tracking-wide mb-1">
              Reason for rejection
            </p>
            <p class="text-sm text-red-700">{{ upload.rejection_reason }}</p>
          </div>
        </div>

        <!-- Upload info -->
        <div class="rounded-2xl border border-gray-200 bg-white overflow-hidden">
          <div class="px-5 py-4 border-b border-gray-100">
            <p class="text-xs font-medium text-gray-400 uppercase tracking-wide">Upload Details</p>
          </div>
          <div class="divide-y divide-gray-50">
            <div class="grid grid-cols-2 px-5 py-3">
              <span class="text-sm text-gray-400">Title</span>
              <span class="text-sm font-medium text-gray-800">{{ upload.title || '—' }}</span>
            </div>
            <div class="grid grid-cols-2 px-5 py-3">
              <span class="text-sm text-gray-400">Type</span>
              <span class="text-sm font-medium text-gray-800">{{
                upload.doc_type ? formatDocType(upload.doc_type) : '—'
              }}</span>
            </div>
            <div v-if="upload.subjects?.name" class="grid grid-cols-2 px-5 py-3">
              <span class="text-sm text-gray-400">Subject</span>
              <span class="text-sm font-medium text-gray-800">{{ upload.subjects.name }}</span>
            </div>
            <div v-if="upload.majors?.acronym" class="grid grid-cols-2 px-5 py-3">
              <span class="text-sm text-gray-400">Major</span>
              <!-- The cohort, as everywhere else an upload names its department. -->
              <span class="text-sm font-medium text-gray-800">{{
                yearMajorLabel(upload.majors.acronym, upload.year_level)
              }}</span>
            </div>
            <div class="grid grid-cols-2 px-5 py-3">
              <span class="text-sm text-gray-400">Submitted</span>
              <span class="text-sm font-medium text-gray-800">{{
                formatRelativeDate(upload.uploaded_at)
              }}</span>
            </div>
            <div class="grid grid-cols-2 px-5 py-3">
              <span class="text-sm text-gray-400">Rejected</span>
              <span class="text-sm font-medium text-gray-800">{{
                formatRelativeDate(upload.rejected_at)
              }}</span>
            </div>
          </div>
        </div>

        <!-- Files (read-only — storage deleted on rejection) -->
        <div
          v-if="upload.documents?.length"
          class="rounded-2xl border border-gray-200 bg-white overflow-hidden mt-4"
        >
          <div class="px-5 py-4 border-b border-gray-100">
            <p class="text-xs font-medium text-gray-400 uppercase tracking-wide">
              Submitted Files
              <span class="normal-case text-gray-300 ml-1">(removed from storage)</span>
            </p>
          </div>
          <div
            v-for="(file, idx) in upload.documents"
            :key="file.id"
            class="flex items-center gap-3 px-4 py-3"
            :class="idx !== upload.documents.length - 1 ? 'border-b border-gray-50' : ''"
          >
            <FileTypeIcon :name="file.original_name" :size="32" />
            <span class="flex-1 truncate text-sm text-gray-700">{{
              file.original_name || 'Unnamed file'
            }}</span>
            <span class="shrink-0 text-sm text-gray-400">
              {{ formatFileSize(file.file_size_kb ?? 0) }}
            </span>
          </div>
        </div>
        <DeclineRequestModal
          v-if="showDecline && bookRequest"
          :loading="reqAction === 'decline'"
          @cancel="showDecline = false"
          @confirm="onDecline"
        />
        <AcceptRequestModal
          v-if="showAccept && bookRequest"
          :loading="reqAction === 'accept'"
          @cancel="showAccept = false"
          @confirm="onAccept"
        />
      </template>

      <!-- ── Subject an older notification referred to ───────────────────────
           Subjects have no review, so nothing produces these notifications
           any more; the panel stays for the ones already sent. -->
      <template v-else-if="refType === 'subject' && subject">
        <!-- Subject info -->
        <div class="rounded-2xl border border-gray-200 bg-white overflow-hidden">
          <div class="px-5 py-4 border-b border-gray-100">
            <p class="text-xs font-medium text-gray-400 uppercase tracking-wide">Subject Details</p>
          </div>
          <div class="divide-y divide-gray-50">
            <div class="grid grid-cols-2 px-5 py-3">
              <span class="text-sm text-gray-400">Name</span>
              <span class="text-sm font-medium text-gray-800">{{ subject.name || '—' }}</span>
            </div>
            <div v-if="subject.majors?.acronym" class="grid grid-cols-2 px-5 py-3">
              <span class="text-sm text-gray-400">Major</span>
              <span class="text-sm font-medium text-gray-800">{{ subject.majors.acronym }}</span>
            </div>
            <div class="grid grid-cols-2 px-5 py-3">
              <span class="text-sm text-gray-400">Year Level</span>
              <span class="text-sm font-medium text-gray-800">Year {{ subject.year_level }}</span>
            </div>
            <div v-if="subject.semester" class="grid grid-cols-2 px-5 py-3">
              <span class="text-sm text-gray-400">Semester</span>
              <span class="text-sm font-medium text-gray-800">Semester {{ subject.semester }}</span>
            </div>
            <div class="grid grid-cols-2 px-5 py-3">
              <span class="text-sm text-gray-400">Submitted</span>
              <span class="text-sm font-medium text-gray-800">{{
                formatRelativeDate(subject.created_at)
              }}</span>
            </div>
          </div>
        </div>
      </template>

      <!-- ── Book request no longer available ───────────────────────────────── -->
      <div
        v-else-if="refType === 'book_request' && bookReqMissing"
        class="rounded-2xl border border-gray-200 bg-white px-5 py-10 text-center"
      >
        <p class="text-sm font-semibold text-gray-600">This request is no longer available</p>
        <p class="mt-1 text-xs text-gray-400">
          The book may have been removed or the request withdrawn.
        </p>
      </div>

      <!-- ── Book request ───────────────────────────────────────────────────── -->
      <template v-else-if="refType === 'book_request' && bookRequest">
        <div class="flex flex-col md:flex-row gap-4 items-start">
          <!-- Book card -->
          <button
            class="flex-1 min-w-0 w-full md:w-auto flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-4 hover:shadow-md transition-shadow text-left"
            @click="router.push({ name: 'book-detail', params: { id: bookRequest.book.id } })"
          >
            <img
              :src="bookRequest.book.cover_image_url || noImage"
              class="h-100 w-full rounded-lg object-cover shrink-0"
            />
            <div class="flex-1 min-w-0">
              <p class="text-xs text-gray-400">Book request</p>
              <div class="flex items-center justify-between">
                <p class="text-lg font-bold text-gray-900 leading-tight">
                  {{ bookRequest.book.title }}
                </p>
                <span
                  :class="`mt-1 inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${reqStatusBadge(bookRequest.status)}`"
                >
                  {{ bookRequest.status }}
                </span>
              </div>
              <div class="flex items-center justify-center mt-2">
                <span class="text-xs text-primary shrink-0">View book →</span>
              </div>
            </div>
          </button>

          <!-- Details -->
          <div
            class="flex-1 min-w-0 w-full md:w-auto rounded-2xl border border-gray-200 bg-white overflow-hidden"
          >
            <div class="px-5 py-4 border-b border-gray-100">
              <p class="text-xs font-medium text-gray-400 uppercase tracking-wide">
                {{ bookRequest.role === 'donor' ? 'Request from' : 'Your request' }}
              </p>
            </div>
            <div class="divide-y divide-gray-50">
              <!-- The other party -->
              <div class="flex items-center gap-3 px-5 py-3">
                <div
                  class="h-9 w-9 rounded-full overflow-hidden bg-primary flex items-center justify-center shrink-0"
                >
                  <template v-if="bookRequest.role === 'donor'">
                    <UserAvatar
                      :src="bookRequest.requester.avatar_url"
                      :initials="
                        reqInitials(
                          bookRequest.requester.first_name,
                          bookRequest.requester.last_name,
                        )
                      "
                      text-class="text-[11px] !text-white"
                    />
                  </template>
                  <template v-else>
                    <UserAvatar
                      :src="bookRequest.donor.avatar_url"
                      :initials="
                        reqInitials(bookRequest.donor.first_name, bookRequest.donor.last_name)
                      "
                      text-class="text-[11px] !text-white"
                    />
                  </template>
                </div>
                <span class="text-sm font-medium text-gray-800">
                  <template v-if="bookRequest.role === 'donor'">
                    {{ bookRequest.requester.first_name }} {{ bookRequest.requester.last_name }}
                  </template>
                  <template v-else>
                    {{ bookRequest.donor.first_name }} {{ bookRequest.donor.last_name }}
                  </template>
                </span>
              </div>

              <!-- Message -->
              <div v-if="bookRequest.message" class="flex items-start gap-4 px-5 py-3">
                <span class="w-1/3 shrink-0 text-sm text-gray-400">Message</span>
                <span class="flex-1 text-sm text-gray-800">{{ bookRequest.message }}</span>
              </div>

              <!-- Revealed contact (after accept) -->
              <div v-if="bookRequest.contact" class="flex items-start gap-4 px-5 py-3">
                <span class="w-1/3 shrink-0 text-sm text-gray-400">{{
                  bookRequest.role === 'donor' ? 'Requester contact' : 'Donor contact'
                }}</span>
                <a
                  v-if="telegramHref(bookRequest.contact)"
                  :href="telegramHref(bookRequest.contact)!"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="flex-1 text-sm font-semibold text-primary hover:underline"
                  >{{ bookRequest.contact }}</a
                >
                <span v-else class="flex-1 text-sm font-semibold text-primary">{{
                  bookRequest.contact
                }}</span>
              </div>

              <div class="flex items-start gap-4 px-5 py-3">
                <span class="w-1/3 shrink-0 text-sm text-gray-400">Requested</span>
                <span class="flex-1 text-sm font-medium text-gray-800">{{
                  formatRelativeDate(bookRequest.requested_at)
                }}</span>
              </div>
            </div>
            <div>
              <!-- Status messages -->
              <div
                v-if="bookRequest.status === 'accepted'"
                class="rounded-b-2xl border border-green-200 bg-green-50 px-5 py-4"
              >
                <p class="text-sm font-semibold text-green-700">Request accepted</p>
                <p class="mt-1 text-sm text-gray-600">
                  {{
                    bookRequest.role === 'donor'
                      ? 'Reach out to the requester using their contact above to arrange the handoff.'
                      : 'Contact the donor using the details above to arrange picking up the book.'
                  }}
                </p>
              </div>
              <div
                v-else-if="bookRequest.status === 'declined'"
                class="mt-4 rounded-2xl border border-red-200 bg-red-50 px-5 py-4"
              >
                <p class="text-sm font-semibold text-red-600">Request declined</p>
                <p v-if="bookRequest.decline_reason" class="mt-1 text-sm text-gray-600">
                  Reason: {{ bookRequest.decline_reason }}
                </p>
              </div>

              <!-- Donor actions on a pending request -->
              <div
                v-if="bookRequest.role === 'donor' && bookRequest.status === 'pending'"
                class="mt-4 flex gap-3"
              >
                <button
                  :disabled="reqAction !== null"
                  @click="showDecline = true"
                  class="flex-1 rounded-xl border border-gray-300 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60 transition-colors"
                >
                  {{ reqAction === 'decline' ? '…' : 'Decline' }}
                </button>
                <button
                  :disabled="reqAction !== null"
                  @click="showAccept = true"
                  class="flex-1 rounded-xl bg-primary py-2.5 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-60 transition-colors"
                >
                  {{ reqAction === 'accept' ? '…' : 'Accept' }}
                </button>
              </div>
              <p
                v-else-if="bookRequest.role === 'requester' && bookRequest.status === 'pending'"
                class="mt-4 text-center text-sm text-gray-400"
              >
                Waiting for the donor to respond…
              </p>
            </div>
          </div>
        </div>
      </template>

      <!-- Fallback -->
      <div v-else class="text-sm text-gray-400 py-8 text-center">No details available.</div>
    </div>
  </div>
</template>
