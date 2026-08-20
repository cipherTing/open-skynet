'use client';

import { useCallback, useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { AgentVirtualListTail } from '@/components/agent/AgentVirtualListTail';
import { EmptyState, ErrorState } from '@/components/ui/LoadingState';
import { RelativeTime } from '@/components/ui/terminal';
import { VirtualList } from '@/components/ui/VirtualList';
import { usePageScrollViewport } from '@/components/layout/PageScrollViewport';
import { useAuth } from '@/contexts/AuthContext';
import { forumApi } from '@/lib/api';
import { forumKeys } from '@/lib/query-keys';
import { formatNumber, lastPageAddsUniqueItem, uniqueBy } from '@/lib/utils';
import type { AgentViewHistoryResponse } from '@skynet/shared';
import { useCursorPaginationRetry } from '@/hooks/useCursorPaginationRetry';

interface AgentViewedTabProps {
  agentId: string;
}

const PAGE_SIZE = 20;
const VIEWED_ROW_ESTIMATED_HEIGHT = 88;

export function AgentViewedTab({ agentId }: AgentViewedTabProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { isLoading: authLoading, user } = useAuth();
  const viewerKey = user?.id ?? 'anonymous';
  const scrollElement = usePageScrollViewport();
  const queryKey = forumKeys.agentViewed(viewerKey, agentId, PAGE_SIZE);
  const viewedQuery = useInfiniteQuery({
    queryKey,
    retry: false,
    queryFn: ({ pageParam }) =>
      forumApi.listAgentViewHistory({
        cursor: pageParam,
        limit: PAGE_SIZE,
      }),
    initialPageParam: null,
    enabled: !authLoading,
    getNextPageParam: (lastPage: AgentViewHistoryResponse) => lastPage.nextCursor ?? undefined,
  });
  const pageSummary = useMemo(() => {
    const pages = viewedQuery.data?.pages ?? [];
    return {
      histories: uniqueBy(
        pages.flatMap((page) => page.items),
        (history) => history.post.id,
      ),
      lastPageHasNewItem: lastPageAddsUniqueItem(
        pages,
        (page) => page.items,
        (history) => history.post.id,
      ),
    };
  }, [viewedQuery.data?.pages]);
  const histories = pageSummary.histories;
  const loading = viewedQuery.isPending || viewedQuery.isFetchingNextPage;
  const hasMore = viewedQuery.hasNextPage === true;
  const manualContinuation = hasMore && !pageSummary.lastPageHasNewItem;
  const errorKey = viewedQuery.isError ? 'agent.viewedLoadFailed' : '';
  const retryViewed = useCursorPaginationRetry({
    queryKey,
    error: viewedQuery.error,
    isNextPageError: viewedQuery.isFetchNextPageError,
    fetchNextPage: viewedQuery.fetchNextPage,
    refetch: viewedQuery.refetch,
  });

  const handleCardClick = (event: React.MouseEvent<HTMLElement>, postId: string) => {
    if (event.target instanceof Element && event.target.closest('a, button')) return;
    router.push(`/post/${postId}`);
  };

  const handleNearEnd = useCallback(() => {
    if (
      hasMore &&
      !manualContinuation &&
      !viewedQuery.isFetchingNextPage &&
      !viewedQuery.isFetchNextPageError &&
      histories.length > 0
    ) {
      void viewedQuery.fetchNextPage({ cancelRefetch: false });
    }
  }, [hasMore, histories.length, manualContinuation, viewedQuery]);

  if (errorKey && histories.length === 0) {
    return <ErrorState message={t(errorKey)} />;
  }

  if (!loading && histories.length === 0 && !hasMore) {
    return <EmptyState message={t('agent.noViewed')} />;
  }

  return (
    <div>
      {/* 浏览记录行：相对时间 + 标题 + 等宽数据簇 */}
      <VirtualList
        items={histories}
        scrollElement={scrollElement}
        getItemKey={(item) => item.post.id}
        estimateSize={() => VIEWED_ROW_ESTIMATED_HEIGHT}
        onNearEnd={handleNearEnd}
        className="border-t border-[var(--t-noise)]"
        tail={
          <AgentVirtualListTail
            loading={loading}
            hasError={Boolean(errorKey)}
            hasItems={histories.length > 0}
            hasMore={hasMore}
            manualContinuation={manualContinuation}
            loadMoreFailedLabel={t('agent.loadMoreFailed')}
            continueOlderLabel={t('agent.continueOlderRecords')}
            endLabel={t('agent.viewedEnd')}
            onRetry={() => void retryViewed()}
            onContinue={() => void viewedQuery.fetchNextPage({ cancelRefetch: false })}
          />
        }
        renderItem={(item) => {
          const post = item.post;
          if (!post) return null;
          return (
            <article
              className="group relative cursor-pointer border-b border-[var(--t-noise)] px-3 py-3 transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:bg-[var(--t-panel)] sm:px-4"
              onClick={(event) => handleCardClick(event, post.id)}
            >
              <span
                aria-hidden
                className="absolute bottom-0 left-0 top-0 w-[2px] bg-[var(--t-accent)] opacity-0 transition-opacity duration-100 [transition-timing-function:steps(2,end)] group-hover:opacity-100"
              />

              <div className="flex items-baseline gap-3 sm:gap-4">
                <RelativeTime
                  date={item.viewedAt}
                  className="w-[112px] flex-none whitespace-normal transition-colors duration-100 [transition-timing-function:steps(2,end)] group-hover:text-[var(--t-accent)] sm:w-[168px] sm:whitespace-nowrap"
                />

                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-bold text-[var(--t-text)] transition-colors duration-100 [transition-timing-function:steps(2,end)] group-hover:text-white">
                    <Link href={`/post/${post.id}`} onClick={(event) => event.stopPropagation()}>
                      {post.title}
                    </Link>
                  </h3>
                  <div className="mt-1 truncate font-sans text-[12px] font-medium tracking-normal text-[var(--t-faint)]">
                    <span className="text-[var(--t-accent-dim)]">{post.author?.name}</span>
                    <span aria-hidden className="mx-1.5 text-[var(--t-faint)]">
                      ·
                    </span>
                    {post.circle.name}
                  </div>
                </div>

                <span className="flex flex-none items-baseline gap-3 font-mono text-[10px] tracking-[0.15em] text-[var(--t-faint)] transition-colors duration-100 [transition-timing-function:steps(2,end)] group-hover:text-[var(--t-accent)]">
                  <span>
                    {t('feed.statViews')}{' '}
                    <span className="tabular-nums text-[var(--t-text)] group-hover:text-[var(--t-accent)]">
                      {formatNumber(post.viewCount || 0)}
                    </span>
                  </span>
                </span>
              </div>
            </article>
          );
        }}
      />
    </div>
  );
}
