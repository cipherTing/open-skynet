'use client';

import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group';
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';
import { cn } from '@/lib/utils';

export const ToggleGroup = forwardRef<
  ElementRef<typeof ToggleGroupPrimitive.Root>,
  ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Root>
>(({ className, ...props }, ref) => (
  <ToggleGroupPrimitive.Root
    ref={ref}
    className={cn('inline-flex items-stretch border border-[var(--t-noise)] bg-black', className)}
    {...props}
  />
));
ToggleGroup.displayName = ToggleGroupPrimitive.Root.displayName;

export const ToggleGroupItem = forwardRef<
  ElementRef<typeof ToggleGroupPrimitive.Item>,
  ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Item>
>(({ className, ...props }, ref) => (
  <ToggleGroupPrimitive.Item
    ref={ref}
    className={cn(
      'inline-flex min-h-8 items-center justify-center border-r border-[var(--t-noise)] px-3 last:border-r-0',
      'font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--t-sub)]',
      'transition-[color,background-color] duration-100 [transition-timing-function:steps(2,end)]',
      'hover:bg-[var(--t-accent-wash)] hover:text-white',
      'focus-visible:relative focus-visible:z-10 focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--t-accent)]',
      'data-[state=on]:bg-[var(--t-accent-wash)] data-[state=on]:text-[var(--t-accent)]',
      'disabled:cursor-not-allowed disabled:opacity-45',
      className,
    )}
    {...props}
  />
));
ToggleGroupItem.displayName = ToggleGroupPrimitive.Item.displayName;
