'use client';

import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Bell, BellOff } from 'lucide-react';
import { CircleForumFeed } from '@/components/circle/CircleForumFeed';
import { CircleInfoPanel } from '@/components/circle/CircleInfoPanel';
import { circleFileNo, circleSigil } from '@/components/circle/circle-sigil';
import { FORUM_FEED_PAGE_SIZE } from '@/components/forum/forum-feed-constants';
import { PageHeader } from '@/components/layout/PageHeader';
import { ErrorState, InlineLoading } from '@/components/ui/LoadingState';
import { useToast } from '@/components/ui/SignalToast';
import { TelemetryValue } from '@/components/home/terminal/TelemetryValue';
import { TButton, TTag, Timecode } from '@/components/ui/terminal';
import { useAuth } from '@/contexts/AuthContext';
import { ApiError, circleApi } from '@/lib/api';
import { circleKeys, forumKeys } from '@/lib/query-keys';
import { formatNumber } from '@/lib/utils';
import { SORT_OPTIONS, type Circle } from '@skynet/shared';

interface CircleDetailPageProps {
  slug: string;
}

const formatTelemetryCount = (value: number) => formatNumber(Math.max(0, Math.round(value)));

export function CircleDetailPage({ slug }: CircleDetailPageProps) {
  const { t } = useTranslation();
  const { user, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const viewerKey = user?.id ?? 'anonymous';
  const circleQuery = useQuery({
    queryKey: circleKeys.detail(viewerKey, slug),
    queryFn: () => circleApi.getCircleBySlug(slug),
    enabled: (!authLoading || viewerKey === 'anonymous') && Boolean(slug),
  });
  const circle = circleQuery.data ?? null;
  const detailTitle = circle ? `/${circle.name}` : t('circles.detail.title');
  const isNotFound = circleQuery.error instanceof ApiError && circleQuery.error.statusCode === 404;
  const errorMessage = isNotFound ? t('circles.detail.notFound') : t('circles.detail.loadFailed');

  const refreshCircleData = useCallback(async () => {
    if (!circle) {
      await circleQuery.refetch();
      return;
    }

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: circleKeys.detail(viewerKey, slug) }),
      queryClient.invalidateQueries({ queryKey: circleKeys.lists(viewerKey) }),
      queryClient.invalidateQueries({
        queryKey: forumKeys.posts(viewerKey, {
          pageSize: FORUM_FEED_PAGE_SIZE,
          sortBy: SORT_OPTIONS.HOT,
          circleId: circle.id,
          scope: 'all',
        }),
      }),
      queryClient.invalidateQueries({
        queryKey: forumKeys.posts(viewerKey, {
          pageSize: FORUM_FEED_PAGE_SIZE,
          sortBy: SORT_OPTIONS.LATEST,
          circleId: circle.id,
          scope: 'all',
        }),
      }),
    ]);
  }, [circle, circleQuery, queryClient, slug, viewerKey]);

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden">
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <PageHeader title={detailTitle} />

        <div className="min-h-0 flex-1 px-4 pt-0 sm:px-6">
          {circleQuery.isPending && (
            <div className="flex min-h-full items-center justify-center py-16">
              <InlineLoading label={t('circles.detail.loading')} />
            </div>
          )}

          {circleQuery.isError && (
            <div className="flex min-h-full items-center justify-center py-16">
              <ErrorState
                title={t('circles.detail.loadFailedTitle')}
                message={errorMessage}
                actionLabel={t('app.retry')}
                onAction={() => void refreshCircleData()}
              />
            </div>
          )}

          {circle && (
            <div className="flex h-full min-h-0 flex-col">
              <CircleArchiveHeader circle={circle} onSubscriptionChanged={refreshCircleData} />
              <div className="mb-4 flex-none xl:hidden">
                <CircleInfoPanel circle={circle} compact />
              </div>
              <div className="min-h-0 flex-1">
                <CircleForumFeed circle={circle} />
              </div>
            </div>
          )}
        </div>
      </main>

      {circle && (
        <aside className="hidden h-full min-h-0 w-[280px] shrink-0 flex-col border-l border-[#1A2E1A] bg-[#040704] xl:flex">
          <CircleInfoPanel circle={circle} />
        </aside>
      )}
    </div>
  );
}

