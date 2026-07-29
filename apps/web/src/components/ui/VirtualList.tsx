'use client';

import { defaultRangeExtractor, useVirtualizer, type Range } from '@tanstack/react-virtual';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/utils';

const DEFAULT_OVERSCAN = 6;
const DEFAULT_LANES = 1;
const DEFAULT_GAP = 0;
const NEAR_END_PREFETCH_ITEM_COUNT = 5;

interface VirtualListProps<TItem> {
  items: TItem[];
  scrollElement: HTMLElement | null;
  getItemKey: (item: TItem) => string;
  estimateSize: () => number;
  renderItem: (item: TItem, index: number) => ReactNode;
  onNearEnd?: () => void;
  overscan?: number;
  className?: string;
  itemClassName?: string;
  ariaLabel?: string;
  layoutVersion?: string | number | boolean;
  initialOffset?: number | (() => number);
  tail?: ReactNode;
  lanes?: number;
  gap?: number;
}

export function VirtualList<TItem>({
  items,
  scrollElement,
  getItemKey,
  estimateSize,
  renderItem,
  onNearEnd,
  overscan = DEFAULT_OVERSCAN,
  className,
  itemClassName,
  ariaLabel,
  layoutVersion,
  initialOffset,
  tail,
  lanes = DEFAULT_LANES,
  gap = DEFAULT_GAP,
}: VirtualListProps<TItem>) {
  'use no memo';
  const listRef = useRef<HTMLDivElement | null>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

  const measureScrollMargin = useCallback(() => {
    const list = listRef.current;
    if (!list || !scrollElement) {
      setScrollMargin(0);
      return;
    }
    const listRect = list.getBoundingClientRect();
    const scrollRect = scrollElement.getBoundingClientRect();
    setScrollMargin(listRect.top - scrollRect.top + scrollElement.scrollTop);
  }, [scrollElement]);

  useLayoutEffect(() => {
    measureScrollMargin();
    if (!scrollElement || !listRef.current) return undefined;
    const observer = new ResizeObserver(measureScrollMargin);
    observer.observe(scrollElement);
    window.addEventListener('resize', measureScrollMargin);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measureScrollMargin);
    };
  }, [layoutVersion, measureScrollMargin, scrollElement]);

  const rangeExtractor = useCallback(
    (range: Range) => {
      const indexes = defaultRangeExtractor(range);
      if (focusedIndex === null || focusedIndex >= items.length || indexes.includes(focusedIndex)) {
        return indexes;
      }
      return [...indexes, focusedIndex].sort((left, right) => left - right);
    },
    [focusedIndex, items.length],
  );

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollElement,
    estimateSize,
    getItemKey: (index) => {
      const item = items[index];
      if (!item) throw new Error(`VirtualList item ${index} is missing`);
      return getItemKey(item);
    },
    overscan,
    rangeExtractor,
    scrollMargin,
    initialOffset,
    lanes,
    gap,
    laneAssignmentMode: lanes > 1 ? 'measured' : 'estimate',
    useFlushSync: false,
    directDomUpdates: false,
  });
  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  useLayoutEffect(() => {
    virtualizer.measure();
  }, [lanes, layoutVersion, virtualizer]);

  useEffect(() => {
    if (!onNearEnd || items.length === 0) return;
    const lastVirtualIndex = virtualItems.reduce(
      (maximum, item) => Math.max(maximum, item.index),
      -1,
    );
    const nearLastItemIndex = Math.max(0, items.length - NEAR_END_PREFETCH_ITEM_COUNT - 1);
    if (lastVirtualIndex < nearLastItemIndex) return;

    const viewportStart = virtualizer.scrollOffset;
    const scrollRect = virtualizer.scrollRect;
    if (viewportStart === null || !scrollRect) return;
    const viewportEnd = viewportStart + scrollRect.height;
    const listEnd = scrollMargin + totalSize;
    const prefetchThreshold = estimateSize() * Math.ceil(NEAR_END_PREFETCH_ITEM_COUNT / lanes);
    const viewportTouchesListEnd =
      viewportStart <= listEnd && viewportEnd >= listEnd - prefetchThreshold;
    if (viewportTouchesListEnd) onNearEnd();
  }, [
    estimateSize,
    items.length,
    lanes,
    onNearEnd,
    scrollMargin,
    totalSize,
    virtualItems,
    virtualizer,
  ]);

  const laneWidth = lanes > 1 ? `calc((100% - ${(lanes - 1) * gap}px) / ${lanes})` : '100%';

  return (
    <div
      ref={listRef}
      role="list"
      aria-label={ariaLabel}
      className={cn('relative w-full', className)}
      onFocusCapture={(event) => {
        const item =
          event.target instanceof Element
            ? event.target.closest<HTMLElement>('[data-virtual-index]')
            : null;
        const index = item?.dataset.virtualIndex;
        if (index !== undefined) setFocusedIndex(Number(index));
      }}
      onBlurCapture={() => {
        window.requestAnimationFrame(() => {
          const activeElement = document.activeElement;
          if (!listRef.current?.contains(activeElement)) setFocusedIndex(null);
        });
      }}
    >
      <div className="relative w-full" style={{ height: `${totalSize}px` }}>
        {virtualItems.map((virtualItem) => {
          const item = items[virtualItem.index];
          if (!item) return null;
          const laneOffset =
            lanes > 1
              ? `calc(${(virtualItem.lane * 100) / lanes}% + ${(virtualItem.lane * gap) / lanes}px)`
              : '0px';
          return (
            <div
              key={virtualItem.key}
              ref={virtualizer.measureElement}
              data-index={virtualItem.index}
              data-virtual-index={virtualItem.index}
              role="listitem"
              className={cn('absolute top-0', itemClassName)}
              style={{
                left: laneOffset,
                width: laneWidth,
                transform: `translateY(${virtualItem.start - scrollMargin}px)`,
              }}
            >
              {renderItem(item, virtualItem.index)}
            </div>
          );
        })}
      </div>
      {tail ? <div role="listitem">{tail}</div> : null}
    </div>
  );
}
