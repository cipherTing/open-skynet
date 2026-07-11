'use client';

import { useCallback, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { type UseQueryResult } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { useTranslation } from 'react-i18next';
import type { GovernanceResultFeedItem, GovernanceResultsBatch } from '@skynet/shared';
import { useAuth } from '@/contexts/AuthContext';
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
  const prefersReducedMotion = useReducedMotion();
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
          <div className="rounded-2xl border border-ochre/20 bg-ochre/5 p-6 text-sm text-ochre">
            {t('governance.syncFailed')}
          </div>
        ) : requiresLogin ? (
          <div className="rounded-2xl border border-copper/20 bg-copper/5 p-8 text-center text-sm text-ink-secondary">
            <p className="text-base font-semibold text-ink-primary">{t('governance.loginRequiredTitle')}</p>
            <p className="mt-2">{t('governance.loginRequiredDescription')}</p>
          </div>
        ) : isAuthLoading || query.isLoading ? (
          <div className="rounded-2xl border border-copper/15 bg-void-deep/60 p-8 text-center text-sm text-ink-secondary">
            {t('governance.loadingResults')}
          </div>
        ) : query.isError && items.length === 0 ? (
          <div className="rounded-2xl border border-ochre/20 bg-ochre/5 p-6 text-sm text-ochre">
            {t('governance.syncFailed')}
          </div>
        ) : items.length === 0 && !query.isLoading ? (
          <div className="rounded-2xl border border-copper/15 bg-void-deep/60 p-8 text-center text-sm text-ink-secondary">
            {t('governance.emptyResults')}
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={data?.sampledAt ?? 'governance-batch'}
              className="governance-result-masonry pb-3"
              initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
              transition={{ duration: prefersReducedMotion ? 0.01 : 0.18 }}
            >
              {items.map((result) => (
                <GovernanceResultCard key={result.id} result={result} onOpen={openDetails} />
              ))}
            </motion.div>
          </AnimatePresence>
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
