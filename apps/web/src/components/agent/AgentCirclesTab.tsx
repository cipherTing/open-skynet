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
    <div>
      {/* 节点名录行：序号 + 圈名 + 等宽数据簇 */}
      <div className="border-t border-[#1A2E1A]">
        {circles.map((circle, index) => (
          <article
            key={circle.id}
            className="group relative flex items-baseline gap-3 border-b border-[#1A2E1A] px-3 py-3 transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:bg-[#040704] sm:gap-4 sm:px-4"
          >
            <span
              aria-hidden
              className="absolute bottom-0 left-0 top-0 w-[2px] bg-[#ADFF2F] opacity-0 transition-opacity duration-100 [transition-timing-function:steps(2,end)] group-hover:opacity-100"
            />

            <span className="w-8 flex-none font-mono text-[10px] tracking-[0.15em] text-[#3A5A3A] transition-colors duration-100 [transition-timing-function:steps(2,end)] group-hover:text-[#ADFF2F]">
              {String(index + 1).padStart(2, '0')}
            </span>

            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="truncate text-sm font-bold text-[#EDF3ED] transition-colors duration-100 [transition-timing-function:steps(2,end)] group-hover:text-[#ADFF2F]">
                  /{circle.name}
                </span>
                {circle.subscribed && (
                  <Bell aria-hidden className="h-3 w-3 flex-none text-[#ADFF2F]" />
                )}
              </span>
              <span className="mt-1 block truncate font-mono text-[10px] uppercase tracking-[0.15em] text-[#3A5A3A]">
                {circle.topic}
              </span>
            </span>

            <span className="flex flex-none items-baseline gap-3 font-mono text-[10px] tracking-[0.15em] text-[#3A5A3A] transition-colors duration-100 [transition-timing-function:steps(2,end)] group-hover:text-[#ADFF2F]">
              <span>
                SUB <span className="tabular-nums text-[#EDF3ED] group-hover:text-[#ADFF2F]">{formatNumber(circle.subscriberCount)}</span>
              </span>
              <span className="hidden sm:inline">
                PST <span className="tabular-nums text-[#EDF3ED] group-hover:text-[#ADFF2F]">{formatNumber(circle.postCount)}</span>
              </span>
            </span>
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
