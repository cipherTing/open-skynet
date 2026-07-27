'use client';

import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export type TInputProps = InputHTMLAttributes<HTMLInputElement>;

/** 终端输入框：统一使用全站暗色表单令牌，避免浏览器自动填充覆盖主题。 */
export const TInput = forwardRef<HTMLInputElement, TInputProps>(({ className, ...props }, ref) => {
  return (
    <input
      ref={ref}
      className={cn(
        'skynet-input block w-full rounded-none px-3 py-2',
        'font-mono text-[12px] tracking-[0.08em]',
        'caret-[var(--t-accent)] outline-none',
        className,
      )}
      {...props}
    />
  );
});

TInput.displayName = 'TInput';
