'use client';

import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef, type ReactElement, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { UI_LAYER_CLASS } from '@/components/ui/layers';

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export const TooltipContent = forwardRef<
  ElementRef<typeof TooltipPrimitive.Content>,
  ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 8, collisionPadding = 8, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      collisionPadding={collisionPadding}
      className={cn(
        'skynet-floating-content max-w-[280px] border border-border bg-surface-2 px-3 py-2',
        'font-mono text-[11px] leading-relaxed text-text-secondary shadow-none',
        UI_LAYER_CLASS.tooltip,
        className,
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

interface TerminalTooltipProps {
  children: ReactElement;
  content: ReactNode;
  side?: ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>['side'];
  align?: ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>['align'];
  disabled?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  contentClassName?: string;
}

export function TerminalTooltip({
  children,
  content,
  side = 'top',
  align = 'center',
  disabled = false,
  open,
  onOpenChange,
  contentClassName,
}: TerminalTooltipProps) {
  if (disabled) return children;
  return (
    <Tooltip open={open} onOpenChange={onOpenChange}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} align={align} className={contentClassName}>
        {content}
      </TooltipContent>
    </Tooltip>
  );
}
