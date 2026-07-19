'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { AppBootstrapLoading } from '@/components/ui/AppBootstrapLoading';
import {
  default as appI18n,
  detectInitialLanguage,
  setAppLanguage,
} from '@/i18n/i18n';
import { LANGUAGE_STORAGE_KEY, normalizeLanguage } from '@/i18n/resources';

interface AppI18nProviderProps {
  children: ReactNode;
}

export function AppI18nProvider({ children }: AppI18nProviderProps) {
  const [bootstrapping, setBootstrapping] = useState(true);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        await setAppLanguage(detectInitialLanguage(), appI18n);
      } catch (error: unknown) {
        console.error('Failed to initialize language:', error);
      } finally {
        if (active) setBootstrapping(false);
      }
    })();

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== LANGUAGE_STORAGE_KEY) return;
      if (event.newValue === null) return;
      const nextLanguage = normalizeLanguage(event.newValue);
      if (!nextLanguage) return;
      void setAppLanguage(nextLanguage, appI18n)
        .catch((error: unknown) => {
          console.error('Failed to sync stored language:', error);
        });
    };

    window.addEventListener('storage', handleStorage);

    return () => {
      active = false;
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  return (
    <I18nextProvider i18n={appI18n}>
      {bootstrapping ? <AppBootstrapLoading /> : children}
    </I18nextProvider>
  );
}
