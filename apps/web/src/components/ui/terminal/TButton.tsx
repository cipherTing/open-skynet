'use client';

import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export type TButtonVariant = 'primary' | 'secondary' | 'danger';
export type TButtonSize = 'sm' | 'md';

export interface TButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-1.5 rounded-none border bg-transparent',
    'whitespace-nowrap font-mono text-[11px] font-semibold uppercase tracking-[0.15em] select-none',
    'transition-[color,background-color,border-color] duration-100 [transition-timing-function:steps(2,end)]',
    'focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[var(--t-accent)]',
    'disabled:pointer-events-none disabled:opacity-45',
  ],
  {
    variants: {
      variant: {
        primary:
          'border-[var(--t-accent)] text-[var(--t-accent)] hover:bg-[var(--t-accent)] hover:text-black',
        secondary:
          'border-[var(--t-noise)] text-white/70 hover:border-[var(--t-faint)] hover:text-[var(--t-accent)]',
        danger:
          'border-[var(--t-hazard-dim)] text-[var(--t-hazard)]/80 hover:border-[var(--t-hazard)]/60 hover:bg-[var(--t-hazard-dim)]/40 hover:text-[var(--t-hazard)]',
      },
      size: {
        sm: 'h-7 px-2.5',
        md: 'h-9 px-4',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

/** 终端按钮：直角、等宽大写 11px、steps(2) 硬过渡。 */
export const TButton = forwardRef<HTMLButtonElement, TButtonProps>(
  ({ asChild = false, variant, size, type = 'button', className, ...props }, ref) => {
    const Component = asChild ? Slot : 'button';
    return (
      <Component
        ref={ref}
        type={asChild ? undefined : type}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);

TButton.displayName = 'TButton';
