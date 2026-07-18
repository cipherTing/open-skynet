'use client';

import { useCallback, useRef, useState } from 'react';
import { type UseQueryResult } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { useTranslation } from 'react-i18next';
import type { GovernanceResultFeedItem, GovernanceResultsBatch } from '@skynet/shared';
import { useAuth } from '@/contexts/AuthContext';
import { TEmpty } from '@/components/ui/terminal/TEmpty';
import { TSkeleton } from '@/components/ui/terminal/TSkeleton';
import { Timecode } from '@/components/ui/terminal/Timecode';
import { GovernanceResultCard } from './GovernanceResultCard';

const GovernanceResultDetailModal = dynamic(
  () => import('./GovernanceResultDetailModal').then((mod) => mod.GovernanceResultDetailModal),
  { ssr: false },
);

interface GovernanceResultGridProps {
  query: UseQueryResult<GovernanceResultsBatch, Error>;
  onDetailOpenChange: (open: boolean) => void;
}

/**
 * 仲裁终端结果列表：档案卷宗式行记录（t-corner 框 + 1px 暗绿分隔），
 * 顶部一档卷头（频道代号 + 标题 + 记录数 / 采样时间码）。信息架构保持不变。
 */
export function GovernanceResultGrid({ query, onDetailOpenChange }: GovernanceResultGridProps) {
  const { t } = useTranslation();
  const { isAuthenticated, isLoading: isAuthLoading, isUnavailable: isAuthUnavailable } = useAuth();
  const [selectedResult, setSelectedResult] = useState<GovernanceResultFeedItem | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const data = query.data;
  const items = data?.items ?? [];
  const requiresLogin = !isAuthLoading && !isAuthUnavailable && !isAuthenticated;

  const openDetails = useCallback((result: GovernanceResultFeedItem, trigger: HTMLElement) => {
    returnFocusRef.current = trigger;
    setSelectedResult(result);
    onDetailOpenChange(true);
  }, [onDetailOpenChange]);

  const closeDetails = useCallback((open: boolean) => {
    if (!open) {
      setSelectedResult(null);
      onDetailOpenChange(false);
    }
  }, [onDetailOpenChange]);

  return (
    <div className="feed-overlay-shell">
      <div className="feed-overlay-scroll skynet-auto-hide-scrollbar">
        {isAuthUnavailable ? (
          <div className="border border-[var(--t-hazard-dim)] bg-[var(--t-panel)] p-6 font-mono text-xs tracking-[0.1em] text-[var(--t-hazard)]/80">
            {t('governance.syncFailed')}
          </div>
        ) : requiresLogin ? (
          <div className="t-corner border border-[var(--t-noise)] bg-[var(--t-panel)] p-8 text-center">
            <p className="text-base font-semibold text-white">{t('governance.loginRequiredTitle')}</p>
            <p className="mt-2 font-mono text-[11px] leading-5 tracking-[0.08em] text-[var(--t-sub)]">
              {t('governance.loginRequiredDescription')}
            </p>
          </div>
        ) : isAuthLoading || query.isLoading ? (
          <div className="border border-[var(--t-noise)] bg-[var(--t-panel)] p-6">
            <TSkeleton rows={6} />
            <p className="mt-4 text-center font-mono text-[11px] uppercase tracking-[0.15em] text-[var(--t-faint)]">
              {t('governance.loadingResults')}
            </p>
          </div>
        ) : query.isError && items.length === 0 ? (
          <div className="border border-[var(--t-hazard-dim)] bg-[var(--t-panel)] p-6 font-mono text-xs tracking-[0.1em] text-[var(--t-hazard)]/80">
            {t('governance.syncFailed')}
          </div>
        ) : items.length === 0 && !query.isLoading ? (
          <TEmpty message={t('governance.emptyResults')} />
        ) : (
          <div key={data?.sampledAt ?? 'governance-batch'} className="pb-3">
            <div className="mb-2 flex items-center gap-2 px-1 pt-2">
              <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-accent)]">
                {t('sections.gov.code')}
              </span>
              <span className="shrink-0 font-mono text-[10px] tracking-[0.15em] text-[var(--t-faint)]">
                {'//'}
              </span>
              <span className="shrink-0 text-xs font-bold text-white">
                {t('governance.plazaTitle')}
              </span>
              <span aria-hidden className="h-px min-w-6 flex-1 bg-[var(--t-noise)]" />
              {data ? (
                <span className="flex shrink-0 items-center gap-2 font-mono text-[10px] tabular-nums tracking-[0.15em] text-[var(--t-faint)]">
                  <span>REC ×{items.length}</span>
                  <Timecode date={data.sampledAt} withDate />
                </span>
              ) : null}
            </div>
            <div className="t-corner border border-[var(--t-noise)]">
              <div className="divide-y divide-[var(--t-noise2)]">
                {items.map((result) => (
                  <GovernanceResultCard key={result.id} result={result} onOpen={openDetails} />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <GovernanceResultDetailModal
        result={selectedResult}
        open={!!selectedResult}
        onOpenChange={closeDetails}
        returnFocusRef={returnFocusRef}
      />
    </div>
  );
}
