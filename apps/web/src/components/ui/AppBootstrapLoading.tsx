'use client';

import { useEffect, useState } from 'react';
import { usePrefersReducedMotion } from '@/components/home/terminal/terminal-hooks';

/**
 * i18n 就绪前的全局开机 veil：语言中性 ASCII 引导行（英文终端风），禁止依赖 i18n。
 * 视觉手法与 DeckBootSequence 一致：纯黑底、等宽字符、荧光绿状态、逐行步进、方块光标。
 */
const BOOT_LINES = [
  '> cpu: q-core .............. OK',
  '> mem: 640K ................ OK',
  '> mount /locale ............ OK',
  '> mount /workspace ......... OK',
  '> crc32 0x8F2E-D41A ........ PASS',
  '> boot skynet.os',
] as const;
const LINE_DELAYS_MS = [0, 140, 280, 420, 560, 700];

const STATUS_PATTERN = /(OK|PASS)$/;

export function AppBootstrapLoading() {
  const reducedMotion = usePrefersReducedMotion();
  const [visibleLines, setVisibleLines] = useState(0);
  // prefers-reduced-motion：渲染期直接派生最终静态状态（全量行），effect 内不同步 setState
  const shownLines = reducedMotion ? BOOT_LINES.length : visibleLines;

  useEffect(() => {
    if (reducedMotion) return undefined;
    const timers = LINE_DELAYS_MS.map((delay, index) =>
      window.setTimeout(() => setVisibleLines(index + 1), delay),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [reducedMotion]);

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-hidden bg-black px-6"
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">Loading</span>
      <div aria-hidden className="t-ambient-scan pointer-events-none absolute inset-0" />
      <div aria-hidden className="pointer-events-none absolute inset-3 sm:inset-4">
        <span className="pointer-events-none absolute left-0 top-0 h-3 w-3 border-l border-t border-[var(--t-faint)]" />
        <span className="pointer-events-none absolute right-0 top-0 h-3 w-3 border-r border-t border-[var(--t-faint)]" />
        <span className="pointer-events-none absolute bottom-0 left-0 h-3 w-3 border-b border-l border-[var(--t-faint)]" />
        <span className="pointer-events-none absolute bottom-0 right-0 h-3 w-3 border-b border-r border-[var(--t-faint)]" />
      </div>

      <div aria-hidden className="relative flex flex-col gap-4">
        <span className="t-mono text-[var(--t-faint)]">SKYNET // TERMINAL.BIOS</span>
        <div className="font-mono text-[11px] leading-6 tracking-[0.15em] sm:text-xs">
          {BOOT_LINES.slice(0, shownLines).map((line) => {
            const statusMatch = line.match(STATUS_PATTERN);
            return (
              <p key={line} className="whitespace-pre text-white">
                {statusMatch ? (
                  <>
                    {line.slice(0, statusMatch.index ?? line.length)}
                    <span className="text-[var(--t-accent)]">{statusMatch[0]}</span>
                  </>
                ) : (
                  line
                )}
              </p>
            );
          })}
          <span className="t-anim-blink mt-1 inline-block h-3 w-2.5 bg-[var(--t-accent)] motion-reduce:animate-none" />
        </div>
      </div>
    </div>
  );
}
