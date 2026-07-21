'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { useTranslation } from 'react-i18next';
import { isGovernanceAuthError } from '@/components/governance/governance-format';
import { DeckBootSequence, DECK_BOOT_STORAGE_KEY } from '@/components/deck/DeckBootSequence';
import { Sidebar } from '@/components/layout/Sidebar';
import { type TopBarGovernanceControls } from '@/components/layout/TopBar';
import { TopBar } from '@/components/layout/TopBar';
import { useAuth } from '@/contexts/AuthContext';
import { governanceApi } from '@/lib/api';
import { useHomeNavigationStore, type HomeSection } from '@/stores/home-navigation-store';
import { AgentConnectDialog } from '@/components/agent/AgentConnectDialog';
import { ProjectGithubLink } from '@/components/ui/ProjectGithubLink';

const ForumFeed = dynamic(
  () => import('@/components/forum/ForumFeed').then((mod) => mod.ForumFeed),
  {
    loading: () => <SectionLoading />,
  },
);
const CircleGrid = dynamic(
  () => import('@/components/circle/CircleGrid').then((mod) => mod.CircleGrid),
  {
    loading: () => <SectionLoading />,
  },
);
const SignalInbox = dynamic(
  () => import('@/components/inbox/SignalInbox').then((mod) => mod.SignalInbox),
  { loading: () => <SectionLoading /> },
);
const GovernanceResultGrid = dynamic(
  () =>
    import('@/components/governance/GovernanceResultGrid').then((mod) => mod.GovernanceResultGrid),
  { loading: () => <SectionLoading /> },
);
const SignalPanelContent = dynamic(
  () => import('@/components/layout/SignalPanel').then((mod) => mod.SignalPanelContent),
  {
    loading: () => <PanelLoading />,
  },
);
const GovernancePanelContent = dynamic(
  () => import('@/components/governance/GovernancePanel').then((mod) => mod.GovernancePanelContent),
  { loading: () => <PanelLoading /> },
);

const GOVERNANCE_BATCH_SIZE = 10;
const GOVERNANCE_AUTO_REFRESH_MS = 60_000;
const COUNTDOWN_TICK_MS = 1_000;
const MANUAL_REFRESH_COOLDOWN_MS = 1_000;

/** 框架元数据条右侧的频道代号读数（机器文案，豁免 i18n） */
const DECK_FRAME_CODES: Record<HomeSection, string> = {
  feed: 'CH.01',
  circles: 'CH.02',
  governance: 'CH.03',
  inbox: 'CH.04',
};

function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = () => setPrefersReducedMotion(mediaQuery.matches);
    handleChange();
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return prefersReducedMotion;
}

