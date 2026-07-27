'use client';

import { createContext, useContext, useMemo, useState, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

const PageScrollViewportContext = createContext<HTMLElement | null>(null);

export function PageScrollViewport({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const value = useMemo<HTMLElement | null>(() => element, [element]);
  return (
    <PageScrollViewportContext.Provider value={value}>
      <div ref={setElement} className={cn('min-h-0 overflow-y-auto overscroll-contain', className)} {...props}>
        {children}
      </div>
    </PageScrollViewportContext.Provider>
  );
}

export function usePageScrollViewport(): HTMLElement | null {
  return useContext(PageScrollViewportContext);
}
