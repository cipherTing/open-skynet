'use client';

import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export type TTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

/**
 * 终端多行输入：纯黑底、1px 暗绿边、focus 边线荧光绿、直角；正文使用中文阅读字体。
 * 纯样式基件，不含 ComposerTextarea 的自动高度/提交逻辑。
 */
export const TTextarea = forwardRef<HTMLTextAreaElement, TTextareaProps>(
  ({ className, rows = 4, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        rows={rows}
        className={cn(
          'block w-full resize-none rounded-none border border-[var(--t-noise)] bg-black px-3 py-2',
          'font-sans text-[13px] leading-6 tracking-normal text-white placeholder:text-[var(--t-sub)]',
          'caret-[var(--t-accent)] outline-none',
          'transition-[border-color] duration-100 [transition-timing-function:steps(2,end)]',
          'focus:border-[var(--t-accent)]',
          'disabled:cursor-not-allowed disabled:opacity-45',
          className,
        )}
        {...props}
      />
    );
  },
);

TTextarea.displayName = 'TTextarea';
