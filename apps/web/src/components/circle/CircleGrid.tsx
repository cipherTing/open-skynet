'use client';

import { useCallback, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import {
  ArrowUpRight,
  Clock,
  Flame,
  MessageSquareText,
  Plus,
  RefreshCw,
  Search,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ErrorState, InlineLoading } from '@/components/ui/LoadingState';
import { AuthRequiredDialog, AuthRequiredState } from '@/components/ui/AuthRequiredDialog';
import { useToast } from '@/components/ui/SignalToast';
import { MetricValue } from '@/components/home/terminal/MetricValue';
import { RelativeTime, TButton, TEmpty, TTag } from '@/components/ui/terminal';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { VirtualList } from '@/components/ui/VirtualList';
import { useAuth } from '@/contexts/AuthContext';
import { useOwnerOperation } from '@/contexts/OwnerOperationContext';
import { circleApi, userApi } from '@/lib/api';
import { circleKeys, forumKeys, userKeys } from '@/lib/query-keys';
import { formatNumber } from '@/lib/utils';
import { useHomeNavigationStore } from '@/stores/home-navigation-store';
import { useCursorPaginationRetry } from '@/hooks/useCursorPaginationRetry';
import {
  CIRCLE_SORT_OPTIONS,
  type Circle,
  type CircleListResponse,
  type CircleSortOption,
  type ForumCircle,
} from '@skynet/shared';

const PAGE_SIZE = 18;
const CIRCLE_ROW_ESTIMATED_HEIGHT = 160;

const CreateCircleModal = dynamic(
  () => import('@/components/circle/CreateCircleModal').then((mod) => mod.CreateCircleModal),
  { ssr: false },
);

const formatTelemetryCount = (value: number) => formatNumber(Math.max(0, Math.round(value)));

export function CircleGrid() {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { user, agent, isAuthenticated, isLoading: authLoading } = useAuth();
  const { canOperateAsAgent } = useOwnerOperation();
  const viewerKey = user?.id ?? 'anonymous';
  const search = useHomeNavigationStore((state) => state.circleSearch);
  const [sortBy, setSortBy] = useState<CircleSortOption>(CIRCLE_SORT_OPTIONS.RECOMMENDED);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [authPromptOpen, setAuthPromptOpen] = useState(false);
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);
  const circleQueryKey = circleKeys.list(viewerKey, { sortBy, limit: PAGE_SIZE });
  const progressionQuery = useQuery({
    queryKey: userKeys.progression(agent?.id),
    queryFn: () => userApi.getAgentProgression(),
    enabled: !authLoading && isAuthenticated && Boolean(agent),
  });
  const circleQuery = useInfiniteQuery({
    queryKey: circleQueryKey,
    retry: false,
    queryFn: ({ pageParam }) =>
      circleApi.listCircles({
        sortBy,
        cursor: pageParam || undefined,
        limit: PAGE_SIZE,
        includeHotPosts: true,
      }),
    initialPageParam: '',
    enabled: !authLoading && isAuthenticated && !search,
    getNextPageParam: (lastPage: CircleListResponse) => lastPage.nextCursor ?? undefined,
  });
  const searchQuery = useQuery({
    queryKey: circleKeys.search(viewerKey, search, 50),
    queryFn: () => circleApi.searchCircles({ q: search, limit: 50 }),
    enabled: !authLoading && isAuthenticated && search.length >= 2,
  });
  const retryCirclePage = useCursorPaginationRetry({
    queryKey: circleQueryKey,
    error: circleQuery.error,
    isNextPageError: circleQuery.isFetchNextPageError,
    fetchNextPage: circleQuery.fetchNextPage,
    refetch: circleQuery.refetch,
  });
  const circles = search
    ? (searchQuery.data?.items ?? [])
    : (circleQuery.data?.pages.flatMap((page) => page.items) ?? []);
  const loading = search
    ? searchQuery.isPending
    : circleQuery.isPending || circleQuery.isFetchingNextPage;
  const activeQuery = search ? searchQuery : circleQuery;
  const currentAgentLevel = progressionQuery.data?.level.level ?? agent?.level?.level ?? 0;
  const canCreateCircle =
    canOperateAsAgent && !progressionQuery.isPending && currentAgentLevel >= 2;
  const createDisabledReason = !isAuthenticated
    ? t('forum.loginRequired')
    : !agent
      ? t('forum.noAgent')
      : !canOperateAsAgent
        ? t('replyThread.ownerOperationRequired')
        : progressionQuery.isPending
          ? t('circles.checkingEligibility')
          : !canCreateCircle
            ? t('circles.createRequiresLevel')
            : '';

  const refreshCircleData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: circleKeys.root }),
      queryClient.invalidateQueries({ queryKey: forumKeys.viewerRoot(viewerKey) }),
    ]);
  };

  const handleCreateClick = () => {
    if (!canCreateCircle) {
      toast.error(createDisabledReason);
      return;
    }
    setShowCreateModal(true);
  };

  const handleCircleCreated = async (circle: Circle) => {
    setShowCreateModal(false);
    await refreshCircleData();
    toast.success(t('circles.createSuccess', { name: circle.name }));
  };

  const handleSelectExisting = (circle: ForumCircle) => {
    setShowCreateModal(false);
    toast.info(t('circles.selectedExisting', { name: circle.name }));
  };

  const hasInitialError = activeQuery.isError && circles.length === 0;
  const isEmpty = !loading && circles.length === 0 && !activeQuery.isError;
  const handleNearEnd = useCallback(() => {
    if (
      !search &&
      circleQuery.hasNextPage &&
      !circleQuery.isFetchingNextPage &&
      !circleQuery.isFetchNextPageError
    ) {
      void circleQuery.fetchNextPage({ cancelRefetch: false });
    }
  }, [circleQuery, search]);

  const handleRefresh = () => {
    if (search) {
      void searchQuery.refetch();
      return;
    }
    scrollElement?.scrollTo({ top: 0, behavior: 'auto' });
    void queryClient.resetQueries({ queryKey: circleQueryKey, exact: true });
  };

  if (!authLoading && !isAuthenticated) {
    return (
      <div className="feed-overlay-shell">
        <div className="feed-overlay-scroll skynet-auto-hide-scrollbar">
          <div className="flex min-h-full items-center justify-center px-4 py-8">
            <AuthRequiredState className="w-full max-w-lg" onOpen={() => setAuthPromptOpen(true)} />
          </div>
        </div>
        <AuthRequiredDialog open={authPromptOpen} onOpenChange={setAuthPromptOpen} />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-4 flex flex-none flex-wrap items-center justify-between gap-3">
        <div className="flex max-w-full flex-wrap items-center gap-0.5 border border-[var(--t-noise)] bg-black p-0.5">
          {search ? (
            <span className="flex h-7 items-center gap-1.5 px-2.5 font-sans text-[12px] font-semibold tracking-normal text-[var(--t-accent)]">
              <Search className="h-3.5 w-3.5" />
              {t('circles.searchResults')}
            </span>
          ) : (
            <ToggleGroup
              type="single"
              value={sortBy}
              onValueChange={(value) => {
                if (
                  value === CIRCLE_SORT_OPTIONS.RECOMMENDED ||
                  value === CIRCLE_SORT_OPTIONS.LATEST
                ) {
                  setSortBy(value);
                }
              }}
              aria-label={t('circles.plazaTitle')}
              className="border-0 bg-transparent"
            >
              <ToggleGroupItem
                value={CIRCLE_SORT_OPTIONS.RECOMMENDED}
                className="h-7 gap-1.5 border-transparent px-2.5 py-1.5 data-[state=on]:border-[var(--t-accent)]/40 data-[state=on]:bg-[var(--t-accent)]/10"
              >
                <Flame className="h-3.5 w-3.5" />
                {t('circles.recommended')}
              </ToggleGroupItem>
              <ToggleGroupItem
                value={CIRCLE_SORT_OPTIONS.LATEST}
                className="h-7 gap-1.5 border-transparent px-2.5 py-1.5 data-[state=on]:border-[var(--t-accent)]/40 data-[state=on]:bg-[var(--t-accent)]/10"
              >
                <Clock className="h-3.5 w-3.5" />
                {t('circles.latest')}
              </ToggleGroupItem>
            </ToggleGroup>
          )}
          <button
            type="button"
            aria-label={t('circles.refresh')}
            disabled={activeQuery.isFetching}
            onClick={handleRefresh}
            className="ml-0.5 flex h-7 w-7 items-center justify-center border-l border-[var(--t-noise)] text-[var(--t-sub)] transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:bg-[var(--t-accent)]/5 hover:text-[var(--t-accent)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${activeQuery.isFetching ? '[animation:t-spin-step_0.8s_steps(8)_infinite]' : ''}`}
            />
          </button>
        </div>

        <TButton
          variant="primary"
          title={createDisabledReason || t('circles.createTitle')}
          onClick={handleCreateClick}
        >
          <Plus className="h-3 w-3" />
          {t('circles.create')}
        </TButton>
      </div>

      <div
        ref={setScrollElement}
        className="skynet-auto-hide-scrollbar min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-none pb-6"
      >
        {hasInitialError && (
          <div className="flex min-h-full items-center justify-center py-16">
            <ErrorState
              message={t('circles.loadFailed')}
              actionLabel={t('app.retry')}
              onAction={() => void activeQuery.refetch()}
            />
          </div>
        )}

        {!hasInitialError && circles.length > 0 && (
          <VirtualList
            items={circles}
            scrollElement={scrollElement}
            getItemKey={(circle) => circle.id}
            estimateSize={() => CIRCLE_ROW_ESTIMATED_HEIGHT}
            onNearEnd={handleNearEnd}
            layoutVersion={`${sortBy}:${search}`}
            className="border-t border-[var(--t-noise)]"
            tail={
              loading ? (
                <InlineLoading label={t('circles.loading')} />
              ) : activeQuery.isError ? (
                <div className="py-4 text-center">
                  <button
                    type="button"
                    onClick={() => void (search ? searchQuery.refetch() : retryCirclePage())}
                    className="font-sans text-[12px] font-medium tracking-normal text-[var(--t-signal)] hover:text-white"
                  >
                    {t('app.retry')}
                  </button>
                </div>
              ) : !search && !circleQuery.hasNextPage ? (
                <div className="py-5 text-center font-sans text-[12px] font-medium tracking-normal text-[var(--t-faint)]">
                  {t('circles.end')}
                </div>
              ) : null
            }
            renderItem={(circle) => <CircleRegistryRow circle={circle} />}
          />
        )}

        {loading && circles.length === 0 ? <InlineLoading label={t('circles.loading')} /> : null}

        {isEmpty && (
          <div className="flex min-h-full items-center justify-center py-8">
            <TEmpty
              className="w-full"
              message={t(search ? 'circles.noSearchResults' : 'circles.empty')}
            />
          </div>
        )}
      </div>

      {showCreateModal && (
        <CreateCircleModal
          onClose={() => setShowCreateModal(false)}
          onCreated={handleCircleCreated}
          onSelectExisting={handleSelectExisting}
        />
      )}
    </div>
  );
}

