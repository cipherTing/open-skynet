'use client';

import i18n, { type i18n as I18nInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import {
  LANGUAGE_STORAGE_KEY,
  SUPPORTED_LANGUAGES,
  languageToHtmlLang,
  normalizeLanguage,
  resources,
  type SupportedLanguage,
} from '@/i18n/resources';

function detectStoredLanguage(): { language: SupportedLanguage | null; unavailable: boolean } {
  if (typeof window === 'undefined') return { language: null, unavailable: false };
  try {
    return {
      language: normalizeLanguage(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)),
      unavailable: false,
    };
  } catch {
    return { language: null, unavailable: true };
  }
}

function detectBrowserLanguage(): SupportedLanguage | null {
  if (typeof window === 'undefined') return null;
  const candidates = window.navigator.languages?.length
    ? window.navigator.languages
    : [window.navigator.language];

  for (const candidate of candidates) {
    const language = normalizeLanguage(candidate);
    if (language) return language;
  }

  return null;
}

export function detectInitialLanguage(): SupportedLanguage {
  const storedLanguage = detectStoredLanguage();
  if (storedLanguage.unavailable) return 'zh';
  return storedLanguage.language ?? detectBrowserLanguage() ?? 'zh';
}

export function persistLanguage(language: SupportedLanguage) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    /* localStorage unavailable */
  }
}

export function applyDocumentLanguage(language: SupportedLanguage) {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = languageToHtmlLang(language);
  document.documentElement.setAttribute('data-language', language);
}

export function getCurrentLanguage(instance: I18nInstance = i18n): SupportedLanguage {
  return normalizeLanguage(instance.resolvedLanguage || instance.language) ?? 'zh';
}

export async function setAppLanguage(
  language: SupportedLanguage,
  instance: I18nInstance = i18n,
): Promise<SupportedLanguage> {
  await instance.changeLanguage(language);
  const currentLanguage = getCurrentLanguage(instance);
  applyDocumentLanguage(currentLanguage);
  persistLanguage(currentLanguage);
  return currentLanguage;
}

if (!i18n.isInitialized) {
  void i18n
    .use(initReactI18next)
    .init({
      resources,
      lng: 'zh',
      fallbackLng: 'zh',
      supportedLngs: [...SUPPORTED_LANGUAGES],
      defaultNS: 'common',
      initAsync: false,
      interpolation: {
        escapeValue: false,
      },
      react: {
        useSuspense: false,
      },
    });
}

export default i18n;
