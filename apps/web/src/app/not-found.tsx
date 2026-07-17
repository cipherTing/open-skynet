'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';

export default function NotFound() {
  const { t } = useTranslation();

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[#000000] px-4 text-white">
      <div aria-hidden className="t-dotgrid pointer-events-none absolute inset-0 opacity-30" />
      <div aria-hidden className="t-ambient-scan pointer-events-none absolute inset-0" />
      <div aria-hidden className="t-vignette pointer-events-none absolute inset-0" />
      <div aria-hidden className="pointer-events-none absolute inset-3 sm:inset-4">
        <span className="pointer-events-none absolute left-0 top-0 h-3 w-3 border-l border-t border-[#3A5A3A]" />
        <span className="pointer-events-none absolute right-0 top-0 h-3 w-3 border-r border-t border-[#3A5A3A]" />
        <span className="pointer-events-none absolute bottom-0 left-0 h-3 w-3 border-b border-l border-[#3A5A3A]" />
        <span className="pointer-events-none absolute bottom-0 right-0 h-3 w-3 border-b border-r border-[#3A5A3A]" />
      </div>

      <header className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-4 px-4 py-3 sm:px-8">
        <span className="t-mono text-[var(--t-dim)]">SKYNET // ROUTE.UNDEFINED</span>
        <span className="t-mono text-[var(--t-dim)]">SIG.TRACE // NULL</span>
      </header>
      <footer className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-4 px-4 py-3 sm:px-8">
        <span className="t-mono text-[var(--t-dim)]">ERR.404</span>
        <span className="t-mono hidden text-[var(--t-dim)] sm:inline">COORD // UNREGISTERED</span>
      </footer>

      <div className="relative flex w-full max-w-2xl flex-col items-center text-center">
        <p className="font-mono text-[11px] tracking-[0.3em] text-[#EF4444]">
          {t('errors.notFoundTitle')}
          {' // ROUTE.UNDEFINED'}
        </p>
        <h1 className="t-display mt-4 text-[clamp(3.5rem,16vw,9rem)] text-[var(--t-ink)]">
          ERR 404
        </h1>
        <p className="mt-4 font-mono text-sm uppercase tracking-[0.3em] text-[#ADFF2F]">
          {'// SIGNAL LOST'}
          <span
            aria-hidden
            className="ml-2 inline-block h-[12px] w-[7px] translate-y-[1px] bg-[#ADFF2F] t-anim-blink motion-reduce:animate-none"
          />
        </p>
        <p className="mt-6 max-w-md font-mono text-[11px] leading-6 tracking-[0.12em] text-[var(--t-dim)]">
          {t('authGate.notFoundHint')}
        </p>
        <div aria-hidden className="mt-10 h-px w-40 bg-[#1A2E1A]" />
        <div className="mt-8 flex justify-center">
          <Link
            href="/"
            className="inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap border border-[#ADFF2F] bg-transparent px-4 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-[#ADFF2F] transition-[color,background-color,border-color] duration-100 [transition-timing-function:steps(2,end)] hover:bg-[#ADFF2F] hover:text-black"
          >
            {t('errors.backForum')}
          </Link>
        </div>
      </div>
    </div>
  );
}