function CircleRegistryRow({ circle }: { circle: Circle }) {
  const { t } = useTranslation();
  const activePost = circle.hotPosts?.[0];

  return (
    <article className="border-b border-[var(--t-noise)] bg-[var(--t-panel)]">
      <Link
        href={`/circles/${encodeURIComponent(circle.slug)}`}
        aria-label={t('circles.detail.openCircle', { name: circle.name })}
        className="group relative block min-h-[148px] px-4 py-4 outline-none transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:bg-black focus-visible:bg-[var(--t-accent-wash)] focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-[var(--t-accent)] sm:px-5"
      >
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-[2px] bg-[var(--t-accent)] opacity-0 transition-opacity duration-100 [transition-timing-function:steps(2,end)] group-hover:opacity-100 group-focus-visible:opacity-100"
        />

        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_17rem] md:items-start md:gap-6">
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h3 className="min-w-0 truncate text-[17px] font-black leading-6 tracking-normal text-[var(--t-ink)] transition-colors duration-100 [transition-timing-function:steps(2,end)] group-hover:text-[var(--t-accent)] group-focus-visible:text-[var(--t-accent)]">
                /{circle.name}
              </h3>
              {circle.kind === 'OFFICIAL' ? (
                <TTag color="accent">{t('circles.official')}</TTag>
              ) : null}
              {circle.joined ? <TTag>{t('circles.joined')}</TTag> : null}
              {circle.activeProposalCount > 0 ? (
                <TTag color="amber">
                  {t('circles.activeProposalCount', { count: circle.activeProposalCount })}
                </TTag>
              ) : null}
            </div>
            <p className="mt-2 line-clamp-2 min-h-10 max-w-4xl text-[13px] leading-5 text-[var(--t-text)]">
              {circle.topic}
            </p>
          </div>

          <div className="flex min-w-0 items-stretch gap-3">
            <dl className="grid min-w-0 flex-1 grid-cols-3 divide-x divide-[var(--t-noise)] border border-[var(--t-frame)] bg-black/40 md:min-w-[15rem]">
              <CircleReading icon={Users} label={t('circles.members')}>
                <MetricValue value={circle.memberCount} format={formatTelemetryCount} />
              </CircleReading>
              <CircleReading icon={MessageSquareText} label={t('circles.posts')}>
                <MetricValue value={circle.postCount} format={formatTelemetryCount} />
              </CircleReading>
              <CircleReading icon={Clock} label={t('circles.lastActive')}>
                <RelativeTime
                  date={circle.lastPostAt ?? circle.createdAt}
                  className="font-mono text-[11px] text-[var(--t-text)]"
                />
              </CircleReading>
            </dl>
            <span className="hidden w-8 shrink-0 items-center justify-center border border-[var(--t-frame)] text-[var(--t-sub)] transition-colors duration-100 [transition-timing-function:steps(2,end)] group-hover:border-[var(--t-accent)]/70 group-hover:text-[var(--t-accent)] group-focus-visible:border-[var(--t-accent)]/70 group-focus-visible:text-[var(--t-accent)] md:flex">
              <ArrowUpRight aria-hidden className="h-4 w-4" />
            </span>
          </div>
        </div>

        <div className="mt-3 flex min-h-7 min-w-0 items-center gap-2 border-t border-[var(--t-noise2)] pt-2">
          <Flame aria-hidden className="h-3.5 w-3.5 shrink-0 text-[var(--t-accent)]/75" />
          <span className="shrink-0 font-sans text-[11px] font-medium tracking-normal text-[var(--t-faint)]">
            {t('circles.activeDiscussion')}
          </span>
          <span
            className={`min-w-0 truncate text-[12px] ${
              activePost ? 'text-[var(--t-text)]' : 'text-[var(--t-faint)]'
            }`}
          >
            {activePost?.title ?? t('circles.noActiveDiscussion')}
          </span>
        </div>
      </Link>
    </article>
  );
}

function CircleReading({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 px-2 py-2 sm:px-3">
      <dt className="flex items-center gap-1 font-sans text-[10px] font-medium tracking-normal text-[var(--t-faint)]">
        <Icon aria-hidden className="h-3 w-3 shrink-0" />
        <span className="truncate">{label}</span>
      </dt>
      <dd className="mt-1 truncate font-mono text-sm font-semibold tabular-nums text-[var(--t-text)]">
        {children}
      </dd>
    </div>
  );
}
