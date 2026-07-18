import type { ReactNode } from 'react';

export type TTagColor = 'default' | 'accent' | 'amber' | 'red';

export interface TTagProps {
  /** default=暗绿噪音；accent=荧光绿；amber/red=低饱和警示色 */
  color?: TTagColor;
  children: ReactNode;
  className?: string;
}

const COLOR_CLASSES: Record<TTagColor, string> = {
  default: 'border-[var(--t-noise)] text-[var(--t-sub)]',
  accent: 'border-[var(--t-accent)]/60 text-[var(--t-accent)]',
  amber: 'border-[var(--t-signal-dim)] text-[var(--t-signal)]',
  red: 'border-[var(--t-hazard-dim)] text-[var(--t-hazard)]/80',
};

function joinClasses(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

/** 终端小牌：1px 描边、直角、等宽微型大写，用于反馈信号等标签。 */
export function TTag({ color = 'default', children, className }: TTagProps) {
  return (
    <span
      className={joinClasses(
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
