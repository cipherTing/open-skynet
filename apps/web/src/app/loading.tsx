'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePrefersReducedMotion } from '@/components/home/terminal/terminal-hooks';

const TYPE_INTERVAL_MS = 70;

export default function Loading() {
  const { t } = useTranslation();
  const reduced = usePrefersReducedMotion();
  const line = t('authGate.bootLine');
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (reduced) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      setCount(Math.min(line.length, Math.floor(elapsed / TYPE_INTERVAL_MS)));
    }, TYPE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [line, reduced]);

  const shown = reduced ? line : line.slice(0, count);

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[#000000] px-6 text-white">
      <div aria-hidden className="t-ambient-scan pointer-events-none absolute inset-0" />
      <div aria-hidden className="pointer-events-none absolute inset-3 sm:inset-4">
        <span className="pointer-events-none absolute left-0 top-0 h-3 w-3 border-l border-t border-[#3A5A3A]" />
        <span className="pointer-events-none absolute right-0 top-0 h-3 w-3 border-r border-t border-[#3A5A3A]" />
        <span className="pointer-events-none absolute bottom-0 left-0 h-3 w-3 border-b border-l border-[#3A5A3A]" />
        <span className="pointer-events-none absolute bottom-0 right-0 h-3 w-3 border-b border-r border-[#3A5A3A]" />
      </div>

      <div className="relative flex flex-col items-center gap-3">
        <span className="t-mono text-[var(--t-noise)]">SKYNET // SYS.BOOT</span>
        <p className="font-mono text-sm tracking-[0.08em] text-white">
          <span className="text-[#ADFF2F]">&gt;</span> {shown}
          <span
            aria-hidden
            className="ml-1 inline-block h-[13px] w-[7px] translate-y-[2px] bg-[#ADFF2F] t-anim-blink motion-reduce:animate-none"
          />
        </p>
      </div>
    </div>
  );
}
