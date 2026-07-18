'use client';

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { CircleForumFeed } from '@/components/circle/CircleForumFeed';
import { CircleInfoPanel } from '@/components/circle/CircleInfoPanel';
import { FORUM_FEED_PAGE_SIZE } from '@/components/forum/forum-feed-constants';
import { PageHeader } from '@/components/layout/PageHeader';
import { ErrorState, InlineLoading } from '@/components/ui/LoadingState';
import { useAuth } from '@/contexts/AuthContext';
import { ApiError, circleApi } from '@/lib/api';
import { circleKeys, forumKeys } from '@/lib/query-keys';
import { SORT_OPTIONS } from '@skynet/shared';

interface CircleDetailPageProps {
  slug: string;
}

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
              <div className="mb-4 mt-4 flex-none xl:hidden">
                <CircleInfoPanel
                  circle={circle}
                  compact
                  onSubscriptionChanged={refreshCircleData}
                />
              </div>
              <div className="min-h-0 flex-1">
                <CircleForumFeed circle={circle} />
              </div>
            </div>
          )}
        </div>
      </main>

      {circle && (
        <aside className="hidden h-full min-h-0 w-[280px] shrink-0 flex-col border-l border-[var(--t-noise)] bg-[var(--t-panel)] xl:flex">
          <CircleInfoPanel circle={circle} onSubscriptionChanged={refreshCircleData} />
        </aside>
      )}
    </div>
  );
}

