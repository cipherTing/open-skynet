'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { isGovernanceAuthError } from '@/components/governance/governance-format';
import { Sidebar } from '@/components/layout/Sidebar';
import { type TopBarGovernanceControls } from '@/components/layout/TopBar';
import { TopBar } from '@/components/layout/TopBar';
import { useAuth } from '@/contexts/AuthContext';
import { governanceApi } from '@/lib/api';
import { useHomeNavigationStore, type HomeSection } from '@/stores/home-navigation-store';

const ForumFeed = dynamic(() => import('@/components/forum/ForumFeed').then((mod) => mod.ForumFeed), {
  loading: () => <SectionLoading />,
});
const CircleGrid = dynamic(() => import('@/components/circle/CircleGrid').then((mod) => mod.CircleGrid), {
  loading: () => <SectionLoading />,
});
const GovernanceResultGrid = dynamic(
  () => import('@/components/governance/GovernanceResultGrid').then((mod) => mod.GovernanceResultGrid),
  { loading: () => <SectionLoading /> },
);
const SignalPanelContent = dynamic(() => import('@/components/layout/SignalPanel').then((mod) => mod.SignalPanelContent), {
  loading: () => <PanelLoading />,
});
const GovernancePanelContent = dynamic(
  () => import('@/components/governance/GovernancePanel').then((mod) => mod.GovernancePanelContent),
  { loading: () => <PanelLoading /> },
);

const GOVERNANCE_BATCH_SIZE = 10;
const GOVERNANCE_AUTO_REFRESH_MS = 60_000;
const COUNTDOWN_TICK_MS = 1_000;
const MANUAL_REFRESH_COOLDOWN_MS = 1_000;

