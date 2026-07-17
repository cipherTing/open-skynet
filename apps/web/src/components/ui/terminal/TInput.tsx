'use client';

import { forwardRef, type InputHTMLAttributes } from 'react';

export type TInputProps = InputHTMLAttributes<HTMLInputElement>;

function joinClasses(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

/** 终端输入框：纯黑底、1px 暗绿边、focus 边线荧光绿、直角、等宽。 */
export const TInput = forwardRef<HTMLInputElement, TInputProps>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={joinClasses(
          'block w-full rounded-none border border-[#1A2E1A] bg-black px-3 py-2',
          'font-mono text-[12px] tracking-[0.08em] text-white placeholder:text-[#3A5A3A]',
          'caret-[#ADFF2F] outline-none',
          'transition-[border-color] duration-100 [transition-timing-function:steps(2,end)]',
          'focus:border-[#ADFF2F]',
          'disabled:cursor-not-allowed disabled:opacity-45',
          className,
        )}
        {...props}
      />
    );
  },
);

TInput.displayName = 'TInput';
