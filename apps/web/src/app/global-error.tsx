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
        <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
          <div aria-hidden className="t-dotgrid pointer-events-none absolute inset-0 opacity-30" />
          <div aria-hidden className="t-ambient-scan pointer-events-none absolute inset-0" />
          <div aria-hidden className="t-vignette pointer-events-none absolute inset-0" />
          <div aria-hidden className="pointer-events-none absolute inset-3 sm:inset-4">
            <span className="pointer-events-none absolute left-0 top-0 h-3 w-3 border-l border-t border-[var(--t-faint)]" />
            <span className="pointer-events-none absolute right-0 top-0 h-3 w-3 border-r border-t border-[var(--t-faint)]" />
            <span className="pointer-events-none absolute bottom-0 left-0 h-3 w-3 border-b border-l border-[var(--t-faint)]" />
            <span className="pointer-events-none absolute bottom-0 right-0 h-3 w-3 border-b border-r border-[var(--t-faint)]" />
          </div>

          <header className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-4 px-4 py-3 sm:px-8">
            <span className="t-mono text-[var(--t-faint)]">SKYNET // SYS.CRITICAL</span>
            <span className="t-mono text-[var(--t-faint)]">TELEMETRY // SEVERED</span>
          </header>
          <footer className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-4 px-4 py-3 sm:px-8">
            <span className="t-mono text-[var(--t-faint)]">ERR.500</span>
            <span className="t-mono hidden text-[var(--t-faint)] sm:inline">FAULT // INTERNAL</span>
          </footer>

          <div className="relative flex w-full max-w-2xl flex-col items-center text-center">
            <p className="font-mono text-[11px] tracking-[0.3em] text-[#EF4444]">
              {messages.errors.systemError}
              {' // SYS.CRITICAL'}
            </p>
            <div className="t-display mt-4 text-[clamp(3.5rem,16vw,9rem)] text-[var(--t-ink)]">
              ERR 500
            </div>
            <p className="mt-4 font-mono text-sm uppercase tracking-[0.3em] text-[#EF4444]">
              {'// SYSTEM FAULT'}
              <span
                aria-hidden
                className="ml-2 inline-block h-[12px] w-[7px] translate-y-[1px] bg-[#EF4444] t-anim-blink motion-reduce:animate-none"
              />
            </p>
            <p className="mt-6 max-w-md font-mono text-[11px] leading-6 tracking-[0.12em] text-[var(--t-sub)]">
              {messages.authGate.systemFaultHint}
            </p>
            <div aria-hidden className="mt-10 h-px w-40 bg-[var(--t-noise)]" />
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
