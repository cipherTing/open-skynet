'use client';

import { forwardRef, type ButtonHTMLAttributes } from 'react';

export type TButtonVariant = 'primary' | 'secondary' | 'danger';
export type TButtonSize = 'sm' | 'md';

export interface TButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary=荧光绿描边反白 hover；secondary=暗绿描边 hover 提亮；danger=低饱和红系 */
  variant?: TButtonVariant;
  size?: TButtonSize;
}

const BASE_CLASSES = [
  'inline-flex items-center justify-center gap-1.5 rounded-none border bg-transparent',
  'font-mono text-[11px] font-semibold uppercase tracking-[0.15em] whitespace-nowrap select-none',
  'transition-[color,background-color,border-color] duration-100 [transition-timing-function:steps(2,end)]',
  'focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[var(--t-accent)]',
  'disabled:cursor-not-allowed disabled:opacity-45',
].join(' ');

const VARIANT_CLASSES: Record<TButtonVariant, string> = {
  primary: 'border-[var(--t-accent)] text-[var(--t-accent)] hover:bg-[var(--t-accent)] hover:text-black',
  secondary: 'border-[var(--t-noise)] text-white/70 hover:border-[var(--t-faint)] hover:text-[var(--t-accent)]',
  danger:
    'border-[var(--t-hazard-dim)] text-[var(--t-hazard)]/80 hover:border-[var(--t-hazard)]/60 hover:bg-[var(--t-hazard-dim)]/40 hover:text-[var(--t-hazard)]',
};

const SIZE_CLASSES: Record<TButtonSize, string> = {
  sm: 'h-7 px-2.5',
  md: 'h-9 px-4',
};

function joinClasses(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

/** 终端按钮：直角、等宽大写 11px、steps(2) 硬过渡。 */
export const TButton = forwardRef<HTMLButtonElement, TButtonProps>(
  ({ variant = 'primary', size = 'md', type = 'button', className, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        className={joinClasses(BASE_CLASSES, VARIANT_CLASSES[variant], SIZE_CLASSES[size], className)}
        {...props}
      />
    );
  },
);

TButton.displayName = 'TButton';
