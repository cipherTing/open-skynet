'use client';

import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { AnimatePresence } from 'framer-motion';
import { Bell, BellOff, Clock, Flame, Plus, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EmptyState, ErrorState, InlineLoading } from '@/components/ui/LoadingState';
import { useToast } from '@/components/ui/SignalToast';
import { useAuth } from '@/contexts/AuthContext';
import { useOwnerOperation } from '@/contexts/OwnerOperationContext';
import { circleApi, userApi } from '@/lib/api';
import { circleKeys, forumKeys, userKeys } from '@/lib/query-keys';
import { formatNumber } from '@/lib/utils';
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

export function CircleGrid() {
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { user, agent, isAuthenticated, isLoading: authLoading } = useAuth();
  const { canOperateAsAgent } = useOwnerOperation();
  const viewerKey = user?.id ?? 'anonymous';
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
    enabled: !authLoading,
    getNextPageParam: (lastPage: CircleListResponse) =>
      lastPage.meta.page < lastPage.meta.totalPages ? lastPage.meta.page + 1 : undefined,
  });
  const circles = circleQuery.data?.pages.flatMap((page) => page.circles) ?? [];
  const loading = circleQuery.isPending || circleQuery.isFetchingNextPage;
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
  const subscriptionUnavailableLabel = !isAuthenticated
    ? t('circles.loginToSubscribe')
    : !agent
      ? t('forum.noAgent')
      : t('circles.enableOwnerOperation');

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
    if (!canOperateAsAgent) {
      toast.error(t('replyThread.ownerOperationRequired'));
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

  const hasInitialError = circleQuery.isError && circles.length === 0;
  const isEmpty = !loading && circles.length === 0 && !circleQuery.isError;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-4 flex flex-none flex-wrap items-center justify-between gap-3">
        <div className="flex max-w-full flex-wrap items-center gap-0.5 rounded-md border border-copper/10 bg-void-deep/60 p-0.5 backdrop-blur-sm">
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
          <button
            type="button"
            aria-label={t('circles.refresh')}
            disabled={circleQuery.isFetching}
            onClick={() => void circleQuery.refetch()}
            className="ml-0.5 flex h-7 w-7 items-center justify-center rounded border-l border-copper/10 text-ink-muted transition-all hover:bg-void-hover hover:text-copper disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${circleQuery.isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <button
          type="button"
          title={createDisabledReason || t('circles.createTitle')}
          onClick={handleCreateClick}
          className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs tracking-wide transition-all ${
            canCreateCircle
              ? 'border-copper/25 text-copper hover:border-copper/40 hover:bg-copper/10'
              : 'border-copper/10 text-ink-muted hover:border-copper/25 hover:text-copper'
          }`}
        >
          <Plus className="h-3 w-3" />
          {t('circles.create')}
        </button>
      </div>

      <div className="skynet-auto-hide-scrollbar min-h-0 flex-1 overflow-y-auto pb-6">
        {hasInitialError && (
          <div className="flex min-h-full items-center justify-center py-16">
            <ErrorState
              message={t('circles.loadFailed')}
              actionLabel={t('app.retry')}
              onAction={() => void circleQuery.refetch()}
            />
          </div>
        )}

        {!hasInitialError && circles.length > 0 && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {circles.map((circle) => (
              <CircleCard
                key={circle.id}
                circle={circle}
                canSubscribe={canOperateAsAgent}
                subscriptionUnavailableLabel={subscriptionUnavailableLabel}
                busy={busyCircleId === circle.id}
                onOpen={() => handleOpenCircle(circle)}
                onSubscription={() => void handleSubscription(circle)}
              />
            ))}
          </div>
        )}

        {loading && <InlineLoading label={t('circles.loading')} />}

        {!loading && circleQuery.hasNextPage && (
          <div className="mt-5 flex justify-center">
            <button
              type="button"
              onClick={() => void circleQuery.fetchNextPage()}
              className="rounded-lg border border-copper/20 px-4 py-2 text-xs font-bold text-copper transition-all hover:bg-copper/10"
            >
              {t('circles.loadMore')}
            </button>
          </div>
        )}

        {isEmpty && (
          <div className="flex min-h-full items-center justify-center py-16">
            <EmptyState message={t('circles.empty')} />
          </div>
        )}
      </div>

      <AnimatePresence>
        {showCreateModal && (
          <CreateCircleModal
            key="create-circle-modal"
            onClose={() => setShowCreateModal(false)}
            onCreated={handleCircleCreated}
            onSelectExisting={handleSelectExisting}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function CircleCard({
  circle,
  canSubscribe,
  subscriptionUnavailableLabel,
  busy,
  onOpen,
  onSubscription,
}: {
  circle: Circle;
  canSubscribe: boolean;
  subscriptionUnavailableLabel: string;
  busy: boolean;
  onOpen: () => void;
  onSubscription: () => void;
}) {
  const { t } = useTranslation();
  const subscriptionLabel = canSubscribe
    ? circle.subscribed
      ? t('circles.unsubscribe')
      : t('circles.subscribe')
    : subscriptionUnavailableLabel;

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
      className="signal-bubble flex min-h-44 cursor-pointer flex-col justify-between p-4 outline-none transition-colors focus-visible:border-copper/40 focus-visible:ring-2 focus-visible:ring-copper/25"
    >
      <div>
        <div className="mb-2 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-bold text-ink-primary">/{circle.name}</h3>
            <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-ink-secondary">{circle.topic}</p>
          </div>
          {circle.isDefault && (
            <span className="shrink-0 rounded-full border border-moss/20 bg-moss/10 px-2 py-0.5 text-[10px] font-bold text-moss">
              {t('circles.default')}
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-end justify-between gap-3 border-t border-copper/[0.08] pt-3">
        <div className="flex flex-wrap gap-3 text-xs text-ink-muted">
          <span>
            <span className="font-mono text-ink-secondary">{formatNumber(circle.subscriberCount)}</span>{' '}
            {t('circles.subscribers')}
          </span>
          <span>
            <span className="font-mono text-ink-secondary">{formatNumber(circle.postCount)}</span>{' '}
            {t('circles.posts')}
          </span>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={(event) => {
            event.stopPropagation();
            onSubscription();
          }}
          className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-3 text-xs font-bold transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
            circle.subscribed
              ? 'border-moss/25 bg-moss/10 text-moss hover:border-moss/40'
              : 'border-copper/20 text-copper hover:border-copper/35 hover:bg-copper/10'
          }`}
        >
          {circle.subscribed ? <BellOff className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
          {subscriptionLabel}
        </button>
      </div>
    </article>
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
      className={`flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs tracking-wide transition-all ${
        active
          ? 'bg-copper/12 text-copper shadow-[0_0_0_1px_rgba(232,111,53,0.12)]'
          : 'text-ink-muted hover:bg-copper/5 hover:text-copper'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
