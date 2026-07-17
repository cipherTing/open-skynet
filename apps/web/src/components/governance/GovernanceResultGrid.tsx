'use client';

import { useCallback, useRef, useState } from 'react';
import { type UseQueryResult } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { useTranslation } from 'react-i18next';
import type { GovernanceResultFeedItem, GovernanceResultsBatch } from '@skynet/shared';
import { useAuth } from '@/contexts/AuthContext';
import { TEmpty } from '@/components/ui/terminal/TEmpty';
import { TSkeleton } from '@/components/ui/terminal/TSkeleton';
import { isGovernanceAuthError } from './governance-format';
import { GovernanceResultCard } from './GovernanceResultCard';

const GovernanceResultDetailModal = dynamic(
  () => import('./GovernanceResultDetailModal').then((mod) => mod.GovernanceResultDetailModal),
  { ssr: false },
);

interface GovernanceResultGridProps {
  query: UseQueryResult<GovernanceResultsBatch, Error>;
  onDetailOpenChange: (open: boolean) => void;
}

export function GovernanceResultGrid({ query, onDetailOpenChange }: GovernanceResultGridProps) {
  const { t } = useTranslation();
  const { isAuthenticated, isLoading: isAuthLoading, isUnavailable: isAuthUnavailable } = useAuth();
  const [selectedResult, setSelectedResult] = useState<GovernanceResultFeedItem | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const data = query.data;
  const items = data?.items ?? [];
  const requiresLogin = !isAuthLoading && !isAuthUnavailable && !isAuthenticated;
  const hasAuthError = isGovernanceAuthError(query.error);

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
          <div className="border border-danger/30 bg-surface-1 p-6 text-sm text-danger">
            {t('governance.syncFailed')}
          </div>
        ) : requiresLogin ? (
          <div className="border border-border bg-surface-1 p-8 text-center text-sm text-text-secondary">
            <p className="text-base font-semibold text-text-primary">{t('governance.loginRequiredTitle')}</p>
            <p className="mt-2">{t('governance.loginRequiredDescription')}</p>
          </div>
        ) : isAuthLoading || query.isLoading ? (
          <div className="border border-border-subtle bg-surface-1 p-6">
            <TSkeleton rows={6} />
            <p className="mt-4 text-center font-mono text-[11px] uppercase tracking-[0.15em] text-[#3A5A3A]">
              {t('governance.loadingResults')}
            </p>
          </div>
        ) : query.isError && items.length === 0 ? (
          <div className="border border-danger/30 bg-surface-1 p-6 text-sm text-danger">
            {t('governance.syncFailed')}
          </div>
        ) : items.length === 0 && !query.isLoading ? (
          <TEmpty message={t('governance.emptyResults')} />
        ) : (
          <div
            key={data?.sampledAt ?? 'governance-batch'}
            className="governance-result-masonry pb-3"
          >
            {items.map((result) => (
              <GovernanceResultCard key={result.id} result={result} onOpen={openDetails} />
            ))}
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
