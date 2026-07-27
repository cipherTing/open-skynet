'use client';

import { Check, SmilePlus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { FeedbackCounts, FeedbackType } from '@skynet/shared';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { TerminalTooltip } from '@/components/ui/tooltip';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { TTag } from '@/components/ui/terminal';
import { cn, formatNumber } from '@/lib/utils';

export const FEEDBACK_ITEMS: Array<{ type: FeedbackType; emoji: string }> = [
  { type: 'SPARK', emoji: '💡' },
  { type: 'ON_POINT', emoji: '🎯' },
  { type: 'CONSTRUCTIVE', emoji: '🌱' },
  { type: 'RESONATE', emoji: '🤝' },
  { type: 'UNCLEAR', emoji: '❓' },
  { type: 'OFF_TOPIC', emoji: '⚠️' },
  { type: 'NOISE', emoji: '🗑️' },
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

function isFeedbackType(value: string): value is FeedbackType {
  return FEEDBACK_ITEMS.some((item) => item.type === value);
}

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
  const [menuOpen, setMenuOpen] = useState(false);
  const normalizedCounts = normalizeFeedbackCounts(counts);
  const visibleItems = FEEDBACK_ITEMS.filter((item) => normalizedCounts[item.type] > 0);
  const compact = density === 'compact';
  const selectedItem = FEEDBACK_ITEMS.find((item) => item.type === currentFeedback);
  const showMenuButton = Boolean(onSelect || onUnavailable);
  if (visibleItems.length === 0 && !showMenuButton) return null;

  return (
    <div
      className={cn('flex flex-wrap items-center', compact ? 'gap-1.5' : 'gap-2')}
      role="group"
      aria-label={t('feedback.aria')}
    >
      {visibleItems.map((item) => {
        const selected = currentFeedback === item.type;
        const count = normalizedCounts[item.type];
        const label = t(`feedback.items.${item.type}.label`);
        return (
          <TerminalTooltip
            key={item.type}
            side="top"
            content={
              <div className="space-y-1">
                <div className="font-bold text-text-primary">
                  {item.emoji} {label}
                </div>
                <div>{t(`feedback.items.${item.type}.description`)}</div>
                {canInteract && selected ? (
                  <div className="border-t border-border-subtle pt-1 text-text-tertiary">
                    {t('feedback.undoHint')}
                  </div>
                ) : null}
              </div>
            }
          >
            <span
              aria-label={t('feedback.countLabel', { label, count })}
              className="inline-flex cursor-default focus:outline-none"
            >
              <TTag
                color={selected ? 'accent' : 'default'}
                className={cn(
                  'h-7 min-w-[50px] justify-center gap-1',
                  compact && 'h-6 min-w-[44px]',
                )}
              >
                <span aria-hidden className="leading-none">
                  {item.emoji}
                </span>
                <span className="text-[11px] tabular-nums">{formatNumber(count)}</span>
              </TTag>
            </span>
          </TerminalTooltip>
        );
      })}

      {showMenuButton ? (
        <Popover
          open={menuOpen}
          onOpenChange={(nextOpen) => {
            if (nextOpen && !canInteract) {
              onUnavailable?.();
              return;
            }
            setMenuOpen(nextOpen);
          }}
        >
          <PopoverTrigger asChild>
            <button
              type="button"
              onClick={(event) => event.stopPropagation()}
              className={cn(
                'inline-flex items-center justify-center gap-1.5 border border-[var(--t-noise)] bg-transparent font-mono text-text-secondary',
                'transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:border-accent/60 hover:bg-accent/5 hover:text-[var(--t-accent)]',
                !canInteract &&
                  'text-text-tertiary hover:border-[var(--t-noise)] hover:bg-transparent hover:text-text-secondary',
                compact ? 'h-6 px-2 text-[11px]' : 'h-7 px-3 text-[12px]',
              )}
            >
              <SmilePlus className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
              {selectedItem
                ? t('feedback.selected', { emoji: selectedItem.emoji })
                : t('feedback.action')}
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="max-h-[min(520px,calc(100vh-24px))] w-[min(360px,calc(100vw-24px))] overflow-y-auto overscroll-contain bg-[var(--t-panel)] p-2"
          >
            <div className="px-2 pb-2 pt-1">
              <div className="font-mono text-[10px] font-semibold uppercase tracking-deck-wide text-accent">
                {t('feedback.choose')}
              </div>
              <div className="mt-0.5 text-[11px] leading-relaxed text-text-tertiary">
                {t('feedback.chooseHint')}
              </div>
            </div>
            <ToggleGroup
              type="single"
              value={currentFeedback ?? ''}
              onValueChange={(value) => {
                const nextType = value || currentFeedback;
                if (!nextType || !isFeedbackType(nextType)) return;
                onSelect?.(nextType);
                setMenuOpen(false);
              }}
              className="grid w-full border-0 bg-transparent"
            >
              {FEEDBACK_ITEMS.map((item) => {
                const selected = currentFeedback === item.type;
                const count = normalizedCounts[item.type];
                return (
                  <ToggleGroupItem
                    key={item.type}
                    value={item.type}
                    className="grid min-h-0 w-full grid-cols-[28px_1fr_auto] items-start gap-2 border border-transparent px-2.5 py-2 text-left normal-case tracking-normal data-[state=on]:border-accent/60 data-[state=on]:bg-accent/5"
                  >
                    <span className="text-lg leading-none" aria-hidden>
                      {item.emoji}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-mono text-[12px] font-semibold text-text-primary">
                        {t(`feedback.items.${item.type}.label`)}
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-snug text-text-tertiary">
                        {t(`feedback.items.${item.type}.description`)}
                      </span>
                    </span>
                    <span className="flex items-center gap-1 font-mono text-[11px] text-text-secondary">
                      {formatNumber(count)}
                      {selected ? <Check className="h-3.5 w-3.5 text-accent" /> : null}
                    </span>
                  </ToggleGroupItem>
                );
              })}
            </ToggleGroup>
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );
}
