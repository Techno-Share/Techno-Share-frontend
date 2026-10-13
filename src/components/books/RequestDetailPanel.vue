<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import RequestProgress from '@/components/books/RequestProgress.vue'
import BookInfoRow from '@/components/books/BookInfoRow.vue'
import RingSpinner from '@/components/base/RingSpinner.vue'
import ConfirmActionModal from '@/components/base/ConfirmActionModal.vue'
import ImageLightbox from '@/components/base/ImageLightbox.vue'
import { telegramHref, formatRelativeDate, displayName } from '@/utils/format'
import type { OutgoingBookRequest } from '@/types/books.types'

/**
 * Everything about one of my requests, opened from its card.
 *
 * Rendered inline in place of the grid rather than as a modal: this is a page
 * you read and act on, not a confirmation to dismiss, so it keeps the dashboard
 * chrome and a Back affordance instead of trapping focus behind an overlay.
 *
 * The grid stays a plain list of books — cover, title, owner — and everything
 * that only matters for one request lives here.
 */
const props = defineProps<{ request: OutgoingBookRequest; busy?: boolean }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'confirm-received'): void
  (e: 'cancel-request'): void
}>()

const { t } = useI18n({ useScope: 'global' })

/** Cover enlarged fullscreen, the same as on the donor's panel. */
const showFullImage = ref(false)

// Title-cased: names are stored as typed at sign-up, often all lowercase.
const donorName = computed(() =>
  displayName(props.request.donor.first_name, props.request.donor.last_name),
)

/**
 * Both actions are one-way — confirming donates the book, cancelling releases it
 * to everyone else — so each asks first. The parent only hears about it once
 * the user has said yes.
 */
const confirming = ref<'received' | 'cancel' | null>(null)

function onConfirmed() {
  if (confirming.value === 'received') emit('confirm-received')
  else if (confirming.value === 'cancel') emit('cancel-request')
  confirming.value = null
}
</script>

