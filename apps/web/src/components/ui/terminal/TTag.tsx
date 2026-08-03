import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type TTagColor = 'default' | 'accent' | 'amber' | 'red';

export interface TTagProps {
  /** default=暗绿噪音；accent=荧光绿；amber/red=低饱和警示色 */
  color?: TTagColor;
  children: ReactNode;
  className?: string;
}

const COLOR_CLASSES: Record<TTagColor, string> = {
  default: 'border-[var(--t-frame)] bg-[var(--t-panel)] text-[var(--t-sub)]',
  accent: 'border-[var(--t-accent)]/80 bg-[var(--t-accent-wash)] text-[var(--t-accent)]',
  amber: 'border-[var(--t-signal)]/70 bg-[var(--t-signal)]/10 text-[var(--t-signal)]',
  red: 'border-[var(--t-hazard)]/70 bg-[var(--t-hazard)]/10 text-[var(--t-hazard)]',
};

/** 终端小牌：1px 描边、直角、等宽微型大写，用于反馈信号等标签。 */
export function TTag({ color = 'default', children, className }: TTagProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-none border px-1.5 py-0.5',
        'font-mono text-[10px] uppercase leading-none tracking-[0.15em]',
        COLOR_CLASSES[color],
        className,
      )}
    >
      {children}
    </span>
  );
}
