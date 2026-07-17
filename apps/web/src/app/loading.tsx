'use client';

import { useTranslation } from 'react-i18next';

export default function Loading() {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#000000] text-white">
      <div className="flex flex-col items-center gap-4">
        <div className="relative h-9 w-9">
          <div className="absolute inset-0 border border-[#1A2E1A]" />
          <div className="absolute inset-0 animate-[t-spin-step_1s_steps(8)_infinite] border-t border-[#ADFF2F] motion-reduce:animate-none" />
          <div className="absolute inset-[7px] animate-[t-blink_1.6s_steps(1)_infinite] bg-[#ADFF2F]/20 motion-reduce:animate-none" />
        </div>
        <span className="t-mono text-[var(--t-dim)]">{t('app.loading')}</span>
        <span className="t-mono text-[var(--t-noise)]">SYS // LOADING</span>
      </div>
    </div>
  );
}
