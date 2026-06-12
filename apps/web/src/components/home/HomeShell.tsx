'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { CircleGrid } from '@/components/circle/CircleGrid';
import { ForumFeed } from '@/components/forum/ForumFeed';
import { GovernancePanelContent } from '@/components/governance/GovernancePanel';
import { GovernanceResultGrid } from '@/components/governance/GovernanceResultGrid';
import { isGovernanceAuthError } from '@/components/governance/governance-format';
import { Sidebar } from '@/components/layout/Sidebar';
import { type TopBarGovernanceControls } from '@/components/layout/TopBar';
import { SignalPanelContent } from '@/components/layout/SignalPanel';
import { TopBar } from '@/components/layout/TopBar';
import { useAuth } from '@/contexts/AuthContext';
import { governanceApi } from '@/lib/api';
import { useHomeNavigationStore, type HomeSection } from '@/stores/home-navigation-store';

const GOVERNANCE_BATCH_SIZE = 10;
const GOVERNANCE_AUTO_REFRESH_MS = 60_000;
const COUNTDOWN_TICK_MS = 1_000;
const MANUAL_REFRESH_COOLDOWN_MS = 1_000;

interface HomeShellProps {
  routeSection?: HomeSection;
}

export function HomeShell({ routeSection }: HomeShellProps = {}) {
  const { t } = useTranslation();
  const router = useRouter();
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const prefersReducedMotion = useReducedMotion();
  const reducedMotionEnabled = prefersReducedMotion === true;
  const storedActiveSection = useHomeNavigationStore((state) => state.activeSection);
  const setActiveSection = useHomeNavigationStore((state) => state.setActiveSection);
  const activeSection = routeSection ?? storedActiveSection;
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

  useEffect(() => {
    if (!routeSection) return;
    setActiveSection(routeSection);
  }, [routeSection, setActiveSection]);

  const handleSectionChange = useCallback(
    (section: HomeSection) => {
      setActiveSection(section);
      if (!routeSection) return;
      if (section === routeSection) return;
      router.push('/');
    },
    [routeSection, router, setActiveSection],
  );

  const governanceResultsQuery = useQuery({
    queryKey: ['governance', 'results', 'random-batch', GOVERNANCE_BATCH_SIZE],
    queryFn: () => governanceApi.resultFeed(GOVERNANCE_BATCH_SIZE),
    placeholderData: (previous) => previous,
    enabled: isGovernanceActive && !isAuthLoading && isAuthenticated,
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

  useEffect(() => {
    if (isGovernanceActive) return;
    setIsGovernanceDetailOpen(false);
  }, [isGovernanceActive]);

  useEffect(() => {
    if (!isGovernanceActive) return;
    const current = Date.now();
    setNowMs(current);
    setNextRefreshAt(current + GOVERNANCE_AUTO_REFRESH_MS);
  }, [isGovernanceActive]);

  const requiresGovernanceLogin = !isAuthLoading && !isAuthenticated;
  const hasGovernanceAuthError = isGovernanceAuthError(governanceResultsQuery.error);
  const isGovernanceRefreshPaused =
    isGovernanceActive &&
    (isAuthLoading ||
      requiresGovernanceLogin ||
      hasGovernanceAuthError ||
      !isDocumentVisible ||
      isGovernanceDetailOpen ||
      reducedMotionEnabled);
  const shouldAutoRefresh =
    isGovernanceActive &&
    !isGovernanceRefreshPaused;

  useEffect(() => {
    if (!governanceResultsQuery.data?.sampledAt) return;
    const current = Date.now();
    setNextRefreshAt(current + GOVERNANCE_AUTO_REFRESH_MS);
    setNowMs(current);
    if (isGovernanceRefreshPaused) {
      pauseRemainingMsRef.current = GOVERNANCE_AUTO_REFRESH_MS;
    }
  }, [governanceResultsQuery.data?.sampledAt, isGovernanceRefreshPaused]);

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
        pauseRemainingMsRef.current = Math.max(0, nextRefreshAt - current);
        setNowMs(current);
      }
      return;
    }

    if (pauseRemainingMsRef.current !== null) {
      setNowMs(current);
      setNextRefreshAt(current + pauseRemainingMsRef.current);
      pauseRemainingMsRef.current = null;
    }
  }, [isGovernanceActive, isGovernanceRefreshPaused, nextRefreshAt]);

  useEffect(() => {
    if (!isGovernanceActive) return undefined;

    const timer = window.setInterval(() => {
      if (isGovernanceRefreshPaused) return;
      const current = Date.now();
      setNowMs(current);
      if (!shouldAutoRefresh || isGovernanceFetching || current < nextRefreshAt) return;
      setNextRefreshAt(current + GOVERNANCE_AUTO_REFRESH_MS);
      void refetchGovernanceResults({ cancelRefetch: false });
    }, COUNTDOWN_TICK_MS);

    return () => window.clearInterval(timer);
  }, [
    isGovernanceActive,
    isGovernanceFetching,
    isGovernanceRefreshPaused,
    nextRefreshAt,
    refetchGovernanceResults,
    shouldAutoRefresh,
  ]);

  const handleGovernanceRefresh = useCallback(() => {
    if (isAuthLoading || !isAuthenticated || isGovernanceDetailOpen) return;
    const current = Date.now();
    if (current - lastManualRefreshAtRef.current < MANUAL_REFRESH_COOLDOWN_MS) return;
    lastManualRefreshAtRef.current = current;
    setNowMs(current);
    setNextRefreshAt(current + GOVERNANCE_AUTO_REFRESH_MS);
    void refetchGovernanceResults();
  }, [isAuthLoading, isAuthenticated, isGovernanceDetailOpen, refetchGovernanceResults]);

  const governanceControls = useMemo<TopBarGovernanceControls | undefined>(() => {
    if (!isGovernanceActive) return undefined;

    const remainingMs = Math.max(0, nextRefreshAt - nowMs);
    const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
    const elapsed = GOVERNANCE_AUTO_REFRESH_MS - remainingMs;
    const progressValue = Math.min(1, Math.max(0, elapsed / GOVERNANCE_AUTO_REFRESH_MS));
    const refreshLabel = isGovernanceDetailOpen
      ? t('governance.refreshUnavailableForModal')
      : t('governance.refreshResults');
    const statusLabel = isAuthLoading
      ? t('governance.panel.syncing')
      : requiresGovernanceLogin
        ? t('governance.loginRequiredTitle')
        : hasGovernanceAuthError
          ? t('governance.syncFailed')
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
      refreshDisabled: isAuthLoading || !isAuthenticated || isGovernanceDetailOpen,
      refreshLabel,
      onRefresh: handleGovernanceRefresh,
    };
  }, [
    handleGovernanceRefresh,
    hasGovernanceAuthError,
    isAuthenticated,
    isAuthLoading,
    isDocumentVisible,
    isGovernanceActive,
    isGovernanceDetailOpen,
    isGovernanceFetching,
    isGovernanceRefreshPaused,
    nextRefreshAt,
    nowMs,
    reducedMotionEnabled,
    requiresGovernanceLogin,
    t,
  ]);

  return (
    <div className="flex h-dvh min-h-0 w-full overflow-hidden">
      <Sidebar activeSection={activeSection} onSectionChange={handleSectionChange} />

      <main className="ml-16 flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar
          disableScrollFade
          position="static"
          mode={topBarMode}
          backHref={routeSection === 'circles' ? '/' : undefined}
          backLabelKey={routeSection === 'circles' ? 'forum.backToFeed' : undefined}
          backSection={routeSection === 'circles' ? 'feed' : undefined}
          governanceControls={governanceControls}
        />
        <div className="min-h-0 flex-1 px-6 pt-0">
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

      <aside className="hidden h-full min-h-0 w-[280px] shrink-0 flex-col border-l border-border-subtle bg-void-deep xl:flex">
        {activeSection === 'governance' ? <GovernancePanelContent /> : <SignalPanelContent />}
      </aside>
    </div>
  );
}