<template>
  <!-- A column, so the panel can hand its leftover height to one scrolling
       region instead of growing past the sidebar. The height itself comes from
       the parent — see DashboardBooksView's root. -->
  <div class="flex flex-col rounded-2xl border border-gray-100 bg-white p-6">
    <!-- Back stays at the panel's left edge: it navigates the whole panel, so
         it belongs to the container rather than the centred content. -->
    <button
      type="button"
      class="mb-4 flex shrink-0 items-center gap-1 text-sm font-medium text-gray-500 transition hover:text-gray-700 hover:cursor-pointer"
      @click="emit('close')"
    >
      <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
      </svg>
      {{ t('common.common.back') }}
    </button>

    <!-- Pinned above the scroll: the track says which of the three steps you
         are on, which is exactly what you want kept in view while reading the
         detail under it. -->
    <div class="mx-auto w-full max-w-lg shrink-0">
      <RequestProgress :status="props.request.status" />
    </div>

    <!-- The scroll is the full width of the panel, not the narrow column: a
         scrollbar hanging in the middle of the card reads as a stray element
         rather than as the panel scrolling. min-h-0 is what makes it scroll at
         all — a flex item refuses to shrink below its content without it, so
         the panel would grow and the overflow would land on the page. -->
    <div class="min-h-0 flex-1 overflow-y-auto">
      <!-- The content itself is a narrow column, centred in the panel. -->
      <div class="mx-auto w-full max-w-lg">
        <div class="mt-5 flex flex-col items-center gap-3">
          <!-- Same as MyBookPanel: the cover enlarges, and only when there
             is one — an empty box has nothing to show fullscreen. -->
          <img
            :src="props.request.book.cover_image_url || ''"
            alt=""
            class="h-46 w-34 shrink-0 rounded-lg object-contain"
            :class="props.request.book.cover_image_url ? 'hover:cursor-pointer' : ''"
            @click="props.request.book.cover_image_url && (showFullImage = true)"
          />
          <!-- w-full, not flex-1: the column centres its children, so the text
             needs a definite width for both centring and truncate to work. -->
          <div class="w-full text-center">
            <h2 class="truncate text-base font-semibold text-gray-900">
              {{ props.request.book.title }}
            </h2>
            <p class="mt-0.5 truncate text-xs text-black">
              {{
                t('dashboard.books.requestedOn', {
                  date: formatRelativeDate(props.request.requested_at),
                })
              }}
            </p>
            <!-- Not truncated: this is the one screen with room for it, and a
               description is why the book was asked for in the first place. -->
            <p
              v-if="props.request.book.description"
              class="mt-3 text-xs leading-relaxed text-gray-400"
            >
              Description:
              {{ props.request.book.description }}
            </p>
            <p v-else class="mt-3 text-xs italic leading-relaxed text-gray-400">
              {{ t('common.bookDetail.noDescription') }}
            </p>
          </div>
        </div>

        <!-- Wrappers, because BookInfoRow's root is flex-1: as direct children
           the two would split the row in half and Telegram would start at the
           midpoint. Wrapped, they size to content and justify-between can push
           Telegram to the far edge. -->
        <div class="mt-5 flex flex-col md:flex-row w-full items-center justify-around gap-3">
          <div class="min-w-0">
            <BookInfoRow icon="owner" :label="t('dashboard.books.bookOwner')">
              <p class="truncate text-sm font-semibold text-gray-900">
                {{ donorName }}
              </p>
            </BookInfoRow>
          </div>

          <!-- Only ever present once accepted; the API withholds it before. -->
          <div v-if="props.request.contact" class="shrink-0">
            <BookInfoRow icon="telegram" :label="t('dashboard.books.contact')">
              <a
                v-if="telegramHref(props.request.contact)"
                :href="telegramHref(props.request.contact)!"
                target="_blank"
                rel="noopener noreferrer"
                class="block truncate text-sm font-semibold text-primary hover:underline"
                >{{ props.request.contact }}</a
              >
              <span v-else class="block truncate text-sm font-semibold text-primary">{{
                props.request.contact
              }}</span>
            </BookInfoRow>
          </div>
        </div>

        <div
          v-if="props.request.status === 'accepted' && props.request.contact"
          class="mt-3 flex items-center justify-center gap-2 text-xs text-gray-600"
        >
          <!-- Sibling of the text, not inside it: as inline content the icon
             breaks onto its own line instead of sitting beside the message. -->

          <div class="flex items-start gap-2 text-left leading-relaxed">
            <svg
              class="mt-0.5 h-5 w-5 shrink-0 text-primary"
              fill="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                fill-rule="evenodd"
                clip-rule="evenodd"
                d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm8.706-1.442c1.146-.573 2.437.463 2.126 1.706l-.709 2.836.042-.02a.75.75 0 0 1 .67 1.34l-.04.022c-1.147.573-2.438-.463-2.127-1.706l.71-2.836-.042.02a.75.75 0 1 1-.671-1.34l.041-.022ZM12 9a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z"
              />
            </svg>

            <div class="min-w-0 flex-1">
              <p>
                {{ t('dashboard.books.contactOwnerHint') }}
              </p>

              <!-- `action` reuses the button's own label so this sentence and the
                 button it points at cannot drift apart. -->
              <p class="mt-1">
                {{
                  t('dashboard.books.confirmReceivedHint', {
                    action: t('dashboard.books.confirmReceived'),
                  })
                }}
              </p>
            </div>
          </div>
        </div>
        <div
          v-else-if="props.request.status === 'pending'"
          class="mx-auto mt-5 flex w-fit items-center justify-center gap-2 rounded-lg bg-primary/10 px-4 py-2 text-sm text-primary"
        >
          <!-- Solid disc with the glyph punched out (fill-rule evenodd), so the
             "i" reads in the panel colour behind it. -->
          <svg
            class="h-5 w-5 shrink-0 text-primary"
            fill="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              fill-rule="evenodd"
              clip-rule="evenodd"
              d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm8.706-1.442c1.146-.573 2.437.463 2.126 1.706l-.709 2.836.042-.02a.75.75 0 0 1 .67 1.34l-.04.022c-1.147.573-2.438-.463-2.127-1.706l.71-2.836-.042.02a.75.75 0 1 1-.671-1.34l.041-.022ZM12 9a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z"
            />
          </svg>
          <p class="text-center leading-relaxed">
            {{ t('dashboard.books.waitingForResponse') }}
          </p>
        </div>

        <!-- Only the receiver closes this out: the donor saying they handed it
             over is a claim, this is the fact. -->
        <div v-if="props.request.status === 'accepted'" class="mt-5 flex gap-2">
          <button
            type="button"
            :disabled="props.busy"
            class="w-full rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-600 transition hover:bg-gray-50 hover:cursor-pointer disabled:opacity-60"
            @click="confirming = 'cancel'"
          >
            {{ t('dashboard.books.cancelRequest') }}</button
          ><button
            type="button"
            :disabled="props.busy"
            class="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-hover hover:cursor-pointer disabled:opacity-60"
            @click="confirming = 'received'"
          >
            <RingSpinner v-if="props.busy" :size="16" :stroke="3" />
            {{ t('dashboard.books.confirmReceived') }}
          </button>
        </div>

        <ConfirmActionModal
          v-if="confirming"
          :title="
            confirming === 'received'
              ? t('dashboard.books.confirmReceivedTitle')
              : t('dashboard.books.confirmCancelTitle')
          "
          :message="
            confirming === 'received'
              ? t('dashboard.books.confirmReceivedMessage')
              : t('dashboard.books.confirmCancelMessage')
          "
          :confirm-label="
            confirming === 'received'
              ? t('dashboard.books.confirmReceived')
              : t('dashboard.books.cancelRequest')
          "
          :tone="confirming === 'cancel' ? 'danger' : 'primary'"
          :loading="props.busy"
          @cancel="confirming = null"
          @confirm="onConfirmed"
        />

        <!-- The closing step, shown the same way as the waiting one: the tint
           hugs the sentence under the book rather than spanning the column. The
           check disc is the one the "Donated" badge uses, so the end of the
           flow reads the same on both sides. -->
        <div
          v-if="props.request.status === 'completed'"
          class="mx-auto mt-5 flex w-fit items-center justify-center gap-2 rounded-xl bg-primary/10 px-4 py-2 text-sm text-primary"
        >
          <svg class="h-5 w-5 shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
            <path
              fill-rule="evenodd"
              clip-rule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
            />
          </svg>
          <p class="text-center leading-relaxed">{{ t('dashboard.books.bookReceived') }}</p>
        </div>
      </div>
    </div>

    <ImageLightbox
      v-model="showFullImage"
      :src="props.request.book.cover_image_url || ''"
      :alt="props.request.book.title"
    />
  </div>
</template>
