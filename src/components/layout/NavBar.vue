<template>
  <nav ref="navRef" class="bg-white shadow-sm fixed top-0 left-0 w-full z-50">
    <div class="max-w-7xl mx-auto px-6">
      <div class="flex items-center justify-between py-4 relative">
        <!-- Left Section -->
        <div class="flex items-center">
          <!-- Mobile Menu Button -->
          <button @click="toggleMenu" class="md:hidden text-2xl">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="1.5"
              stroke="currentColor"
              class="size-6 w-8 h-8"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
              />
            </svg>
          </button>

          <!-- Desktop Logo -->
          <router-link to="/" class="hidden md:block">
            <img :src="logoUrl" alt="ITC Sharing" class="h-9 w-auto object-contain" />
          </router-link>
        </div>

        <!-- Center Section -->
        <!-- Mobile Logo -->
        <router-link to="/" class="md:hidden absolute left-1/2 transform -translate-x-1/2">
          <img :src="logoUrl" alt="ITC Sharing" class="h-9 w-auto object-contain" />
        </router-link>

        <!-- Desktop Menu -->
        <ul
          class="hidden md:flex gap-8 font-semibold text-gray-700 text-lg absolute left-1/2 transform -translate-x-1/2"
        >
          <router-link
            to="/"
            class="pb-1 border-b-2 border-transparent hover:text-primary transition-colors"
            exact-active-class="!text-primary !border-primary"
            >{{ t('common.nav.home') }}</router-link
          >
          <router-link
            to="/documents"
            class="pb-1 border-b-2 border-transparent hover:text-primary transition-colors"
            active-class="!text-primary !border-primary"
            >{{ t('common.nav.docs') }}</router-link
          >
          <router-link
            to="/books"
            class="pb-1 border-b-2 border-transparent hover:text-primary transition-colors"
            active-class="!text-primary !border-primary"
            >{{ t('common.nav.books') }}</router-link
          >
        </ul>

        <!-- Right Section -->
        <div class="flex items-center gap-3">
          <button
            type="button"
            @click="toggleLang"
            class="hidden md:flex items-center gap-1.5 px-1 text-gray-800 hover:text-primary transition-colors cursor-pointer"
            :aria-label="isKm ? 'Switch to English' : 'Switch to Khmer'"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 640 640"
              class="w-5 h-5 shrink-0"
              fill="currentColor"
            >
              <path
                d="M192 64C209.7 64 224 78.3 224 96L224 128L352 128C369.7 128 384 142.3 384 160C384 177.7 369.7 192 352 192L342.4 192L334 215.1C317.6 260.3 292.9 301.6 261.8 337.1C276 345.9 290.8 353.7 306.2 360.6L356.6 383L418.8 243C423.9 231.4 435.4 224 448 224C460.6 224 472.1 231.4 477.2 243L605.2 531C612.4 547.2 605.1 566.1 589 573.2C572.9 580.3 553.9 573.1 546.8 557L526.8 512L369.3 512L349.3 557C342.1 573.2 323.2 580.4 307.1 573.2C291 566 283.7 547.1 290.9 531L330.7 441.5L280.3 419.1C257.3 408.9 235.3 396.7 214.5 382.7C193.2 399.9 169.9 414.9 145 427.4L110.3 444.6C94.5 452.5 75.3 446.1 67.4 430.3C59.5 414.5 65.9 395.3 81.7 387.4L116.2 370.1C132.5 361.9 148 352.4 162.6 341.8C148.8 329.1 135.8 315.4 123.7 300.9L113.6 288.7C102.3 275.1 104.1 254.9 117.7 243.6C131.3 232.3 151.5 234.1 162.8 247.7L173 259.9C184.5 273.8 197.1 286.7 210.4 298.6C237.9 268.2 259.6 232.5 273.9 193.2L274.4 192L64.1 192C46.3 192 32 177.7 32 160C32 142.3 46.3 128 64 128L160 128L160 96C160 78.3 174.3 64 192 64zM448 334.8L397.7 448L498.3 448L448 334.8z"
              />
            </svg>
            <span class="text-sm font-semibold">{{ isKm ? 'ខ្មែរ' : 'English' }}</span>
          </button>
          <!-- ── Notification bell ──────────────────────────────────────── -->
          <NotificationBell v-if="authStore.isAuthenticated" />

          <!-- ── Account menu ───────────────────────────────────────────── -->
          <div v-if="authStore.isAuthenticated" ref="accountMenuRef" class="relative">
            <button
              type="button"
              @click="toggleAccountMenu"
              class="flex items-center cursor-pointer"
              aria-label="Open account menu"
            >
              <span
                class="h-8 w-8 rounded-full overflow-hidden ring-1 ring-gray-200 bg-primary/10 flex items-center justify-center"
              >
                <UserAvatar :src="authStore.user?.avatar_url" :initials="accountInitials" />
              </span>
            </button>

            <div
              v-if="isAccountMenuOpen"
              class="absolute right-0 mt-2 w-60 bg-white border border-gray-200 rounded-xl shadow-lg py-1 overflow-hidden"
            >
              <!-- Who you are signed in as. Without it the menu is three verbs
                   with no subject, which matters once accounts are shared. -->
              <div class="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
                <span
                  class="h-9 w-9 shrink-0 rounded-full overflow-hidden bg-primary/10 flex items-center justify-center"
                >
                  <UserAvatar :src="authStore.user?.avatar_url" :initials="accountInitials" />
                </span>
                <div class="min-w-0">
                  <p class="truncate text-sm font-semibold text-gray-900">
                    {{ authStore.fullName }}
                  </p>
                  <p class="truncate text-[11px] text-gray-400">{{ authStore.user?.email }}</p>
                </div>
              </div>

              <RouterLink
                :to="{ name: 'dashboard' }"
                @click="isAccountMenuOpen = false"
                class="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                <svg
                  class="h-4 w-4 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z"
                  />
                </svg>
                {{ t('common.nav.dashboard') }}
              </RouterLink>

              <div class="my-1 border-t border-gray-100" />

              <button
                type="button"
                @click="handleLogout"
                class="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 hover:cursor-pointer"
              >
                <svg
                  class="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                  />
                </svg>
                {{ t('common.nav.logout') }}
              </button>
            </div>
          </div>

          <template v-else>
            <RouterLink to="/auth/login">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 640 640"
                class="w-8 h-8 md:hidden"
              >
                <path
                  d="M320 312C386.3 312 440 258.3 440 192C440 125.7 386.3 72 320 72C253.7 72 200 125.7 200 192C200 258.3 253.7 312 320 312zM290.3 368C191.8 368 112 447.8 112 546.3C112 562.7 125.3 576 141.7 576L498.3 576C514.7 576 528 562.7 528 546.3C528 447.8 448.2 368 349.7 368L290.3 368z"
                />
              </svg>
            </RouterLink>

            <RouterLink to="/auth/login">
              <ButtonPrimary :text="t('common.nav.login')" class="hidden md:block" />
            </RouterLink>
          </template>
        </div>
      </div>
    </div>

    <!-- Mobile Menu -->
    <div v-if="isOpen" class="md:hidden border-t border-gray-100 px-4 py-2">
      <ul class="flex flex-col font-semibold text-gray-700">
        <router-link
          to="/"
          @click="isOpen = false"
          class="rounded-lg px-3 py-2.5 hover:bg-gray-50 hover:text-primary transition-colors"
          exact-active-class="!text-primary bg-primary/5"
          >{{ t('common.nav.home') }}</router-link
        >
        <router-link
          to="/documents"
          @click="isOpen = false"
          class="rounded-lg px-3 py-2.5 hover:bg-gray-50 hover:text-primary transition-colors"
          active-class="!text-primary bg-primary/5"
          >{{ t('common.nav.docs') }}</router-link
        >
        <router-link
          to="/books"
          @click="isOpen = false"
          class="rounded-lg px-3 py-2.5 hover:bg-gray-50 hover:text-primary transition-colors"
          active-class="!text-primary bg-primary/5"
          >{{ t('common.nav.books') }}</router-link
        >
      </ul>

      <!-- Language toggle -->
      <button
        type="button"
        @click="toggleLang"
        class="mt-1 w-full flex items-center gap-2 rounded-lg border-t border-gray-100 px-3 pt-3 pb-1 text-gray-700 font-semibold hover:text-primary transition-colors"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 640 640"
          class="w-5 h-5 shrink-0"
          fill="currentColor"
        >
          <path
            d="M192 64C209.7 64 224 78.3 224 96L224 128L352 128C369.7 128 384 142.3 384 160C384 177.7 369.7 192 352 192L342.4 192L334 215.1C317.6 260.3 292.9 301.6 261.8 337.1C276 345.9 290.8 353.7 306.2 360.6L356.6 383L418.8 243C423.9 231.4 435.4 224 448 224C460.6 224 472.1 231.4 477.2 243L605.2 531C612.4 547.2 605.1 566.1 589 573.2C572.9 580.3 553.9 573.1 546.8 557L526.8 512L369.3 512L349.3 557C342.1 573.2 323.2 580.4 307.1 573.2C291 566 283.7 547.1 290.9 531L330.7 441.5L280.3 419.1C257.3 408.9 235.3 396.7 214.5 382.7C193.2 399.9 169.9 414.9 145 427.4L110.3 444.6C94.5 452.5 75.3 446.1 67.4 430.3C59.5 414.5 65.9 395.3 81.7 387.4L116.2 370.1C132.5 361.9 148 352.4 162.6 341.8C148.8 329.1 135.8 315.4 123.7 300.9L113.6 288.7C102.3 275.1 104.1 254.9 117.7 243.6C131.3 232.3 151.5 234.1 162.8 247.7L173 259.9C184.5 273.8 197.1 286.7 210.4 298.6C237.9 268.2 259.6 232.5 273.9 193.2L274.4 192L64.1 192C46.3 192 32 177.7 32 160C32 142.3 46.3 128 64 128L160 128L160 96C160 78.3 174.3 64 192 64zM448 334.8L397.7 448L498.3 448L448 334.8z"
          />
        </svg>
        {{ isKm ? 'ខ្មែរ' : 'English' }}
      </button>
    </div>
  </nav>
