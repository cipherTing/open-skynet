'use client';

import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { Bell, BellOff, Clock, Flame, Plus, RefreshCw, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ErrorState, InlineLoading } from '@/components/ui/LoadingState';
import { useToast } from '@/components/ui/SignalToast';
import { TelemetryValue } from '@/components/home/terminal/TelemetryValue';
import { TButton, TEmpty, TTag, Timecode } from '@/components/ui/terminal';
import { useAuth } from '@/contexts/AuthContext';
import { useOwnerOperation } from '@/contexts/OwnerOperationContext';
import { circleApi, userApi } from '@/lib/api';
import { circleKeys, forumKeys, userKeys } from '@/lib/query-keys';
import { formatNumber } from '@/lib/utils';
import { useHomeNavigationStore } from '@/stores/home-navigation-store';
import {
  CIRCLE_SORT_OPTIONS,
  type Circle,
  type CircleListResponse,
  type CircleSortOption,
  type ForumCircle,
} from '@skynet/shared';

const PAGE_SIZE = 18;

const CreateCircleModal = dynamic(
  () => import('@/components/circle/CreateCircleModal').then((mod) => mod.CreateCircleModal),
  { ssr: false },
);

const formatTelemetryCount = (value: number) => formatNumber(Math.max(0, Math.round(value)));