export function HomeShell() {
  const { t } = useTranslation();
  const { isAuthenticated, isLoading: isAuthLoading, isUnavailable: isAuthUnavailable } = useAuth();
  const prefersReducedMotion = useReducedMotion();
  const reducedMotionEnabled = prefersReducedMotion === true;
  const storedActiveSection = useHomeNavigationStore((state) => state.activeSection);
  const setActiveSection = useHomeNavigationStore((state) => state.setActiveSection);
  const activeSection = storedActiveSection;
  const isGovernanceActive = activeSection === 'governance';
  const topBarMode = activeSection === 'governance'
    ? 'governance'
    : activeSection === 'circles'
      ? 'circles'
      : 'feed';
  const [isDocumentVisible, setIsDocumentVisible] = useState(true);
  const [isGovernanceDetailOpen, setIsGovernanceDetailOpen] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [nextRefreshAt, setNextRefreshAt] = useState(() => Date.now() + GOVERNANCE_AUTO_REFRESH_MS);
  const pauseRemainingMsRef = useRef<number | null>(null);
  const lastManualRefreshAtRef = useRef(0);

  const handleSectionChange = useCallback(
    (section: HomeSection) => {
      if (section !== 'governance') {
        setIsGovernanceDetailOpen(false);
      }
      if (section === 'governance') {
        const current = Date.now();
        setNowMs(current);
        setNextRefreshAt(current + GOVERNANCE_AUTO_REFRESH_MS);
      }
      setActiveSection(section);
    },
    [setActiveSection],
  );

  const governanceResultsQuery = useQuery({
    queryKey: ['governance', 'results', 'random-batch', GOVERNANCE_BATCH_SIZE],
    queryFn: () => governanceApi.resultFeed(GOVERNANCE_BATCH_SIZE),
    placeholderData: (previous) => previous,
    enabled: isGovernanceActive && !isAuthLoading && !isAuthUnavailable && isAuthenticated,
    retry: (failureCount, error) => !isGovernanceAuthError(error) && failureCount < 2,
  });

  useEffect(() => {
    function onVisibilityChange() {
      setIsDocumentVisible(document.visibilityState === 'visible');
    }

    onVisibilityChange();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  const requiresGovernanceLogin = !isAuthLoading && !isAuthUnavailable && !isAuthenticated;
  const hasGovernanceAuthError = isGovernanceAuthError(governanceResultsQuery.error);
  const isGovernanceRefreshPaused =
    isGovernanceActive &&
    (isAuthLoading ||
      isAuthUnavailable ||
      requiresGovernanceLogin ||
      hasGovernanceAuthError ||
      !isDocumentVisible ||
      isGovernanceDetailOpen ||
      reducedMotionEnabled);
  const shouldAutoRefresh =
    isGovernanceActive &&
    !isGovernanceRefreshPaused;
  const queryNextRefreshAt = governanceResultsQuery.dataUpdatedAt > 0
    ? governanceResultsQuery.dataUpdatedAt + GOVERNANCE_AUTO_REFRESH_MS
    : nextRefreshAt;
  const scheduledNextRefreshAt = Math.max(nextRefreshAt, queryNextRefreshAt);

  useEffect(() => {
    if (governanceResultsQuery.dataUpdatedAt <= 0 || !isGovernanceRefreshPaused) return;
    pauseRemainingMsRef.current = GOVERNANCE_AUTO_REFRESH_MS;
  }, [governanceResultsQuery.dataUpdatedAt, isGovernanceRefreshPaused]);

  const refetchGovernanceResults = governanceResultsQuery.refetch;
  const isGovernanceFetching = governanceResultsQuery.isFetching;
  useEffect(() => {
    if (!isGovernanceActive) {
      pauseRemainingMsRef.current = null;
      return;
    }

    const current = Date.now();
    if (isGovernanceRefreshPaused) {
      if (pauseRemainingMsRef.current === null) {
        pauseRemainingMsRef.current = Math.max(0, scheduledNextRefreshAt - current);
        setNowMs(current);
      }
      return;
    }

    if (pauseRemainingMsRef.current !== null) {
      setNowMs(current);
      setNextRefreshAt(current + pauseRemainingMsRef.current);
      pauseRemainingMsRef.current = null;
    }
  }, [isGovernanceActive, isGovernanceRefreshPaused, scheduledNextRefreshAt]);

  useEffect(() => {
    if (!isGovernanceActive) return undefined;

    const timer = window.setInterval(() => {
      if (isGovernanceRefreshPaused) return;
      const current = Date.now();
      setNowMs(current);
      if (!shouldAutoRefresh || isGovernanceFetching || current < scheduledNextRefreshAt) return;
      setNextRefreshAt(current + GOVERNANCE_AUTO_REFRESH_MS);
      void refetchGovernanceResults({ cancelRefetch: false });
    }, COUNTDOWN_TICK_MS);

    return () => window.clearInterval(timer);
  }, [
    isGovernanceActive,
    isGovernanceFetching,
    isGovernanceRefreshPaused,
    refetchGovernanceResults,
    scheduledNextRefreshAt,
    shouldAutoRefresh,
  ]);

  const handleGovernanceRefresh = useCallback(() => {
    if (isAuthLoading || isAuthUnavailable || !isAuthenticated || isGovernanceDetailOpen) return;
    const current = Date.now();
    if (current - lastManualRefreshAtRef.current < MANUAL_REFRESH_COOLDOWN_MS) return;
    lastManualRefreshAtRef.current = current;
    setNowMs(current);
    setNextRefreshAt(current + GOVERNANCE_AUTO_REFRESH_MS);
    void refetchGovernanceResults();
  }, [isAuthLoading, isAuthUnavailable, isAuthenticated, isGovernanceDetailOpen, refetchGovernanceResults]);

  const governanceControls = useMemo<TopBarGovernanceControls | undefined>(() => {
    if (!isGovernanceActive) return undefined;

    const remainingMs = Math.max(0, scheduledNextRefreshAt - nowMs);
    const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
    const elapsed = GOVERNANCE_AUTO_REFRESH_MS - remainingMs;
    const progressValue = Math.min(1, Math.max(0, elapsed / GOVERNANCE_AUTO_REFRESH_MS));
    const refreshLabel = isGovernanceDetailOpen
      ? t('governance.refreshUnavailableForModal')
      : t('governance.refreshResults');
    const statusLabel = isAuthLoading
      ? t('governance.panel.syncing')
      : isAuthUnavailable || hasGovernanceAuthError
          ? t('governance.syncFailed')
          : requiresGovernanceLogin
            ? t('governance.loginRequiredTitle')
            : isGovernanceDetailOpen
              ? t('governance.autoRefresh.pausedForModal')
              : reducedMotionEnabled
                ? t('governance.autoRefresh.pausedForReducedMotion')
                : !isDocumentVisible
                  ? t('governance.autoRefresh.pausedForHiddenPage')
                  : t('governance.autoRefresh.active', { seconds: remainingSeconds });

    return {
      statusLabel,
      progressValue,
      isProgressPaused: isGovernanceRefreshPaused,
      isRefreshing: isGovernanceFetching,
      refreshDisabled: isAuthLoading || isAuthUnavailable || !isAuthenticated || isGovernanceDetailOpen,
      refreshLabel,
      onRefresh: handleGovernanceRefresh,
    };
  }, [
    handleGovernanceRefresh,
    hasGovernanceAuthError,
    isAuthenticated,
    isAuthLoading,
    isAuthUnavailable,
    isDocumentVisible,
    isGovernanceActive,
    isGovernanceDetailOpen,
    isGovernanceFetching,
    isGovernanceRefreshPaused,
    nowMs,
    reducedMotionEnabled,
    requiresGovernanceLogin,
    scheduledNextRefreshAt,
    t,
  ]);

  return (
    <div className="flex h-full min-h-0 w-full overflow-x-auto overflow-y-hidden">
      <Sidebar activeSection={activeSection} onSectionChange={handleSectionChange} />

      <main className="ml-[68px] flex h-full min-h-0 min-w-[360px] flex-1 flex-col overflow-hidden">
        <TopBar
          disableScrollFade
          position="static"
          mode={topBarMode}
          governanceControls={governanceControls}
        />
        <div className="min-h-0 flex-1 pl-6 pr-3 pt-0">
          {activeSection === 'governance' ? (
            <div className="h-full pb-1">
              <GovernanceResultGrid
                query={governanceResultsQuery}
                onDetailOpenChange={setIsGovernanceDetailOpen}
              />
            </div>
          ) : activeSection === 'circles' ? (
            <CircleGrid />
          ) : (
            <ForumFeed />
          )}
        </div>
      </main>

      <aside className="flex h-full min-h-0 w-[220px] shrink-0 flex-col border-l border-border-subtle bg-void-deep md:w-[240px] xl:w-[280px]">
        {activeSection === 'governance' ? <GovernancePanelContent /> : <SignalPanelContent />}
      </aside>
    </div>
  );
}

function SectionLoading() {
  return (
    <div className="flex h-full items-center justify-center text-xs uppercase tracking-[0.24em] text-ink-muted">
      SKYNET
    </div>
  );
}

function PanelLoading() {
  return <div className="p-4 text-xs uppercase tracking-[0.2em] text-ink-muted">SKYNET</div>;
}
