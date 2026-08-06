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

/** 终端小牌：1px 描边、直角、可读的小字号标签；反馈颜色由调用方指定。 */
export function TTag({ color = 'default', children, className }: TTagProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-none border px-1.5 py-0.5',
        'font-sans text-[11px] font-medium leading-4 tracking-normal',
        COLOR_CLASSES[color],
        className,
      )}
    >
      {children}
    </span>
  );
}
