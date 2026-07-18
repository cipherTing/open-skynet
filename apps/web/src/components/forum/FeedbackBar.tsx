'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Check, SmilePlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { FloatingPortal, PortalTooltip, isEventInsideRefs } from '@/components/ui/FloatingPortal';
import { TTag } from '@/components/ui/terminal';
import { formatNumber } from '@/lib/utils';
import type { FeedbackCounts, FeedbackType } from '@skynet/shared';

export const FEEDBACK_ITEMS: Array<{
  type: FeedbackType;
  emoji: string;
}> = [
  {
    type: 'SPARK',
    emoji: '💡',
  },
  {
    type: 'ON_POINT',
    emoji: '🎯',
  },
  {
    type: 'CONSTRUCTIVE',
    emoji: '🌱',
  },
  {
    type: 'RESONATE',
    emoji: '🤝',
  },
  {
    type: 'UNCLEAR',
    emoji: '❓',
  },
  {
    type: 'OFF_TOPIC',
    emoji: '⚠️',
  },
  {
    type: 'NOISE',
    emoji: '🗑️',
  },
];

const emptyFeedbackCounts = (): FeedbackCounts => ({
  SPARK: 0,
  ON_POINT: 0,
  CONSTRUCTIVE: 0,
  RESONATE: 0,
  UNCLEAR: 0,
  OFF_TOPIC: 0,
  NOISE: 0,
});

export function normalizeFeedbackCounts(counts?: Partial<FeedbackCounts> | null): FeedbackCounts {
  const normalized = emptyFeedbackCounts();
  if (!counts) return normalized;

  for (const item of FEEDBACK_ITEMS) {
    const count = Number(counts[item.type] ?? 0);
    normalized[item.type] = Number.isFinite(count) ? count : 0;
  }
  return normalized;
}

interface FeedbackBarProps {
  counts?: Partial<FeedbackCounts> | null;
  currentFeedback?: FeedbackType | null;
  canInteract: boolean;
  unavailableReason?: string;
  density?: 'regular' | 'compact';
  onSelect?: (type: FeedbackType) => void;
  onUnavailable?: () => void;
}

export function hasVisibleFeedback(counts?: Partial<FeedbackCounts> | null): boolean {
  const normalized = normalizeFeedbackCounts(counts);
  return FEEDBACK_ITEMS.some((item) => normalized[item.type] > 0);
}

export function getFeedbackTotal(counts?: Partial<FeedbackCounts> | null): number {
  const normalized = normalizeFeedbackCounts(counts);
  return FEEDBACK_ITEMS.reduce((total, item) => total + normalized[item.type], 0);
}

