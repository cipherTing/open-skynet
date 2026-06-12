'use client';

import { useEffect } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useInView } from 'react-intersection-observer';
import { Bell } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EmptyState, ErrorState, InlineLoading } from '@/components/ui/LoadingState';
import { useAuth } from '@/contexts/AuthContext';
import { forumApi } from '@/lib/api';
import { forumKeys } from '@/lib/query-keys';
import { formatNumber } from '@/lib/utils';
import type { AgentCirclesResponse } from '@skynet/shared';

interface AgentCirclesTabProps {
  agentId: string;
}

const PAGE_SIZE = 18;

export function AgentCirclesTab({ agentId }: AgentCirclesTabProps) {
  const { t } = useTranslation();
  const { isLoading: authLoading, user } = useAuth();
  const viewerKey = user?.id ?? 'anonymous';
  const { ref: loaderRef, inView } = useInView({ threshold: 0.5 });
  const circlesQuery = useInfiniteQuery({
    queryKey: forumKeys.agentCircles(viewerKey, agentId, PAGE_SIZE),
    queryFn: ({ pageParam }) =>
      forumApi.listAgentCircles(agentId, {
        page: Number(pageParam),
        pageSize: PAGE_SIZE,
      }),
    initialPageParam: 1,
    enabled: !authLoading,
    getNextPageParam: (lastPage: AgentCirclesResponse) =>
      lastPage.meta.page < lastPage.meta.totalPages ? lastPage.meta.page + 1 : undefined,
  });
  const circles = circlesQuery.data?.pages.flatMap((page) => page.circles) ?? [];
  const loading = circlesQuery.isPending || circlesQuery.isFetchingNextPage;
  const hasMore = circlesQuery.hasNextPage === true;
  const errorKey = circlesQuery.isError ? 'agent.circlesLoadFailed' : '';

  useEffect(() => {
    if (inView && hasMore && !circlesQuery.isFetchingNextPage && circles.length > 0) {
      void circlesQuery.fetchNextPage();
    }
  }, [circles.length, circlesQuery, hasMore, inView]);

  if (errorKey && circles.length === 0) {
    return <ErrorState message={t(errorKey)} />;
  }

  if (!loading && circles.length === 0) {
    return <EmptyState message={t('agent.noCircles')} />;
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {circles.map((circle) => (
          <article key={circle.id} className="signal-bubble p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-base font-bold text-ink-primary">/{circle.name}</h3>
                <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-ink-secondary">
                  {circle.topic}
                </p>
              </div>
              {circle.subscribed && <Bell className="h-4 w-4 shrink-0 text-moss" />}
            </div>
            <div className="flex flex-wrap gap-3 border-t border-copper/[0.08] pt-3 text-xs text-ink-muted">
              <span>
                <span className="font-mono text-ink-secondary">{formatNumber(circle.subscriberCount)}</span>{' '}
                {t('circles.subscribers')}
              </span>
              <span>
                <span className="font-mono text-ink-secondary">{formatNumber(circle.postCount)}</span>{' '}
                {t('circles.posts')}
              </span>
            </div>
          </article>
        ))}
      </div>

      {loading && <InlineLoading />}

      {errorKey && circles.length > 0 && (
        <div className="py-4 text-center">
          <button
            type="button"
            onClick={() => void (hasMore ? circlesQuery.fetchNextPage() : circlesQuery.refetch())}
            className="text-xs text-copper transition-colors hover:text-copper-bright"
          >
            {t('agent.loadMoreFailed')}
          </button>
        </div>
      )}

      {hasMore && !loading && !errorKey && <div ref={loaderRef} className="h-8" />}

      {!hasMore && circles.length > 0 && (
        <div className="py-6 text-center text-xs tracking-wide text-ink-muted">
          <div className="flex items-center justify-center gap-3">
            <div className="w-8 deck-divider" />
            <span>{t('agent.circlesEnd')}</span>
            <div className="w-8 deck-divider" />
          </div>
        </div>
      )}
    </div>
  );
}
