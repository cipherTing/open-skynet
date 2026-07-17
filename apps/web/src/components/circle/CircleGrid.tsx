'use client';

import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import {
  ArrowRight,
  Bell,
  BellOff,
  Clock,
  Flame,
  Plus,
  RefreshCw,
  Search,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ErrorState, InlineLoading } from '@/components/ui/LoadingState';
import { useToast } from '@/components/ui/SignalToast';
import { TelemetryValue } from '@/components/home/terminal/TelemetryValue';
import { circleFileNo, circleSigil } from '@/components/circle/circle-sigil';
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
  const [selectedCircleId, setSelectedCircleId] = useState<string | null>(null);
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

  // 名录选中态：派生自用户点选 id；若该圈已不在当前名录（排序/搜索/刷新），回退到首条。
  const selectedCircle =
    circles.find((circle) => circle.id === selectedCircleId) ?? circles[0] ?? null;

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

      <div className="flex min-h-0 flex-1">
        <div className="skynet-auto-hide-scrollbar min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain pb-6">
          {hasInitialError && (
            <div className="flex min-h-full items-center justify-center py-16">
              <ErrorState
                message={t('circles.loadFailed')}
                actionLabel={t('app.retry')}
                onAction={() => void activeQuery.refetch()}
              />
            </div>
          )}

          {selectedCircle ? (
            <div className="mb-5 lg:hidden">
              <CirclePreviewDossier
                circle={selectedCircle}
                canSubscribe={isAuthenticated && Boolean(agent)}
                subscriptionDisabledReason={subscriptionDisabledReason}
                busy={busyCircleId === selectedCircle.id}
                onOpen={() => handleOpenCircle(selectedCircle)}
                onSubscription={() => void handleSubscription(selectedCircle)}
              />
            </div>
          ) : null}

          {!hasInitialError && circles.length > 0 && (
            <div className="divide-y divide-[#122012] border-y border-[#1A2E1A]">
              {circles.map((circle, index) => (
                <CircleRegistryRow
                  key={circle.id}
                  index={index}
                  circle={circle}
                  selected={circle.id === selectedCircleId}
                  onSelect={() => setSelectedCircleId(circle.id)}
                  onOpen={() => handleOpenCircle(circle)}
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

        {selectedCircle ? (
          <aside className="hidden h-full min-h-0 w-[320px] shrink-0 border-l border-[#1A2E1A] lg:block">
            <CirclePreviewDossier
              circle={selectedCircle}
              canSubscribe={isAuthenticated && Boolean(agent)}
              subscriptionDisabledReason={subscriptionDisabledReason}
              busy={busyCircleId === selectedCircle.id}
              onOpen={() => handleOpenCircle(selectedCircle)}
              onSubscription={() => void handleSubscription(selectedCircle)}
            />
          </aside>
        ) : null}
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

/** 名录行：sigil + 圈名 + 数据簇；单击选中，Enter/点击进入按钮打开档案。 */
function CircleRegistryRow({
  index,
  circle,
  selected,
  onSelect,
  onOpen,
}: {
  index: number;
  circle: Circle;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  const { t } = useTranslation();

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
      aria-current={selected || undefined}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      className={`group relative flex cursor-pointer items-center gap-3 py-3 pl-4 pr-2 outline-none transition-colors duration-100 [transition-timing-function:steps(2,end)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[#ADFF2F] ${
        selected ? 'bg-[#ADFF2F]/[0.06]' : 'hover:bg-[#ADFF2F]/[0.04]'
      }`}
    >
      <span
        aria-hidden
        className={`absolute left-0 top-0 h-full w-[2px] bg-[#ADFF2F] transition-opacity duration-100 [transition-timing-function:steps(2,end)] ${
          selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
      />
      <span
        aria-hidden
        className={`w-14 shrink-0 font-mono text-[11px] tracking-[0.2em] transition-colors duration-100 [transition-timing-function:steps(2,end)] ${
          selected ? 'text-[#ADFF2F]' : 'text-[#3A5A3A] group-hover:text-[#ADFF2F]/70'
        }`}
      >
        {circleSigil(circle.slug)}
      </span>
      <span
        aria-hidden
        className={`hidden w-12 shrink-0 font-mono text-[10px] tracking-[0.15em] transition-colors duration-100 [transition-timing-function:steps(2,end)] sm:block ${
          selected ? 'text-[#ADFF2F]/80' : 'text-[#3A5A3A] group-hover:text-[#ADFF2F]/70'
        }`}
      >
        N-{String(index + 1).padStart(3, '0')}
      </span>

      <div className="min-w-0 flex-1 transition-transform duration-100 [transition-timing-function:steps(2,end)] group-hover:translate-x-1">
        <div className="flex items-center gap-2">
          <h3
            className={`truncate text-base font-black tracking-tight transition-colors duration-100 [transition-timing-function:steps(2,end)] ${
              selected ? 'text-[#ADFF2F]' : 'text-white'
            }`}
          >
            /{circle.name}
          </h3>
          {circle.kind === 'OFFICIAL' ? <TTag color="accent">{t('circles.official')}</TTag> : null}
        </div>
        <p className="mt-0.5 line-clamp-1 text-xs leading-5 text-[#EDF3ED]/50">{circle.topic}</p>
      </div>

      <div className="hidden shrink-0 items-center gap-5 md:flex">
        <TelemetryReading label={t('circles.subscribers')} value={circle.subscriberCount} />
        <TelemetryReading label={t('circles.posts')} value={circle.postCount} />
      </div>

      <Timecode
        date={circle.lastPostAt ?? circle.createdAt}
        withDate
        className={`hidden shrink-0 transition-colors duration-100 [transition-timing-function:steps(2,end)] lg:block ${
          selected ? 'text-[#ADFF2F]' : 'group-hover:text-[#ADFF2F]'
        }`}
      />

      <button
        type="button"
        aria-label={t('circleRegistry.enter')}
        onClick={(event) => {
          event.stopPropagation();
          onOpen();
        }}
        className={`flex h-7 w-7 shrink-0 items-center justify-center border transition-colors duration-100 [transition-timing-function:steps(2,end)] ${
          selected
            ? 'border-[#ADFF2F]/60 text-[#ADFF2F] hover:bg-[#ADFF2F] hover:text-black'
            : 'border-[#1A2E1A] text-[#3A5A3A] hover:border-[#ADFF2F]/60 hover:text-[#ADFF2F]'
        }`}
      >
        <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </article>
  );
}

/** 选中圈的档案预览：sigil 锚点 + 等宽元数据账簿 + 进入/订阅指令。 */
function CirclePreviewDossier({
  circle,
  canSubscribe,
  subscriptionDisabledReason,
  busy,
  onOpen,
  onSubscription,
}: {
  circle: Circle;
  canSubscribe: boolean;
  subscriptionDisabledReason: string;
  busy: boolean;
  onOpen: () => void;
  onSubscription: () => void;
}) {
  const { t } = useTranslation();
  return (
    <section className="t-corner skynet-auto-hide-scrollbar relative flex h-full min-h-0 flex-col overflow-y-auto overscroll-contain border border-[#1A2E1A] bg-[#040704]">
      <header className="flex flex-none items-center justify-between gap-3 border-b border-[#1A2E1A] px-4 py-2.5">
        <span className="truncate font-mono text-[10px] uppercase tracking-[0.15em] text-white">
          {t('circleRegistry.previewTitle')}
        </span>
        <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.15em] text-[#ADFF2F]">
          FILE #CR-{circleFileNo(circle.slug)}
        </span>
      </header>

      <div className="flex min-h-0 flex-1 flex-col p-4">
        <div className="t-dotgrid flex h-20 items-center justify-center border border-[#1A2E1A] bg-black">
          <span
            aria-hidden
            className="select-none font-mono text-2xl tracking-[0.35em] text-[#ADFF2F] [text-shadow:0_0_6px_rgba(173,255,47,0.35)]"
          >
            {circleSigil(circle.slug)}
          </span>
        </div>

        <div className="mt-4 flex items-start justify-between gap-3">
          <h3 className="min-w-0 truncate text-xl font-black tracking-tight text-white">
            /{circle.name}
          </h3>
          {circle.kind === 'OFFICIAL' ? <TTag color="accent">{t('circles.official')}</TTag> : null}
        </div>
        <p className="mt-2 text-sm leading-6 text-[#EDF3ED]/70">{circle.topic}</p>

        <dl className="mt-4 divide-y divide-[#122012] border-y border-[#122012]">
          <DossierLedgerRow label={t('circles.subscribers')}>
            <TelemetryValue
              value={circle.subscriberCount}
              format={formatTelemetryCount}
              jitterPct={0.05}
              className="font-mono text-sm font-semibold text-[#EDF3ED]"
            />
          </DossierLedgerRow>
          <DossierLedgerRow label={t('circles.posts')}>
            <TelemetryValue
              value={circle.postCount}
              format={formatTelemetryCount}
              jitterPct={0.05}
              className="font-mono text-sm font-semibold text-[#EDF3ED]"
            />
          </DossierLedgerRow>
          <DossierLedgerRow label={t('circles.detail.activeProposals')}>
            <TelemetryValue
              value={circle.activeProposalCount}
              format={formatTelemetryCount}
              jitterPct={0.05}
              className="font-mono text-sm font-semibold text-[#EDF3ED]"
            />
          </DossierLedgerRow>
          <DossierLedgerRow label={t('circleRegistry.lastActive')}>
            <Timecode date={circle.lastPostAt ?? circle.createdAt} withDate />
          </DossierLedgerRow>
          <DossierLedgerRow label={t('circles.detail.filedAt')}>
            <Timecode date={circle.createdAt} withDate />
          </DossierLedgerRow>
        </dl>

        <div className="mt-auto flex flex-col gap-2 pt-4">
          <TButton variant="primary" onClick={onOpen} className="w-full">
            <ArrowRight className="h-3 w-3" />
            {t('circleRegistry.enter')}
          </TButton>
          <TButton
            variant="secondary"
            disabled={busy || !canSubscribe}
            title={!canSubscribe ? subscriptionDisabledReason : undefined}
            onClick={onSubscription}
            className="w-full"
          >
            {circle.subscribed ? <BellOff className="h-3 w-3" /> : <Bell className="h-3 w-3" />}
            {circle.subscribed ? t('circles.unsubscribe') : t('circles.subscribe')}
          </TButton>
        </div>
      </div>
    </section>
  );
}

function DossierLedgerRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <dt className="font-mono text-[9px] uppercase tracking-[0.15em] text-[#3A5A3A]">{label}</dt>
      <dd className="shrink-0">{children}</dd>
    </div>
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
