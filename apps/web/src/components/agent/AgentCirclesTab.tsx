'use client';

import { useCallback, useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { UsersRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EmptyState, ErrorState } from '@/components/ui/LoadingState';
import { VirtualList } from '@/components/ui/VirtualList';
import { usePageScrollViewport } from '@/components/layout/PageScrollViewport';
import { useAuth } from '@/contexts/AuthContext';
import { forumApi } from '@/lib/api';
import { forumKeys } from '@/lib/query-keys';
import { formatNumber, lastPageAddsUniqueItem, uniqueBy } from '@/lib/utils';
import type { AgentCirclesResponse } from '@skynet/shared';
import { AgentVirtualListTail } from '@/components/agent/AgentVirtualListTail';
import { useCursorPaginationRetry } from '@/hooks/useCursorPaginationRetry';

interface AgentCirclesTabProps {
  agentId: string;
}

const PAGE_SIZE = 18;
const CIRCLE_ROW_ESTIMATED_HEIGHT = 78;

export function AgentCirclesTab({ agentId }: AgentCirclesTabProps) {
  const { t } = useTranslation();
  const { isLoading: authLoading, user } = useAuth();
  const viewerKey = user?.id ?? 'anonymous';
  const scrollElement = usePageScrollViewport();
  const queryKey = forumKeys.agentCircles(viewerKey, agentId, PAGE_SIZE);
  const circlesQuery = useInfiniteQuery({
    queryKey,
    retry: false,
    queryFn: ({ pageParam }) =>
      forumApi.listAgentCircles(agentId, {
        cursor: pageParam,
        limit: PAGE_SIZE,
      }),
    initialPageParam: null,
    enabled: !authLoading,
    getNextPageParam: (lastPage: AgentCirclesResponse) => lastPage.nextCursor ?? undefined,
  });
  const pageSummary = useMemo(() => {
    const pages = circlesQuery.data?.pages ?? [];
    return {
      circles: uniqueBy(
        pages.flatMap((page) => page.items),
        (circle) => circle.id,
      ),
      lastPageHasNewItem: lastPageAddsUniqueItem(
        pages,
        (page) => page.items,
        (circle) => circle.id,
      ),
    };
  }, [circlesQuery.data?.pages]);
  const circles = pageSummary.circles;
  const loading = circlesQuery.isPending || circlesQuery.isFetchingNextPage;
  const hasMore = circlesQuery.hasNextPage === true;
  const manualContinuation = hasMore && !pageSummary.lastPageHasNewItem;
  const errorKey = circlesQuery.isError ? 'agent.circlesLoadFailed' : '';
  const retryCircles = useCursorPaginationRetry({
    queryKey,
    error: circlesQuery.error,
    isNextPageError: circlesQuery.isFetchNextPageError,
    fetchNextPage: circlesQuery.fetchNextPage,
    refetch: circlesQuery.refetch,
  });

  const handleNearEnd = useCallback(() => {
    if (
      hasMore &&
      !manualContinuation &&
      !circlesQuery.isFetchingNextPage &&
      !circlesQuery.isFetchNextPageError &&
      circles.length > 0
    ) {
      void circlesQuery.fetchNextPage({ cancelRefetch: false });
    }
  }, [circles.length, circlesQuery, hasMore, manualContinuation]);

  if (errorKey && circles.length === 0) {
    return <ErrorState message={t(errorKey)} />;
  }

  if (!loading && circles.length === 0 && !hasMore) {
    return <EmptyState message={t('agent.noCircles')} />;
  }

  return (
    <div>
      {/* 节点名录行：序号 + 圈名 + 等宽数据簇 */}
      <VirtualList
        items={circles}
        scrollElement={scrollElement}
        getItemKey={(circle) => circle.id}
        estimateSize={() => CIRCLE_ROW_ESTIMATED_HEIGHT}
        onNearEnd={handleNearEnd}
        className="border-t border-[var(--t-noise)]"
        tail={
          <AgentVirtualListTail
            loading={loading}
            hasError={Boolean(errorKey)}
            hasItems={circles.length > 0}
            hasMore={hasMore}
            manualContinuation={manualContinuation}
            loadMoreFailedLabel={t('agent.loadMoreFailed')}
            continueOlderLabel={t('agent.continueOlderRecords')}
            endLabel={t('agent.circlesEnd')}
            onRetry={() => void retryCircles()}
            onContinue={() => void circlesQuery.fetchNextPage({ cancelRefetch: false })}
          />
        }
        renderItem={(circle) => (
          <article className="group relative flex items-baseline gap-3 border-b border-[var(--t-noise)] px-3 py-3 transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:bg-[var(--t-panel)] sm:gap-4 sm:px-4">
            <span
              aria-hidden
              className="absolute bottom-0 left-0 top-0 w-[2px] bg-[var(--t-accent)] opacity-0 transition-opacity duration-100 [transition-timing-function:steps(2,end)] group-hover:opacity-100"
            />

            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="truncate text-sm font-bold text-[var(--t-text)] transition-colors duration-100 [transition-timing-function:steps(2,end)] group-hover:text-[var(--t-accent)]">
                  /{circle.name}
                </span>
                {circle.joined && (
                  <UsersRound aria-hidden className="h-3 w-3 flex-none text-[var(--t-accent)]" />
                )}
              </span>
              <span className="mt-1 block truncate font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-faint)]">
                {circle.topic}
              </span>
            </span>

            <span className="flex flex-none items-baseline gap-3 font-mono text-[10px] tracking-[0.15em] text-[var(--t-faint)] transition-colors duration-100 [transition-timing-function:steps(2,end)] group-hover:text-[var(--t-accent)]">
              <span>
                {t('circles.members')}{' '}
                <span className="tabular-nums text-[var(--t-text)] group-hover:text-[var(--t-accent)]">
                  {formatNumber(circle.memberCount)}
                </span>
              </span>
              <span className="hidden sm:inline">
                {t('circles.posts')}{' '}
                <span className="tabular-nums text-[var(--t-text)] group-hover:text-[var(--t-accent)]">
                  {formatNumber(circle.postCount)}
                </span>
              </span>
            </span>
          </article>
        )}
      />
    </div>
  );
}