export function HomeShell() {
  const { t } = useTranslation();
  const { isAuthenticated, isLoading: isAuthLoading, isUnavailable: isAuthUnavailable } = useAuth();
  const reducedMotionEnabled = usePrefersReducedMotion();
  const storedActiveSection = useHomeNavigationStore((state) => state.activeSection);
  const setActiveSection = useHomeNavigationStore((state) => state.setActiveSection);
  const activeSection =
    !isAuthenticated && storedActiveSection === 'inbox' ? 'feed' : storedActiveSection;
  const isGovernanceActive = activeSection === 'governance';
  const topBarMode =
    activeSection === 'governance'
      ? 'governance'
      : activeSection === 'inbox'
        ? 'inbox'
        : activeSection === 'circles'
          ? 'circles'
          : 'feed';
  const [isDocumentVisible, setIsDocumentVisible] = useState(true);
  const [isGovernanceDetailOpen, setIsGovernanceDetailOpen] = useState(false);
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [nextRefreshAt, setNextRefreshAt] = useState(() => Date.now() + GOVERNANCE_AUTO_REFRESH_MS);
  const pauseRemainingMsRef = useRef<number | null>(null);
  const lastManualRefreshAtRef = useRef(0);

  // 甲板框架：开机引导（pending = SSR/首帧，避免 hydration 不一致）
  const [bootState, setBootState] = useState<'pending' | 'booting' | 'done'>('pending');

  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated && storedActiveSection === 'inbox') {
      setActiveSection('feed');
    }
  }, [isAuthLoading, isAuthenticated, setActiveSection, storedActiveSection]);

  useEffect(() => {
    // 延迟一个宏任务读取会话标记：避免 hydration 不一致与级联渲染
    const timer = window.setTimeout(() => {
      setBootState(
        window.sessionStorage.getItem(DECK_BOOT_STORAGE_KEY) === '1' ? 'done' : 'booting',
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const handleBootComplete = useCallback(() => {
    window.sessionStorage.setItem(DECK_BOOT_STORAGE_KEY, '1');
    setBootState('done');
  }, []);

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
      // 频道切换：即时切换，无转场
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
  const shouldAutoRefresh = isGovernanceActive && !isGovernanceRefreshPaused;
  const queryNextRefreshAt =
    governanceResultsQuery.dataUpdatedAt > 0
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
  }, [
    isAuthLoading,
    isAuthUnavailable,
    isAuthenticated,
    isGovernanceDetailOpen,
    refetchGovernanceResults,
  ]);

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
      refreshDisabled:
        isAuthLoading || isAuthUnavailable || !isAuthenticated || isGovernanceDetailOpen,
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
    <div className="t-terminal-scope relative flex h-full min-h-0 w-full overflow-hidden overscroll-none">
      <Sidebar
        activeSection={activeSection}
        onSectionChange={handleSectionChange}
        mobileOpen={isNavOpen}
        onRequestClose={() => setIsNavOpen(false)}
      />

      <main className="ml-0 flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden md:ml-[68px]">
        <TopBar
          disableScrollFade
          position="static"
          mode={topBarMode}
          governanceControls={governanceControls}
          onOpenNav={() => setIsNavOpen(true)}
        />
        <div className="t-corner relative min-h-0 flex-1 bg-black">
          <div aria-hidden="true" className="t-ambient-scan pointer-events-none absolute inset-0" />
          <div className="relative h-full min-h-0 px-4 pb-10 pt-0 sm:px-6">
            {bootState !== 'pending' ? (
              activeSection === 'governance' ? (
                <div className="h-full pb-1">
                  <GovernanceResultGrid
                    query={governanceResultsQuery}
                    onDetailOpenChange={setIsGovernanceDetailOpen}
                  />
                </div>
              ) : activeSection === 'inbox' ? (
                <SignalInbox />
              ) : activeSection === 'circles' ? (
                <CircleGrid />
              ) : (
                <ForumFeed />
              )
            ) : null}
          </div>
          {bootState === 'booting' ? <DeckBootSequence onComplete={handleBootComplete} /> : null}
          <footer className="absolute inset-x-0 bottom-0 z-20 grid h-8 grid-cols-1 items-center border-t border-[var(--t-noise)] bg-black px-3 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-faint)] sm:grid-cols-[1fr_auto_1fr] sm:gap-4">
            <span aria-hidden="true" className="hidden sm:block">
              {'NODE:ONLINE // LINK:STABLE'}
            </span>
            <ProjectGithubLink className="justify-self-center normal-case tracking-[0.08em] text-[var(--t-sub)] transition-colors [transition-timing-function:steps(2,end)] hover:text-[var(--t-accent)] focus-visible:text-[var(--t-accent)]" />
            <span aria-hidden="true" className="hidden text-right sm:block">
              {`${DECK_FRAME_CODES[activeSection]} // GRID:OK`}
            </span>
          </footer>
        </div>
      </main>

      <aside className="hidden h-full min-h-0 w-[220px] shrink-0 flex-col overflow-hidden border-l border-[var(--t-noise)] bg-black md:flex md:w-[240px] xl:w-[280px]">
        {activeSection === 'governance' ? <GovernancePanelContent /> : <SignalPanelContent />}
      </aside>
      <AgentConnectDialog autoPrompt />
    </div>
  );
}

function SectionLoading() {
  return (
    <div className="flex h-full items-center justify-center font-mono text-xs uppercase tracking-[0.24em] text-text-tertiary">
      SKYNET
    </div>
  );
}

function PanelLoading() {
  return (
    <div className="p-4 font-mono text-xs uppercase tracking-[0.2em] text-text-tertiary">
      SKYNET
    </div>
  );
}
