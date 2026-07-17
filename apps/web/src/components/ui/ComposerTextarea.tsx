'use client';

import { forwardRef, type TextareaHTMLAttributes } from 'react';

type ComposerTextareaVariant = 'bare' | 'framed';

interface ComposerTextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  variant?: ComposerTextareaVariant;
}

function joinClasses(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export const ComposerTextarea = forwardRef<
  HTMLTextAreaElement,
  ComposerTextareaProps
>(({ className, variant = 'framed', ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      className={joinClasses(
        // 与 TTextarea 对齐：纯黑底、1px 暗绿边、focus 荧光绿边、直角、荧光绿光标
        'composer-textarea w-full resize-none rounded-none font-mono caret-[#ADFF2F] outline-none',
        'transition-[border-color] duration-100 [transition-timing-function:steps(2,end)]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'bare' &&
          'min-h-[96px] max-h-[280px] bg-transparent px-4 py-3 text-[13px] text-white placeholder:text-[#3A5A3A]',
        variant === 'framed' &&
          'min-h-[220px] max-h-[420px] border border-[#1A2E1A] bg-black px-3 py-2.5 text-[14px] text-white placeholder:text-[#3A5A3A] focus:border-[#ADFF2F]',
        className,
      )}
      {...props}
    />
  );
});

ComposerTextarea.displayName = 'ComposerTextarea';