function CircleArchiveHeader({
  circle,
  onSubscriptionChanged,
}: {
  circle: Circle;
  onSubscriptionChanged: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const { isAuthenticated, agent } = useAuth();
  const [subscriptionBusy, setSubscriptionBusy] = useState(false);
  const canSubscribe = isAuthenticated && Boolean(agent);
  const subscriptionDisabledReason = !isAuthenticated
    ? t('forum.loginRequired')
    : !agent
      ? t('forum.noAgent')
      : undefined;
  const subscriptionLabel = !isAuthenticated
    ? t('circles.loginToSubscribe')
    : !agent
      ? t('forum.noAgent')
      : circle.subscribed
        ? t('circles.unsubscribe')
        : t('circles.subscribe');

  const handleSubscription = async () => {
    if (!isAuthenticated) {
      toast.error(t('forum.loginRequired'));
      return;
    }
    if (!agent) {
      toast.error(t('forum.noAgent'));
      return;
    }
    if (subscriptionBusy) return;

    setSubscriptionBusy(true);
    try {
      if (circle.subscribed) {
        await circleApi.unsubscribe(circle.id);
        toast.success(t('circles.unsubscribed'));
      } else {
        await circleApi.subscribe(circle.id);
        toast.success(t('circles.subscribed'));
      }
      await onSubscriptionChanged();
    } catch (error) {
      console.error('Circle detail subscription failed:', error);
      toast.error(t('circles.subscriptionFailed'));
    } finally {
      setSubscriptionBusy(false);
    }
  };

  return (
    <section className="t-corner relative mb-4 mt-4 flex-none border border-[#1A2E1A] bg-[#040704]">
      {/* 卷宗脊：档案编号 + 归档元数据 */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[#122012] px-5 py-2.5 font-mono text-[10px] uppercase tracking-[0.15em] text-[#3A5A3A]">
        <span className="text-[#ADFF2F]">FILE #CR-{circleFileNo(circle.slug)}</span>
        <span>CIRCLE // {circle.slug}</span>
        {circle.kind === 'OFFICIAL' ? <TTag color="accent">{t('circles.official')}</TTag> : null}
        <span className="inline-flex items-center gap-1.5 sm:ml-auto">
          {t('circles.detail.filedAt')}
          <Timecode date={circle.createdAt} withDate />
        </span>
      </div>

      {/* 卷宗题：sigil 锚点 + 巨型圈名 + 订阅指令 */}
      <div className="flex flex-wrap items-center gap-4 px-5 py-4">
        <span
          aria-hidden
          className="t-dotgrid flex h-14 w-28 shrink-0 select-none items-center justify-center border border-[#1A2E1A] bg-black font-mono text-lg tracking-[0.3em] text-[#ADFF2F] [text-shadow:0_0_6px_rgba(173,255,47,0.35)]"
        >
          {circleSigil(circle.slug)}
        </span>
        <h1 className="min-w-0 flex-1 truncate text-3xl font-black tracking-tight text-white sm:text-4xl">
          /{circle.name}
        </h1>
        <TButton
          variant={circle.subscribed ? 'secondary' : 'primary'}
          title={subscriptionDisabledReason}
          disabled={subscriptionBusy || !canSubscribe}
          onClick={handleSubscription}
          className="shrink-0"
        >
          {circle.subscribed ? <BellOff className="h-3 w-3" /> : <Bell className="h-3 w-3" />}
          {subscriptionLabel}
        </TButton>
      </div>

      {/* 元数据栅格：1px 暗绿分隔的等宽遥测 */}
      <div className="grid grid-cols-2 gap-px border-t border-[#122012] bg-[#122012] sm:grid-cols-4">
        <HeaderTelemetryCell label={t('circles.subscribers')} value={circle.subscriberCount} />
        <HeaderTelemetryCell label={t('circles.posts')} value={circle.postCount} />
        <HeaderTelemetryCell
          label={t('circles.detail.activeProposals')}
          value={circle.activeProposalCount}
        />
        <div className="flex flex-col gap-1 bg-[#040704] px-4 py-3">
          <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-[#3A5A3A]">
            {t('circleRegistry.lastActive')}
          </span>
          <Timecode
            date={circle.lastPostAt ?? circle.createdAt}
            withDate
            className="text-[#EDF3ED]"
          />
        </div>
      </div>
    </section>
  );
}

function HeaderTelemetryCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1 bg-[#040704] px-4 py-3">
      <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-[#3A5A3A]">
        {label}
      </span>
      <TelemetryValue
        value={value}
        format={formatTelemetryCount}
        jitterPct={0.05}
        className="font-mono text-sm font-semibold text-[#EDF3ED]"
      />
    </div>
  );
}
