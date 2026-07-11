'use client';

import { useEffect, useSyncExternalStore } from 'react';
import './globals.css';
import { applyDocumentLanguage, detectInitialLanguage } from '@/i18n/i18n';
import { languageToHtmlLang, resources, type SupportedLanguage } from '@/i18n/resources';

function subscribeLanguage() {
  return () => {};
}

function getServerLanguage(): SupportedLanguage {
  return 'en';
}

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const language = useSyncExternalStore(
    subscribeLanguage,
    detectInitialLanguage,
    getServerLanguage,
  );

  useEffect(() => {
    applyDocumentLanguage(language);
  }, [language]);

  const messages = resources[language].common;

  return (
    <html
      lang={languageToHtmlLang(language)}
      data-theme="dark"
      data-language={language}
    >
      <body className="min-h-screen bg-void text-ink-primary">
        <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4">
          <div className="rounded-lg border border-ochre/30 bg-void-deep p-8 text-center shadow-[0_24px_70px_rgba(0,0,0,0.45)]">
            <div className="mb-4 text-[48px] font-bold leading-none text-ochre [text-shadow:0_0_8px_rgba(255,68,102,0.45)]">
              500
            </div>
            <p className="mb-6 text-[14px] text-ink-secondary">{messages.errors.systemError}</p>
            <button
              onClick={() => reset()}
              className="rounded-lg border border-copper/30 px-4 py-2 text-[13px] text-copper transition-colors hover:bg-copper/10"
            >
              {messages.app.retry}
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
