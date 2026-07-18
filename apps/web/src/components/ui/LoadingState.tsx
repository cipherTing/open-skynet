'use client';

import { useEffect, useState } from 'react';
import { Radio } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { TButton, TEmpty } from '@/components/ui/terminal';
import { usePrefersReducedMotion } from '@/components/home/terminal/terminal-hooks';

type LoadingScreenProps = {
  label?: string;
  compact?: boolean;
};

type FeedbackStateProps = {
  title?: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

/** 语言中性的技术符号引导行（与 DeckBootSequence 同款手法）；真实文案仍走 label/i18n */
const BOOT_LINES = [
  '> mount /deck .............. OK',
  '> link terminal ............ OK',
] as const;
const LINE_DELAYS_MS = [0, 170, 340];
/** 引导行播完后再落 label 提示行 */
const BOOT_DONE_COUNT = BOOT_LINES.length + 1;

const STATUS_PATTERN = /(OK|PASS)$/;

export function LoadingScreen({ label, compact = false }: LoadingScreenProps) {
  const { t } = useTranslation();
  const text = label ?? t('app.loading');

  if (compact) {
    return (
      <div className="flex min-h-[180px] items-center justify-center bg-black py-8">
        <BootPromptLine label={text} />
      </div>
    );
  }

  return <BootScreen label={text} />;
}

export function InlineLoading({ label }: { label?: string }) {
  const { t } = useTranslation();

  return (
    <div className="flex justify-center py-6">
      <BootPromptLine label={label ?? t('app.loading')} dim />
    </div>
  );
}

export function ErrorState({ title, message, actionLabel, onAction }: FeedbackStateProps) {
  const { t } = useTranslation();

  return (
    <div className="t-corner relative flex flex-col items-center justify-center gap-3 border border-[var(--t-noise)] bg-black p-8 text-center">
      <div className="flex h-10 w-10 items-center justify-center border border-[var(--t-hazard-dim)] bg-[var(--t-hazard-dim)]/20 text-[var(--t-hazard)]">
        <Radio className="h-4 w-4" />
      </div>
      <div>
        {title && <p className="mb-1 font-mono text-[12px] font-bold uppercase tracking-[0.15em] text-[var(--t-hazard)]">{title}</p>}
        <p className="font-mono text-[11px] tracking-[0.08em] text-[var(--t-sub)]">{message}</p>
      </div>
      {onAction && (
        <TButton variant="secondary" size="sm" onClick={onAction}>
          {actionLabel ?? t('app.retry')}
        </TButton>
      )}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return <TEmpty message={message} />;
}

/** 全屏终端开机序列：纯黑底 + 扫描线氛围 + 四角角标 + 逐行步进引导行 + label 提示行 */
function BootScreen({ label }: { label: string }) {
  const reducedMotion = usePrefersReducedMotion();
  const [visibleLines, setVisibleLines] = useState(0);
  // prefers-reduced-motion：渲染期直接派生最终静态状态（全量行 + label 行），effect 内不同步 setState
  const shownLines = reducedMotion ? BOOT_DONE_COUNT : visibleLines;

  useEffect(() => {
    if (reducedMotion) return undefined;
    const timers = LINE_DELAYS_MS.map((delay, index) =>
      window.setTimeout(() => setVisibleLines(index + 1), delay),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [reducedMotion]);

  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-black px-6"
      role="status"
    >
      <div aria-hidden className="t-ambient-scan pointer-events-none absolute inset-0" />
      <div aria-hidden className="pointer-events-none absolute inset-3 sm:inset-4">
        <span className="pointer-events-none absolute left-0 top-0 h-3 w-3 border-l border-t border-[var(--t-faint)]" />
        <span className="pointer-events-none absolute right-0 top-0 h-3 w-3 border-r border-t border-[var(--t-faint)]" />
        <span className="pointer-events-none absolute bottom-0 left-0 h-3 w-3 border-b border-l border-[var(--t-faint)]" />
        <span className="pointer-events-none absolute bottom-0 right-0 h-3 w-3 border-b border-r border-[var(--t-faint)]" />
      </div>

      <div className="relative flex flex-col gap-4">
        <span aria-hidden className="t-mono text-[var(--t-faint)]">SKYNET // SYS.BOOT</span>
        <div className="font-mono text-[11px] leading-6 tracking-[0.15em] sm:text-xs">
          <div aria-hidden>
            {BOOT_LINES.slice(0, shownLines).map((line) => (
              <BootLine key={line} line={line} />
            ))}
            {shownLines < BOOT_DONE_COUNT && (
              <span className="t-anim-blink mt-1 inline-block h-3 w-2.5 bg-[var(--t-accent)] motion-reduce:animate-none" />
            )}
          </div>
          {shownLines >= BOOT_DONE_COUNT && <BootPromptLine label={label} />}
        </div>
      </div>
    </div>
  );
}

/** 单行引导行：白色等宽字符，尾部 OK/PASS 状态荧光绿高亮 */
function BootLine({ line }: { line: string }) {
  const statusMatch = line.match(STATUS_PATTERN);
  return (
    <p className="whitespace-pre text-white">
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
}

/** 提示行：荧光绿 `>` 提示符 + label 文案 + 硬闪烁方块光标 */
function BootPromptLine({ label, dim = false }: { label: string; dim?: boolean }) {
  return (
    <p
      className={`font-mono text-[11px] uppercase tracking-[0.15em] ${dim ? 'text-[var(--t-faint)]' : 'text-white'}`}
    >
      <span className="text-[var(--t-accent)]">&gt;</span> {label}
      <span
        aria-hidden
        className="t-anim-blink ml-1 inline-block h-[11px] w-[6px] translate-y-[1px] bg-[var(--t-accent)] motion-reduce:animate-none"
      />
    </p>
  );
}
