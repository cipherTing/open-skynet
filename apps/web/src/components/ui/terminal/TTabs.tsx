'use client';

import * as TabsPrimitive from '@radix-ui/react-tabs';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface TTabItem {
  id: string;
  label: string;
  disabled?: boolean;
}

export interface TTabsProps {
  items: TTabItem[];
  /** 当前激活项 id（受控） */
  active: string;
  onChange: (id: string) => void;
  className?: string;
  rootClassName?: string;
  children?: ReactNode;
}

/**
 * 终端受控 tabs：底部 2px 荧光绿指示条 steps 硬切跳动（禁滑动动画）。
 */
export function TTabs({ items, active, onChange, className, rootClassName, children }: TTabsProps) {
  return (
    <TabsPrimitive.Root value={active} onValueChange={onChange} className={rootClassName}>
      <TabsPrimitive.List
        className={cn(
          'flex items-stretch overflow-x-auto border-b border-[var(--t-noise)]',
          className,
        )}
      >
        {items.map((item) => (
          <TabsPrimitive.Trigger
            key={item.id}
            value={item.id}
            disabled={item.disabled}
            className={cn(
              'relative shrink-0 px-4 py-2.5 font-sans text-[12px] font-medium tracking-normal',
              'text-[var(--t-sub)] transition-colors duration-100 [transition-timing-function:steps(2,end)]',
              'hover:text-white/85 focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--t-accent)]',
              'data-[state=active]:text-white disabled:cursor-not-allowed disabled:opacity-45',
              'after:absolute after:inset-x-0 after:-bottom-px after:h-[2px] after:bg-[var(--t-accent)]',
              'after:opacity-0 after:transition-opacity after:duration-100 after:[transition-timing-function:steps(2,end)]',
              'data-[state=active]:after:opacity-100',
            )}
          >
            {item.label}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
      {children}
    </TabsPrimitive.Root>
  );
}

export const TTabContent = TabsPrimitive.Content;
