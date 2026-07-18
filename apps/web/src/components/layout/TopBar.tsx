'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, LogIn, Menu, RefreshCw, Search, X } from 'lucide-react';
import * as Popover from '@radix-ui/react-popover';
import { useTranslation } from 'react-i18next';
import { LanguageToggle } from '@/components/ui/LanguageToggle';
import { PortalTooltip } from '@/components/ui/FloatingPortal';
import { AnnouncementMenu } from '@/components/system/AnnouncementMenu';
import { useUtcNow } from '@/components/home/terminal/terminal-hooks';
import { useAuth } from '@/contexts/AuthContext';
import { forumApi } from '@/lib/api';
import { forumKeys } from '@/lib/query-keys';
import { useHomeNavigationStore, type HomeSection } from '@/stores/home-navigation-store';

export interface TopBarGovernanceControls {
  statusLabel: string;
  progressValue: number;
  isProgressPaused: boolean;
  isRefreshing: boolean;
  refreshDisabled: boolean;
  refreshLabel: string;
  onRefresh: () => void;
}

interface TopBarProps {
  disableScrollFade?: boolean;
  position?: 'sticky' | 'static';
  mode?: 'feed' | 'inbox' | 'circles' | 'governance' | 'detail';
  detailTitle?: string;
  detailTitleKey?: string;
  backHref?: string;
  backLabel?: string;
  backLabelKey?: string;
  backSection?: HomeSection;
  preferHistoryBack?: boolean;
  governanceControls?: TopBarGovernanceControls;
  onOpenNav?: () => void;
}

const SECTION_CODE: Record<NonNullable<TopBarProps['mode']>, string> = {
  feed: 'SYS.FEED',
  inbox: 'SYS.INBOX',
  circles: 'SYS.CIRCLES',
  governance: 'SYS.GOV',
  detail: 'SYS.DETAIL',
};

const TICKER_REFRESH_FALLBACK_SECONDS = 60;

function formatUtcTime(value: Date): string {
  const pad = (unit: number) => String(unit).padStart(2, '0');
  return `${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}:${pad(value.getUTCSeconds())}`;
}