</template>

<script setup lang="ts">
import logoUrl from '@/assets/images/techno_share_logo_trimmed.png'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ButtonPrimary from '@/components/base/ButtonPrimary.vue'
import NotificationBell from '@/components/notifications/NotificationBell.vue'
import { useAuthStore } from '@/stores/auth.store'
import UserAvatar from '@/components/base/UserAvatar.vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'

const { locale, t } = useI18n({ useScope: 'global' })
const authStore = useAuthStore()
const router = useRouter()

const accountInitials = computed(() => {
  const f = authStore.user?.first_name?.[0] ?? ''
  const l = authStore.user?.last_name?.[0] ?? ''
  return (f + l).toUpperCase() || '?'
})

// ✅ better init
const isKm = ref(locale.value === 'km')

const toggleLang = () => {
  const newLang = isKm.value ? 'en' : 'km'
  isKm.value = !isKm.value

  locale.value = newLang
  localStorage.setItem('lang', newLang)
}

watch(locale, (val) => {
  isKm.value = val === 'km'
})

const isOpen = ref(false)
const navRef = ref<HTMLElement | null>(null)

const toggleMenu = () => {
  isOpen.value = !isOpen.value
}

const isAccountMenuOpen = ref(false)
const accountMenuRef = ref<HTMLElement | null>(null)

const toggleAccountMenu = () => {
  isAccountMenuOpen.value = !isAccountMenuOpen.value
}

const closeAccountMenu = () => {
  isAccountMenuOpen.value = false
}

// ── Click-outside ─────────────────────────────────────────────────────────────
const handleClickOutside = (event: MouseEvent) => {
  const target = event.target as Node

  if (accountMenuRef.value && !accountMenuRef.value.contains(target)) {
    closeAccountMenu()
  }

  // The mobile menu closes on anything outside the navbar. Measured against the
  // whole <nav>, not the panel alone: the hamburger lives in the bar above the
  // panel, so a narrower test would count pressing it as "outside" and close
  // the menu in the same click that toggleMenu just opened it.
  if (isOpen.value && navRef.value && !navRef.value.contains(target)) {
    isOpen.value = false
  }
}

const handleLogout = async () => {
  authStore.logout()
  closeAccountMenu()
  await router.push('/')
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>
