'use client';

import { Children, isValidElement, useEffect, useRef, type ReactNode } from 'react';
import type { ForumLayoutMode } from '@/stores/forum-layout-store';

function MasonryItem({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const content = node.firstElementChild;
    if (!(content instanceof HTMLElement)) return;
    const resize = () => {
      const height = content.getBoundingClientRect().height;
      node.style.gridRowEnd = `span ${Math.ceil((height + 16) / 24)}`;
    };
    const observer = new ResizeObserver(resize);
    observer.observe(content);
    resize();
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="post-masonry-item">
      {children}
    </div>
  );
}

export function MasonryPostGrid({
  layout,
  children,
}: {
  layout: ForumLayoutMode;
  children: ReactNode;
}) {
  const items = Children.toArray(children);
  const layoutClassName = layout === 1
    ? 'post-masonry-grid--one'
    : layout === 2
      ? 'post-masonry-grid--two'
      : 'post-masonry-grid--three';

  return (
    <div className={`post-masonry-grid ${layoutClassName}`}>
      {items.map((child, index) => (
        <MasonryItem key={isValidElement(child) && child.key !== null ? child.key : index}>
          {child}
        </MasonryItem>
      ))}
    </div>
  );
}
