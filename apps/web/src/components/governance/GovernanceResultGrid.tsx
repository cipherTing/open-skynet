'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { GovernanceResultFeedItem } from '@skynet/shared';
import { useAuth } from '@/contexts/AuthContext';
import { governanceApi } from '@/lib/api';
import { isGovernanceAuthError } from './governance-format';
import { GovernanceResultCard } from './GovernanceResultCard';
import { GovernanceResultDetailModal } from './GovernanceResultDetailModal';

const BATCH_SIZE = 10;
const AUTO_REFRESH_MS = 60_000;
const COUNTDOWN_TICK_MS = 1_000;
const HEADER_COLLAPSE_RANGE = 72;

export function GovernanceResultGrid() {
  const { t } = useTranslation();
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const prefersReducedMotion = useReducedMotion();
  const [selectedResult, setSelectedResult] = useState<GovernanceResultFeedItem | null>(null);
  const [isDocumentVisible, setIsDocumentVisible] = useState(true);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [nextRefreshAt, setNextRefreshAt] = useState(() => Date.now() + AUTO_REFRESH_MS);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const scrollRootRef = useRef<HTMLDivElement | null>(null);
  const { scrollY } = useScroll({ container: scrollRootRef });
  const toolbarHeight = useTransform(scrollY, [0, HEADER_COLLAPSE_RANGE], [24, 10]);
  const toolbarMarginBottom = useTransform(scrollY, [0, HEADER_COLLAPSE_RANGE], [8, 1]);
  const toolbarOpacity = useTransform(scrollY, [0, HEADER_COLLAPSE_RANGE], [1, 0.64]);
  const toolbarScale = useTransform(scrollY, [0, HEADER_COLLAPSE_RANGE], [1, 0.97]);
  const toolbarY = useTransform(scrollY, [0, HEADER_COLLAPSE_RANGE], [0, -4]);

  const query = useQuery({
    queryKey: ['governance', 'results', 'random-batch', BATCH_SIZE],
    queryFn: () => governanceApi.resultFeed(BATCH_SIZE),
    placeholderData: (previous) => previous,
    enabled: !isAuthLoading && isAuthenticated,
    retry: (failureCount, error) => !isGovernanceAuthError(error) && failureCount < 2,
  });

  const data = query.data;
  const items = data?.items ?? [];
  const requiresLogin = !isAuthLoading && !isAuthenticated;
  const hasAuthError = isGovernanceAuthError(query.error);
  const shouldAutoRefresh =
    !requiresLogin &&
    !hasAuthError &&
    isDocumentVisible &&
    !selectedResult &&
    !prefersReducedMotion;

  useEffect(() => {
    function onVisibilityChange() {
      setIsDocumentVisible(document.visibilityState === 'visible');
    }
    onVisibilityChange();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  useEffect(() => {
    if (!data?.sampledAt) return;
    setNextRefreshAt(Date.now() + AUTO_REFRESH_MS);
    setNowMs(Date.now());
  }, [data?.sampledAt]);

  const refetchResults = query.refetch;
  useEffect(() => {
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNowMs(current);
      if (!shouldAutoRefresh || query.isFetching || current < nextRefreshAt) return;
      setNextRefreshAt(current + AUTO_REFRESH_MS);
      void refetchResults();
    }, COUNTDOWN_TICK_MS);
    return () => window.clearInterval(timer);
  }, [nextRefreshAt, query.isFetching, refetchResults, shouldAutoRefresh]);

  const remainingSeconds = Math.max(0, Math.ceil((nextRefreshAt - nowMs) / 1000));
  const remainingMs = Math.max(0, nextRefreshAt - nowMs);
  const progressValue = useMemo(() => {
    const elapsed = AUTO_REFRESH_MS - remainingMs;
    return Math.min(1, Math.max(0, elapsed / AUTO_REFRESH_MS));
  }, [remainingMs]);

  const openDetails = useCallback((result: GovernanceResultFeedItem, trigger: HTMLElement) => {
    returnFocusRef.current = trigger;
    setSelectedResult(result);
  }, []);

  const closeDetails = useCallback((open: boolean) => {
    if (!open) setSelectedResult(null);
  }, []);

  const refreshStatus = selectedResult
    ? t('governance.autoRefresh.pausedForModal')
    : prefersReducedMotion
      ? t('governance.autoRefresh.pausedForReducedMotion')
      : !isDocumentVisible
        ? t('governance.autoRefresh.pausedForHiddenPage')
        : t('governance.autoRefresh.active', { seconds: remainingSeconds });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <motion.div
        className="governance-plaza-toolbar"
        style={
          prefersReducedMotion
            ? undefined
            : {
                height: toolbarHeight,
                marginBottom: toolbarMarginBottom,
                opacity: toolbarOpacity,
                scale: toolbarScale,
                y: toolbarY,
              }
        }
      >
        <p className="governance-plaza-toolbar__title">{t('governance.plazaTitle')}</p>
        {isAuthLoading || requiresLogin ? null : (
          <div className="governance-refresh-status">
            <span aria-hidden="true">{refreshStatus}</span>
            <div
              className="governance-refresh-progress"
              role="progressbar"
              aria-label={refreshStatus}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progressValue * 100)}
            >
              <motion.span
                key={nextRefreshAt}
                className="governance-refresh-progress__bar"
                initial={{ scaleX: progressValue }}
                animate={{ scaleX: shouldAutoRefresh ? 1 : progressValue }}
                transition={{ duration: shouldAutoRefresh && !prefersReducedMotion ? remainingMs / 1000 : 0, ease: 'linear' }}
              />
            </div>
          </div>
        )}
      </motion.div>

      {requiresLogin ? (
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
        <div ref={scrollRootRef} className="skynet-auto-hide-scrollbar min-h-0 flex-1 overflow-y-auto pr-2 [scrollbar-gutter:stable]">
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
        </div>
      )}

      <GovernanceResultDetailModal
        result={selectedResult}
        open={!!selectedResult}
        onOpenChange={closeDetails}
        returnFocusRef={returnFocusRef}
      />
    </div>
  );
}
