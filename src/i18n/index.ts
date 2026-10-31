import { createI18n } from 'vue-i18n'

import enAuth from './locales/en/auth.json'
import kmAuth from './locales/km/auth.json'
import enCommon from './locales/en/common.json'
import kmCommon from './locales/km/common.json'
import enDashboard from './locales/en/dashboard.json'
import kmDashboard from './locales/km/dashboard.json'
import enDocument from './locales/en/document.json'
import kmDocument from './locales/km/document.json'
import enNotification from './locales/en/notification.json'
import kmNotification from './locales/km/notification.json'

/**
 * The language the reader last chose, written by the toggle in NavBar.
 *
 * Validated rather than trusted: a stale or hand-edited value would leave
 * vue-i18n pointing at a locale that has no messages, and every string on
 * the page would quietly come through fallbackLocale instead.
 */
const savedLang = localStorage.getItem('lang')
const locale = savedLang === 'km' || savedLang === 'en' ? savedLang : 'en'

const messages = {
  en: {
    auth: enAuth,
    common: enCommon,
    dashboard: enDashboard,
    document: enDocument,
    notification: enNotification,
  },
  km: {
    auth: kmAuth,
    common: kmCommon,
    dashboard: kmDashboard,
    document: kmDocument,
    notification: kmNotification,
  },
}

const i18n = createI18n({
  legacy: false,
  locale,
  fallbackLocale: 'en',
  messages,
})

export default i18n