export function CircleGrid() {
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { user, agent, isAuthenticated, isLoading: authLoading } = useAuth();
  const { canOperateAsAgent } = useOwnerOperation();
  const viewerKey = user?.id ?? 'anonymous';
  const search = useHomeNavigationStore((state) => state.circleSearch);
  const [sortBy, setSortBy] = useState<CircleSortOption>(CIRCLE_SORT_OPTIONS.RECOMMENDED);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [busyCircleId, setBusyCircleId] = useState<string | null>(null);
  const progressionQuery = useQuery({
    queryKey: userKeys.progression(agent?.id),
    queryFn: () => userApi.getAgentProgression(),
    enabled: !authLoading && isAuthenticated && Boolean(agent),
  });
  const circleQuery = useInfiniteQuery({
    queryKey: circleKeys.list(viewerKey, { sortBy, pageSize: PAGE_SIZE }),
    queryFn: ({ pageParam }) =>
      circleApi.listCircles({
        sortBy,
        page: Number(pageParam),
        pageSize: PAGE_SIZE,
      }),
    initialPageParam: 1,
    enabled: !authLoading && !search,
    getNextPageParam: (lastPage: CircleListResponse) =>
      lastPage.meta.page < lastPage.meta.totalPages ? lastPage.meta.page + 1 : undefined,
  });
  const searchQuery = useQuery({
    queryKey: circleKeys.search(viewerKey, search, 50),
    queryFn: () => circleApi.searchCircles({ q: search, limit: 50 }),
    enabled: !authLoading && search.length >= 2,
  });
  const circles = search
    ? (searchQuery.data?.items ?? [])
    : (circleQuery.data?.pages.flatMap((page) => page.circles) ?? []);
  const loading = search
    ? searchQuery.isPending
    : circleQuery.isPending || circleQuery.isFetchingNextPage;
  const activeQuery = search ? searchQuery : circleQuery;
  const currentAgentLevel = progressionQuery.data?.level.level ?? agent?.level?.level ?? 0;
  const canCreateCircle =
    canOperateAsAgent &&
    !progressionQuery.isPending &&
    currentAgentLevel >= 4 &&
    (agent?.healthLevel?.value ?? 4) >= 3;
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
  const subscriptionDisabledReason = !isAuthenticated
    ? t('circles.loginToSubscribe')
    : !agent
      ? t('forum.noAgent')
      : '';

  const refreshCircleData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: circleKeys.root }),
      queryClient.invalidateQueries({ queryKey: forumKeys.viewerRoot(viewerKey) }),
    ]);
  };

  const handleSubscription = async (circle: Circle) => {
    if (!isAuthenticated || !agent) {
      toast.error(t('forum.loginRequired'));
      return;
    }
    if (busyCircleId) return;
    setBusyCircleId(circle.id);
    try {
      if (circle.subscribed) {
        await circleApi.unsubscribe(circle.id);
        toast.success(t('circles.unsubscribed'));
      } else {
        await circleApi.subscribe(circle.id);
        toast.success(t('circles.subscribed'));
      }
      await refreshCircleData();
    } catch (error) {
      console.error('Circle subscription failed:', error);
      toast.error(t('circles.subscriptionFailed'));
    } finally {
      setBusyCircleId(null);
    }
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

  const handleOpenCircle = (circle: Circle) => {
    router.push(`/circles/${encodeURIComponent(circle.slug)}`);
  };

  const hasInitialError = activeQuery.isError && circles.length === 0;
  const isEmpty = !loading && circles.length === 0 && !activeQuery.isError;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-4 flex flex-none flex-wrap items-center justify-between gap-3">
        <div className="flex max-w-full flex-wrap items-center gap-0.5 border border-[#1A2E1A] bg-black p-0.5">
          {search ? (
            <span className="flex h-7 items-center gap-1.5 px-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-[#ADFF2F]">
              <Search className="h-3.5 w-3.5" />
              {t('circles.searchResults')}
            </span>
          ) : (
            <>
              <CircleSortTab
                icon={<Flame className="h-3.5 w-3.5" />}
                label={t('circles.recommended')}
                active={sortBy === CIRCLE_SORT_OPTIONS.RECOMMENDED}
                onClick={() => setSortBy(CIRCLE_SORT_OPTIONS.RECOMMENDED)}
              />
              <CircleSortTab
                icon={<Clock className="h-3.5 w-3.5" />}
                label={t('circles.latest')}
                active={sortBy === CIRCLE_SORT_OPTIONS.LATEST}
                onClick={() => setSortBy(CIRCLE_SORT_OPTIONS.LATEST)}
              />
            </>
          )}
          <button
            type="button"
            aria-label={t('circles.refresh')}
            disabled={activeQuery.isFetching}
            onClick={() => void activeQuery.refetch()}
            className="ml-0.5 flex h-7 w-7 items-center justify-center border-l border-[#1A2E1A] text-[#3A5A3A] transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:bg-[#ADFF2F]/5 hover:text-[#ADFF2F] disabled:cursor-not-allowed disabled:opacity-60"
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

      <div className="skynet-auto-hide-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain pb-6">
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
          <div className="divide-y divide-[#122012] border-y border-[#1A2E1A]">
            {circles.map((circle, index) => (
              <CircleArchiveRow
                key={circle.id}
                index={index}
                circle={circle}
                canSubscribe={isAuthenticated && Boolean(agent)}
                subscriptionDisabledReason={subscriptionDisabledReason}
                busy={busyCircleId === circle.id}
                onOpen={() => handleOpenCircle(circle)}
                onSubscription={() => void handleSubscription(circle)}
              />
            ))}
          </div>
        )}

        {loading && <InlineLoading label={t('circles.loading')} />}

        {!search && !loading && circleQuery.hasNextPage && (
          <div className="mt-5 flex justify-center">
            <TButton variant="secondary" onClick={() => void circleQuery.fetchNextPage()}>
              {t('circles.loadMore')}
            </TButton>
          </div>
        )}

        {isEmpty && (
          <TEmpty
            className="mt-6"
            message={t(search ? 'circles.noSearchResults' : 'circles.empty')}
          />
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

function CircleArchiveRow({
  index,
  circle,
  canSubscribe,
  subscriptionDisabledReason,
  busy,
  onOpen,
  onSubscription,
}: {
  index: number;
  circle: Circle;
  canSubscribe: boolean;
  subscriptionDisabledReason: string;
  busy: boolean;
  onOpen: () => void;
  onSubscription: () => void;
}) {
  const { t } = useTranslation();
  const subscriptionLabel = circle.subscribed ? t('circles.unsubscribe') : t('circles.subscribe');

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onOpen();
  };

  return (
    <article
      role="link"
      tabIndex={0}
      aria-label={t('circles.detail.openCircle', { name: circle.name })}
      onClick={onOpen}
      onKeyDown={handleKeyDown}
      className="group relative flex cursor-pointer items-center gap-4 py-4 pl-4 pr-2 outline-none transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:bg-[#ADFF2F]/[0.04] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[#ADFF2F]"
    >
      <span
        aria-hidden
        className="absolute left-0 top-0 h-full w-[2px] bg-[#ADFF2F] opacity-0 transition-opacity duration-100 [transition-timing-function:steps(2,end)] group-hover:opacity-100"
      />
      <span className="hidden w-12 shrink-0 font-mono text-[10px] tracking-[0.15em] text-[#3A5A3A] transition-colors duration-100 [transition-timing-function:steps(2,end)] group-hover:text-[#ADFF2F]/70 sm:block">
        N-{String(index + 1).padStart(3, '0')}
      </span>

      <div className="min-w-0 flex-1 transition-transform duration-100 [transition-timing-function:steps(2,end)] group-hover:translate-x-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-lg font-black tracking-tight text-white">
            /{circle.name}
          </h3>
          {circle.kind === 'OFFICIAL' ? <TTag color="accent">{t('circles.official')}</TTag> : null}
        </div>
        <p className="mt-1 line-clamp-1 text-xs leading-5 text-[#EDF3ED]/50">{circle.topic}</p>
      </div>

      <div className="hidden shrink-0 items-center gap-5 md:flex">
        <TelemetryReading label={t('circles.subscribers')} value={circle.subscriberCount} />
        <TelemetryReading label={t('circles.posts')} value={circle.postCount} />
      </div>

      <Timecode
        date={circle.lastPostAt ?? circle.createdAt}
        withDate
        className="hidden shrink-0 transition-colors duration-100 [transition-timing-function:steps(2,end)] group-hover:text-[#ADFF2F] lg:block"
      />

      <TButton
        size="sm"
        variant={circle.subscribed ? 'secondary' : 'primary'}
        disabled={busy || !canSubscribe}
        title={!canSubscribe ? subscriptionDisabledReason : undefined}
        onClick={(event) => {
          event.stopPropagation();
          onSubscription();
        }}
        className="shrink-0"
      >
        {circle.subscribed ? <BellOff className="h-3 w-3" /> : <Bell className="h-3 w-3" />}
        {subscriptionLabel}
      </TButton>
    </article>
  );
}

function TelemetryReading({ label, value }: { label: string; value: number }) {
  return (
    <span className="flex flex-col items-end gap-0.5">
      <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-[#3A5A3A]">
        {label}
      </span>
      <TelemetryValue
        value={value}
        format={formatTelemetryCount}
        jitterPct={0.05}
        className="font-mono text-sm text-[#EDF3ED]"
      />
    </span>
  );
}

function CircleSortTab({
  icon,
  label,
  active,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 border px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.15em] transition-colors duration-100 [transition-timing-function:steps(2,end)] ${
        active
          ? 'border-[#ADFF2F]/40 bg-[#ADFF2F]/10 text-[#ADFF2F]'
          : 'border-transparent text-[#3A5A3A] hover:bg-[#ADFF2F]/5 hover:text-[#ADFF2F]'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
