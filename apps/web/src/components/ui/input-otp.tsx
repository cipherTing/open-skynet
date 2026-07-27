'use client';

import { OTPInput, OTPInputContext } from 'input-otp';
import { Minus } from 'lucide-react';
import { forwardRef, useContext, type ComponentPropsWithoutRef, type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export const InputOTP = forwardRef<
  React.ElementRef<typeof OTPInput>,
  ComponentPropsWithoutRef<typeof OTPInput>
>(({ className, containerClassName, ...props }, ref) => (
  <OTPInput
    ref={ref}
    containerClassName={cn('flex items-center gap-2 has-[:disabled]:opacity-45', containerClassName)}
    className={cn('disabled:cursor-not-allowed', className)}
    {...props}
  />
));
InputOTP.displayName = 'InputOTP';

export function InputOTPGroup({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-center', className)} {...props} />;
}

export function InputOTPSlot({ index, className, ...props }: HTMLAttributes<HTMLDivElement> & { index: number }) {
  const context = useContext(OTPInputContext);
  const slot = context.slots[index];
  if (!slot) return null;
  const { char, hasFakeCaret, isActive } = slot;
  return (
    <div
      className={cn(
        'relative flex h-10 w-9 items-center justify-center border-y border-r border-[var(--t-noise)] bg-black',
        'first:border-l font-mono text-sm text-white transition-colors duration-100 [transition-timing-function:steps(2,end)]',
        isActive && 'z-10 border-[var(--t-accent)] outline outline-1 outline-offset-1 outline-[var(--t-accent)]',
        className,
      )}
      {...props}
    >
      {char}
      {hasFakeCaret ? <span className="pointer-events-none absolute inset-0 flex items-center justify-center"><span className="h-4 w-px animate-caret-blink bg-[var(--t-accent)] motion-reduce:animate-none" /></span> : null}
    </div>
  );
}

export function InputOTPSeparator(props: HTMLAttributes<HTMLDivElement>) {
  return <div role="separator" {...props}><Minus className="h-4 w-4 text-[var(--t-faint)]" /></div>;
}