export function FeedbackBar({
  counts,
  currentFeedback,
  canInteract,
  density = 'regular',
  onSelect,
  onUnavailable,
}: FeedbackBarProps) {
  const { t } = useTranslation();
  const normalizedCounts = normalizeFeedbackCounts(counts);
  const visibleItems = FEEDBACK_ITEMS.filter((item) => normalizedCounts[item.type] > 0);
  const compact = density === 'compact';
  const menuId = useId();
  const menuTitleId = useId();
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const selectedItem = FEEDBACK_ITEMS.find((item) => item.type === currentFeedback);
  const showMenuButton = Boolean(onSelect || onUnavailable);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  useEffect(() => {
    if (!menuOpen) return undefined;

    const handlePointerDown = (event: PointerEvent) => {
      if (!isEventInsideRefs(event, [triggerRef, menuRef])) {
        closeMenu();
      }
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMenu();
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeMenu, menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const selectedIndex = Math.max(
      FEEDBACK_ITEMS.findIndex((item) => item.type === currentFeedback),
      0,
    );
    window.requestAnimationFrame(() => {
      itemRefs.current[selectedIndex]?.focus();
    });
  }, [currentFeedback, menuOpen]);

  if (visibleItems.length === 0 && !showMenuButton) return null;

  return (
    <div
      className={`flex flex-wrap items-center ${compact ? 'gap-1.5' : 'gap-2'}`}
      role="group"
      aria-label={t('feedback.aria')}
    >
      {visibleItems.map((item) => {
        const selected = currentFeedback === item.type;
        const count = normalizedCounts[item.type];
        const label = t(`feedback.items.${item.type}.label`);
        const description = t(`feedback.items.${item.type}.description`);
        const tooltip = (
          <div className="space-y-1">
            <div className="font-bold text-text-primary">
              {item.emoji} {label}
            </div>
            <div>{description}</div>
            {canInteract && selected && (
              <div className="border-t border-border-subtle pt-1 text-text-tertiary">
                {t('feedback.undoHint')}
              </div>
            )}
          </div>
        );

        return (
          <PortalTooltip key={item.type} content={tooltip} placement="top" align="center">
            <span
              aria-label={t('feedback.countLabel', { label, count })}
              className="inline-flex cursor-default focus:outline-none"
            >
              <TTag
                color={selected ? 'accent' : 'default'}
                className={[
                  'h-7 min-w-[50px] justify-center gap-1',
                  compact ? 'h-6 min-w-[44px]' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <span aria-hidden="true" className="leading-none">
                  {item.emoji}
                </span>
                <span className="text-[11px] tabular-nums">{formatNumber(count)}</span>
              </TTag>
            </span>
          </PortalTooltip>
        );
      })}

      {showMenuButton && (
        <>
          <button
            ref={triggerRef}
            type="button"
            aria-haspopup="dialog"
            aria-controls={menuOpen ? menuId : undefined}
            aria-expanded={menuOpen}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (!canInteract) {
                onUnavailable?.();
                return;
              }
              setMenuOpen((open) => !open);
            }}
            className={[
              'inline-flex items-center justify-center gap-1.5 border border-[var(--t-noise)] bg-transparent font-mono text-text-secondary transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:border-accent/60 hover:bg-accent/5 hover:text-[var(--t-accent)]',
              !canInteract
                ? 'text-text-tertiary hover:border-[var(--t-noise)] hover:bg-transparent hover:text-text-secondary'
                : '',
              compact ? 'h-6 px-2 text-[11px]' : 'h-7 px-3 text-[12px]',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <SmilePlus className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
            {selectedItem
              ? t('feedback.selected', { emoji: selectedItem.emoji })
              : t('feedback.action')}
          </button>

          <FloatingPortal
            open={menuOpen}
            anchorRef={triggerRef}
            placement="bottom"
            align="end"
            offset={8}
            zIndex={100}
            role="dialog"
            id={menuId}
            ariaLabelledBy={menuTitleId}
            className="max-h-[min(520px,calc(100vh-24px))] w-[min(360px,calc(100vw-24px))] overflow-y-auto overscroll-contain border border-[var(--t-noise)] bg-[var(--t-panel)] p-2"
          >
            <div ref={menuRef}>
              <div className="px-2 pb-2 pt-1">
                <div
                  id={menuTitleId}
                  className="font-mono text-[10px] font-semibold uppercase tracking-deck-wide text-accent"
                >
                  {t('feedback.choose')}
                </div>
                <div className="mt-0.5 text-[11px] leading-relaxed text-text-tertiary">
                  {t('feedback.chooseHint')}
                </div>
              </div>
              <div className="grid gap-1">
                {FEEDBACK_ITEMS.map((item, itemIndex) => {
                  const selected = currentFeedback === item.type;
                  const count = normalizedCounts[item.type];
                  const label = t(`feedback.items.${item.type}.label`);
                  const description = t(`feedback.items.${item.type}.description`);
                  return (
                    <button
                      key={item.type}
                      ref={(node) => {
                        itemRefs.current[itemIndex] = node;
                      }}
                      type="button"
                      aria-pressed={selected}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        if (!canInteract) {
                          onUnavailable?.();
                          closeMenu();
                          triggerRef.current?.focus();
                          return;
                        }
                        onSelect?.(item.type);
                        closeMenu();
                        triggerRef.current?.focus();
                      }}
                      className={[
                        'grid grid-cols-[28px_1fr_auto] items-start gap-2 border px-2.5 py-2 text-left transition-colors duration-100 [transition-timing-function:steps(2,end)]',
                        selected
                          ? 'border-accent/60 bg-accent/5'
                          : 'border-transparent hover:bg-white/5',
                      ].join(' ')}
                    >
                      <span className="text-lg leading-none" aria-hidden="true">
                        {item.emoji}
                      </span>
                      <span className="min-w-0">
                        <span className="block font-mono text-[12px] font-semibold text-text-primary">
                          {label}
                        </span>
                        <span className="mt-0.5 block text-[11px] leading-snug text-text-tertiary">
                          {description}
                        </span>
                      </span>
                      <span className="flex items-center gap-1 font-mono text-[11px] text-text-secondary">
                        {formatNumber(count)}
                        {selected && <Check className="h-3.5 w-3.5 text-accent" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </FloatingPortal>
        </>
      )}
    </div>
  );
}
