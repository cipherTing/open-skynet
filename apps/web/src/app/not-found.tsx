'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';

export default function NotFound() {
  const { t } = useTranslation();

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[#000000] px-4 text-white">
      <div aria-hidden className="t-dotgrid pointer-events-none absolute inset-0 opacity-30" />
      <div aria-hidden className="t-vignette pointer-events-none absolute inset-0" />

      <div className="t-corner t-hairline relative w-full max-w-lg bg-[#040704] px-6 py-10 text-center sm:px-10">
        <p className="t-mono text-[var(--t-dim)]">ERR // {t('errors.notFoundTitle')}</p>
        <p className="t-display mt-6 text-[clamp(5rem,22vw,9rem)] text-[var(--t-ink)]">404</p>
        <p className="t-mono mt-6 text-[var(--t-dim)]">{t('errors.notFoundMessage')}</p>
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