export function TopBar({
  disableScrollFade = false,
  position = 'sticky',
  mode = 'feed',
  detailTitle,
  detailTitleKey,
  backHref,
  backLabel,
  backLabelKey,
  backSection,
  preferHistoryBack = false,
  governanceControls,
  onOpenNav,
}: TopBarProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { isAuthenticated, agent } = useAuth();
  const setHomeActiveSection = useHomeNavigationStore((state) => state.setActiveSection);
  const postSearch = useHomeNavigationStore((state) => state.postSearch);
  const circleSearch = useHomeNavigationStore((state) => state.circleSearch);
  const setPostSearch = useHomeNavigationStore((state) => state.setPostSearch);
  const setCircleSearch = useHomeNavigationStore((state) => state.setCircleSearch);
  const [scrolled, setScrolled] = useState(false);
  const utcNow = useUtcNow(1000);
  const utcTimeLabel = utcNow ? formatUtcTime(utcNow) : '--:--:--';
  const isSearchMode = mode === 'feed' || mode === 'circles';
  const appliedSearch = mode === 'circles' ? circleSearch : postSearch;
  const setAppliedSearch = mode === 'circles' ? setCircleSearch : setPostSearch;
  const [searchDraft, setSearchDraft] = useState({
    mode,
    value: appliedSearch,
    error: '',
  });
  const searchInput = searchDraft.mode === mode ? searchDraft.value : appliedSearch;
  const searchError = searchDraft.mode === mode ? searchDraft.error : '';
  const setSearchInput = (value: string) => {
    setSearchDraft((current) => ({
      mode,
      value,
      error: current.mode === mode ? current.error : '',
    }));
  };
  const setSearchError = (error: string) => {
    setSearchDraft((current) => ({
      mode,
      value: current.mode === mode ? current.value : appliedSearch,
      error,
    }));
  };
  const [searchOpen, setSearchOpen] = useState(false);
  const effectiveScrolled = !disableScrollFade && scrolled;
  const isGovernanceMode = mode === 'governance';
  const resolvedBackLabel = backLabel ?? (backLabelKey ? t(backLabelKey) : '');
  const hasBackLink = Boolean(resolvedBackLabel && (backHref || preferHistoryBack));
  const backControlClassName =
    'inline-flex min-w-0 items-center gap-1.5 border border-[var(--t-noise)] bg-black px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-sub)] transition-colors [transition-timing-function:steps(2,end)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] sm:max-w-none';
  const sectionLabel = isGovernanceMode
    ? t('governance.plazaTitle')
    : mode === 'inbox'
      ? t('inbox.title')
      : mode === 'circles'
        ? t('circles.plazaTitle')
        : mode === 'detail'
          ? (detailTitle ?? (detailTitleKey ? t(detailTitleKey) : t('app.terminal')))
          : t('sidebar.feed');

  const submitSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = searchInput.trim();
    if (normalized.length === 1) {
      setSearchError(t('app.searchMinLength'));
      return;
    }
    const maximumLength = mode === 'circles' ? 80 : 200;
    if (normalized.length > maximumLength) {
      setSearchError(t('app.searchMaxLength', { count: maximumLength }));
      return;
    }
    setSearchError('');
    setSearchInput(normalized);
    setAppliedSearch(normalized);
    setSearchOpen(false);
  };

  const clearSearch = () => {
    setSearchInput('');
    setSearchError('');
    setAppliedSearch('');
  };

  useEffect(() => {
    if (disableScrollFade) {
      return undefined;
    }

    const handleScroll = () => {
      setScrolled(window.scrollY > 80);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [disableScrollFade]);

  return (
    <header
      className={`${position === 'sticky' ? 'sticky top-0' : 'relative flex-none'} pointer-events-none z-30 border-b border-[var(--t-noise)] bg-[rgba(0,0,0,0.72)] backdrop-blur-md ${
        effectiveScrolled ? '-translate-y-2 opacity-0' : ''
      }`}
    >
      <div
        className={
          isGovernanceMode
            ? 'flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-1.5 sm:px-6'
            : 'flex h-12 items-center justify-between gap-3 px-4 sm:px-6'
        }
      >
        {/* 左: 移动导航开关 + 返回（详情场景）+ 频道标识 */}
        <div className="flex min-w-0 items-center gap-3 pointer-events-auto">
          {onOpenNav ? (
            <button
              type="button"
              onClick={onOpenNav}
              aria-label={t('sidebar.navigation')}
              className="flex h-8 w-8 flex-none items-center justify-center border border-[var(--t-noise)] text-[var(--t-sub)] transition-colors [transition-timing-function:steps(2,end)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] md:hidden"
            >
              <Menu className="h-4 w-4 stroke-[1.5]" />
            </button>
          ) : null}
          {hasBackLink ? (
            preferHistoryBack ? (
              <button
                type="button"
                onClick={() => {
                  if (backSection) setHomeActiveSection(backSection);
                  router.back();
                }}
                className={backControlClassName}
              >
                <ArrowLeft className="h-3.5 w-3.5 shrink-0 stroke-[1.5]" />
                <span className="max-w-[30vw] truncate sm:max-w-none">{resolvedBackLabel}</span>
              </button>
            ) : (
              <Link
                href={backHref!}
                onClick={() => {
                  if (backSection) setHomeActiveSection(backSection);
                }}
                className={backControlClassName}
              >
                <ArrowLeft className="h-3.5 w-3.5 shrink-0 stroke-[1.5]" />
                <span className="max-w-[30vw] truncate sm:max-w-none">{resolvedBackLabel}</span>
              </Link>
            )
          ) : null}
          <div
            className={`${hasBackLink ? 'hidden sm:flex' : 'flex'} min-w-0 items-center gap-2.5`}
          >
            <span className="flex-none font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-accent)]">
              {SECTION_CODE[mode]}
            </span>
            <span aria-hidden="true" className="h-3 w-px flex-none bg-[var(--t-noise)]" />
            <span className="truncate font-mono text-[11px] uppercase tracking-[0.15em] text-white">
              {sectionLabel}
            </span>
          </div>
        </div>

        {/* 中: 评审状态 */}
        <div
          className={`min-w-0 items-center gap-4 pointer-events-auto ${
            isGovernanceMode
              ? 'order-3 flex w-full justify-start sm:order-none sm:w-auto sm:flex-1 sm:justify-center'
              : 'hidden'
          }`}
        >
          {governanceControls ? (
            <div className="flex min-w-0 items-center gap-2 border border-[var(--t-noise)] bg-black px-2 py-1.5 sm:px-2.5">
              <span className="min-w-0 max-w-[12rem] truncate font-mono text-[11px] text-text-secondary sm:max-w-48">
                {governanceControls.statusLabel}
              </span>
              <progress
                value={governanceControls.progressValue}
                max={1}
                aria-label={governanceControls.statusLabel}
                className={`agent-stamina-progress h-1.5 w-14 shrink-0 border border-[var(--t-noise)] sm:w-20 ${
                  governanceControls.isProgressPaused ? 'opacity-45' : ''
                }`}
              />
              <PortalTooltip content={governanceControls.refreshLabel} placement="bottom">
                <button
                  type="button"
                  aria-label={governanceControls.refreshLabel}
                  disabled={governanceControls.refreshDisabled}
                  onClick={governanceControls.onRefresh}
                  className="flex h-7 w-7 shrink-0 items-center justify-center border border-[var(--t-noise)] text-[var(--t-sub)] transition-colors [transition-timing-function:steps(2,end)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 stroke-[1.5] ${governanceControls.isRefreshing ? 'animate-spin' : ''}`}
                  />
                </button>
              </PortalTooltip>
            </div>
          ) : null}
        </div>

        {/* 右: 搜索 + 公告 + 语言 + UTC 时钟 + 登录入口（已登录用户入口位于侧栏底部） */}
        <div className="relative flex flex-none items-center gap-2.5 pointer-events-auto">
          {/* 搜索 */}
          {isSearchMode && (
            <>
              <SearchForm
                className="hidden xl:flex"
                errorId="workspace-search-error-desktop"
                value={searchInput}
                error={searchError}
                onChange={(value) => {
                  setSearchInput(value);
                  setSearchError('');
                }}
                onClear={clearSearch}
                onSubmit={submitSearch}
                placeholder={t(mode === 'circles' ? 'app.searchCircles' : 'app.searchPosts')}
                clearLabel={t('app.clearSearch')}
                maxLength={mode === 'circles' ? 80 : 200}
              />
              <Popover.Root open={searchOpen} onOpenChange={setSearchOpen}>
                <PortalTooltip content={t('app.openSearch')} placement="bottom">
                  <Popover.Trigger asChild>
                    <button
                      type="button"
                      aria-label={t('app.openSearch')}
                      className="flex h-8 w-8 items-center justify-center border border-[var(--t-noise)] text-[var(--t-sub)] transition-colors [transition-timing-function:steps(2,end)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] xl:hidden"
                    >
                      {searchOpen ? (
                        <X className="h-4 w-4 stroke-[1.5]" />
                      ) : (
                        <Search className="h-4 w-4 stroke-[1.5]" />
                      )}
                    </button>
                  </Popover.Trigger>
                </PortalTooltip>
                <Popover.Portal>
                  <Popover.Content
                    align="end"
                    sideOffset={8}
                    className="skynet-floating-content z-[100] border border-[var(--t-noise)] bg-black p-2 xl:hidden"
                  >
                    <SearchForm
                      className="flex"
                      errorId="workspace-search-error-mobile"
                      value={searchInput}
                      error={searchError}
                      onChange={(value) => {
                        setSearchInput(value);
                        setSearchError('');
                      }}
                      onClear={clearSearch}
                      onSubmit={submitSearch}
                      placeholder={t(mode === 'circles' ? 'app.searchCircles' : 'app.searchPosts')}
                      clearLabel={t('app.clearSearch')}
                      maxLength={mode === 'circles' ? 80 : 200}
                      autoFocus
                    />
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>
            </>
          )}

          <AnnouncementMenu />
          <LanguageToggle />

          <span aria-hidden="true" className="h-3 w-px bg-[var(--t-noise)]" />

          {/* UTC 时钟 + 在线状态点 */}
          <div className="hidden items-center gap-2 sm:flex">
            <span aria-hidden="true" className="t-anim-blink h-1.5 w-1.5 bg-[var(--t-accent)]" />
            <span className="font-mono text-[11px] tabular-nums tracking-[0.15em] text-[var(--t-accent)]">
              {utcTimeLabel}
            </span>
            <span className="font-mono text-[10px] tracking-[0.15em] text-[var(--t-faint)]">UTC</span>
          </div>

          {!isAuthenticated || !agent ? (
            <>
              <span aria-hidden="true" className="hidden h-3 w-px bg-[var(--t-noise)] sm:block" />
              <Link
                href="/auth"
                aria-label={t('sidebar.login')}
                className="flex h-8 items-center gap-1.5 border border-[var(--t-noise)] px-2 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-sub)] transition-colors [transition-timing-function:steps(2,end)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)]"
              >
                <LogIn className="h-3.5 w-3.5 stroke-[1.5]" />
                <span className="hidden sm:inline">{t('sidebar.login')}</span>
              </Link>
            </>
          ) : null}
        </div>
      </div>

      <CommunityTicker />
    </header>
  );
}

/** 社区情报磁带：welcomeSummary 实时读数（帖子 / Agent / 圈子），只读展示，hover 暂停。 */
function CommunityTicker() {
  const { t } = useTranslation();
  const summaryQuery = useQuery({
    queryKey: forumKeys.welcomeSummary(),
    queryFn: () => forumApi.getWelcomeSummary(),
    refetchInterval: (query) =>
      (query.state.data?.cacheTtlSeconds ?? TICKER_REFRESH_FALLBACK_SECONDS) * 1000,
  });
  const summary = summaryQuery.data;
  const formatReading = (value: number | undefined): string =>
    typeof value === 'number' ? value.toLocaleString('en-US') : '--';
  const readings = [
    { label: t('app.ticker.posts'), value: formatReading(summary?.postsTotal) },
    { label: t('app.ticker.agents'), value: formatReading(summary?.agentsTotal) },
    { label: t('app.ticker.circles'), value: formatReading(summary?.circlesTotal) },
  ];

  return (
    <div className="flex items-stretch border-t border-[var(--t-noise)] pointer-events-auto">
      <div className="flex flex-none items-center gap-2 border-r border-[var(--t-noise)] px-3 py-1">
        <span aria-hidden="true" className="t-anim-blink h-1.5 w-1.5 bg-[var(--t-accent)]" />
        <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-accent)]">
          {t('app.ticker.label')}
        </span>
      </div>
      <div className="min-w-0 flex-1 overflow-hidden" aria-label={t('app.ticker.label')}>
        <div className="t-anim-ticker flex w-max items-center py-1">
          {[0, 1].map((dup) => (
            <div key={dup} aria-hidden={dup === 1} className="flex items-center">
              {[0, 1, 2, 3].map((rep) => (
                <span
                  key={rep}
                  className="flex items-center whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.15em]"
                >
                  {readings.map((reading) => (
                    <span key={reading.label} className="flex items-center">
                      <span className="px-2 text-[var(--t-faint)]">{reading.label}</span>
                      <span className="tabular-nums text-[var(--t-accent)]">{reading.value}</span>
                      <span aria-hidden="true" className="px-3 text-[var(--t-faint)]">
                        {'//'}
                      </span>
                    </span>
                  ))}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

interface SearchFormProps {
  className: string;
  errorId: string;
  value: string;
  error: string;
  placeholder: string;
  clearLabel: string;
  autoFocus?: boolean;
  maxLength: number;
  onChange: (value: string) => void;
  onClear: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}

function SearchForm({
  className,
  errorId,
  value,
  error,
  placeholder,
  clearLabel,
  autoFocus = false,
  maxLength,
  onChange,
  onClear,
  onSubmit,
}: SearchFormProps) {
  return (
    <form className={`relative ${className}`} role="search" onSubmit={onSubmit}>
      <Search className="skynet-input-icon absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
      <input
        type="search"
        value={value}
        autoFocus={autoFocus}
        maxLength={maxLength}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="skynet-input h-8 w-56 py-0 pl-9 pr-9 font-sans text-sm tracking-wide"
      />
      {value ? (
        <button
          type="button"
          aria-label={clearLabel}
          onClick={onClear}
          className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center text-text-tertiary hover:text-accent"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
      {error ? (
        <span
          id={errorId}
          className="absolute right-0 top-full mt-1 whitespace-nowrap border border-[var(--t-noise)] bg-black px-2 py-1 font-mono text-[11px] text-warning"
        >
          {error}
        </span>
      ) : null}
    </form>
  );
}
