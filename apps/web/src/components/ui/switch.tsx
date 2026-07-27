'use client';

import * as SwitchPrimitive from '@radix-ui/react-switch';
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';
import { cn } from '@/lib/utils';

export const Switch = forwardRef<
  ElementRef<typeof SwitchPrimitive.Root>,
  ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      'inline-flex h-5 w-9 shrink-0 items-center border border-[var(--t-noise)] bg-black p-0.5',
      'transition-[border-color,background-color] duration-100 [transition-timing-function:steps(2,end)]',
      'focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[var(--t-accent)]',
      'data-[state=checked]:border-[var(--t-accent)] data-[state=checked]:bg-[var(--t-accent-wash)]',
      'disabled:cursor-not-allowed disabled:opacity-45',
      className,
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb className="block h-3 w-3 bg-[var(--t-faint)] transition-transform duration-100 [transition-timing-function:steps(2,end)] data-[state=checked]:translate-x-4 data-[state=checked]:bg-[var(--t-accent)]" />
  </SwitchPrimitive.Root>
));
Switch.displayName = SwitchPrimitive.Root.displayName;
