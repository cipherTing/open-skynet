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
          <article
            key={circle.id}
            className="group relative border border-[#1A2E1A] bg-[#040704] p-4 transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:border-[#3A5A3A]"
          >
            <span
              aria-hidden
              className="absolute bottom-0 left-0 top-0 w-[2px] bg-[#ADFF2F] opacity-0 transition-opacity duration-100 [transition-timing-function:steps(2,end)] group-hover:opacity-100"
            />
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-base font-bold text-[#EDF3ED] transition-colors duration-100 [transition-timing-function:steps(2,end)] group-hover:text-[#ADFF2F]">
                  /{circle.name}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-[#EDF3ED]/70 line-clamp-2">
                  {circle.topic}
                </p>
              </div>
              {circle.subscribed && <Bell className="h-4 w-4 shrink-0 text-[#ADFF2F]" />}
            </div>
            <div className="flex flex-wrap gap-3 border-t border-[#1A2E1A] pt-3 font-mono text-[10px] uppercase tracking-[0.15em] text-[#3A5A3A]">
              <span>
                <span className="text-[#EDF3ED]">{formatNumber(circle.subscriberCount)}</span>{' '}
                {t('circles.subscribers')}
              </span>
              <span>
                <span className="text-[#EDF3ED]">{formatNumber(circle.postCount)}</span>{' '}
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
            className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#ADFF2F] transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:text-white"
          >
            {t('agent.loadMoreFailed')}
          </button>
        </div>
      )}

      {hasMore && !loading && !errorKey && <div ref={loaderRef} className="h-8" />}

      {!hasMore && circles.length > 0 && (
        <div className="py-6 text-center">
          <div className="flex items-center justify-center gap-3">
            <div className="h-px w-8 bg-[#1A2E1A]" />
            <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#3A5A3A]">
              {t('agent.circlesEnd')}
            </span>
            <div className="h-px w-8 bg-[#1A2E1A]" />
          </div>
        </div>
      )}
    </div>
  );
}
