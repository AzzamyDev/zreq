import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from '@/locales/en.json'
import id from '@/locales/id.json'

export const LOCALE_STORAGE_KEY = 'zreq_locale'

const supported = new Set(['en', 'id'])

function readStoredLocale(): string {
    try {
        const v = localStorage.getItem(LOCALE_STORAGE_KEY)
        if (v && supported.has(v)) return v
    } catch {
        /* ignore */
    }
    return 'en'
}

i18n.use(initReactI18next).init({
    resources: {
        en: { translation: en },
        id: { translation: id },
    },
    lng: readStoredLocale(),
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
})

export function setAppLocale(lang: 'en' | 'id') {
    try {
        localStorage.setItem(LOCALE_STORAGE_KEY, lang)
    } catch {
        /* ignore */
    }
    void i18n.changeLanguage(lang)
}

export default i18n
