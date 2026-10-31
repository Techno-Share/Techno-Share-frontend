<template>
  <div>
    <NavBar />
    <main class="pt-25">
      <RouterView />
    </main>

    <PromotionNoticeModal v-if="showNotice" @dismiss="dismiss" />
  </div>
</template>

<script setup lang="ts">
import NavBar from '@/components/layout/NavBar.vue'
import { RouterView } from 'vue-router'
import PromotionNoticeModal from '@/components/base/PromotionNoticeModal.vue'
import { usePromotionNotice } from '@/composables/usePromotionNotice'

/**
 * The department-and-year prompt used to be mounted here as a dismissible
 * modal. It is now the `/welcome` route, enforced by the navigation guard.
 *
 * What remains is the promotion notice, which is the opposite case: nothing is
 * required of the student, so it is dismissible and does not block the page
 * behind it. It is mounted here rather than per page because the rollover is
 * applied by `getMe`, so whichever page they land on first is the one that
 * should congratulate them.
 */
const { showNotice, dismiss } = usePromotionNotice()
</script>
