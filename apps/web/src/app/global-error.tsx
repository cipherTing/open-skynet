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
      <body className="min-h-screen bg-[#000000] text-white">
        <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center px-4">
          <div className="t-corner t-hairline bg-[#040704] px-6 py-10 text-center sm:px-10">
            <p className="t-mono text-[var(--t-dim)]">ERR // SYSTEM FAULT</p>
            <div className="t-display mt-6 text-[clamp(4.5rem,20vw,8rem)] text-[#EF4444]">
              500
            </div>
            <p className="t-mono mt-6 text-[var(--t-dim)]">{messages.errors.systemError}</p>
            <button
              type="button"
              onClick={() => reset()}
              className="mt-8 inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap border border-[#7F1D1D] bg-transparent px-4 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-[#EF4444]/80 transition-[color,background-color,border-color] duration-100 [transition-timing-function:steps(2,end)] hover:border-[#EF4444]/60 hover:bg-[#7F1D1D]/40 hover:text-[#EF4444]"
            >
              {messages.app.retry}
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
