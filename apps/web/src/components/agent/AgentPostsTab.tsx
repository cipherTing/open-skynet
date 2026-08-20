'use client';

import { useCallback, useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { EmptyState, ErrorState } from '@/components/ui/LoadingState';
import { RelativeTime } from '@/components/ui/terminal';
import { VirtualList } from '@/components/ui/VirtualList';
import { usePageScrollViewport } from '@/components/layout/PageScrollViewport';
import { useAuth } from '@/contexts/AuthContext';
import { forumApi } from '@/lib/api';
import { forumKeys } from '@/lib/query-keys';
import { formatNumber, lastPageAddsUniqueItem, uniqueBy } from '@/lib/utils';
import type { AgentPostsResponse } from '@skynet/shared';
import { AgentVirtualListTail } from '@/components/agent/AgentVirtualListTail';
import { useCursorPaginationRetry } from '@/hooks/useCursorPaginationRetry';

interface AgentPostsTabProps {
  agentId: string;
}

const PAGE_SIZE = 20;
const POST_ROW_ESTIMATED_HEIGHT = 76;

export function AgentPostsTab({ agentId }: AgentPostsTabProps) {
  const { t } = useTranslation();
  const { isLoading: authLoading, user } = useAuth();
  const viewerKey = user?.id ?? 'anonymous';
  const scrollElement = usePageScrollViewport();
  const queryKey = forumKeys.agentPosts(viewerKey, agentId, PAGE_SIZE);
  const postsQuery = useInfiniteQuery({
    queryKey,
    retry: false,
    queryFn: ({ pageParam }) =>
      forumApi.listAgentPosts(agentId, {
        cursor: pageParam,
        limit: PAGE_SIZE,
      }),
    initialPageParam: null,
    enabled: !authLoading,
    getNextPageParam: (lastPage: AgentPostsResponse) => lastPage.nextCursor ?? undefined,
  });
  const pageSummary = useMemo(() => {
    const pages = postsQuery.data?.pages ?? [];
    return {
      posts: uniqueBy(
        pages.flatMap((page) => page.items),
        (post) => post.id,
      ),
      lastPageHasNewItem: lastPageAddsUniqueItem(
        pages,
        (page) => page.items,
        (post) => post.id,
      ),
    };
  }, [postsQuery.data?.pages]);
  const posts = pageSummary.posts;
  const loading = postsQuery.isPending || postsQuery.isFetchingNextPage;
  const hasMore = postsQuery.hasNextPage === true;
  const manualContinuation = hasMore && !pageSummary.lastPageHasNewItem;
  const errorKey = postsQuery.isError ? 'agent.postsLoadFailed' : '';
  const retryPosts = useCursorPaginationRetry({
    queryKey,
    error: postsQuery.error,
    isNextPageError: postsQuery.isFetchNextPageError,
    fetchNextPage: postsQuery.fetchNextPage,
    refetch: postsQuery.refetch,
  });

  const handleNearEnd = useCallback(() => {
    if (
      hasMore &&
      !manualContinuation &&
      !postsQuery.isFetchingNextPage &&
      !postsQuery.isFetchNextPageError &&
      posts.length > 0
    ) {
      void postsQuery.fetchNextPage({ cancelRefetch: false });
    }
  }, [hasMore, manualContinuation, posts.length, postsQuery]);

  if (errorKey && posts.length === 0) {
    return <ErrorState message={t(errorKey)} />;
  }

  if (!loading && posts.length === 0 && !hasMore) {
    return <EmptyState message={t('agent.noPosts')} />;
  }

  return (
    <div>
      {/* 帖子记录列表：1px 分隔 + 行首相对时间 + 行尾等宽数据簇 */}
      <VirtualList
        items={posts}
        scrollElement={scrollElement}
        getItemKey={(post) => post.id}
        estimateSize={() => POST_ROW_ESTIMATED_HEIGHT}
        onNearEnd={handleNearEnd}
        className="border-t border-[var(--t-noise)]"
        tail={
          <AgentVirtualListTail
            loading={loading}
            hasError={Boolean(errorKey)}
            hasItems={posts.length > 0}
            hasMore={hasMore}
            manualContinuation={manualContinuation}
            loadMoreFailedLabel={t('agent.loadMoreFailed')}
            continueOlderLabel={t('agent.continueOlderRecords')}
            endLabel={t('agent.postsEnd')}
            onRetry={() => void retryPosts()}
            onContinue={() => void postsQuery.fetchNextPage({ cancelRefetch: false })}
          />
        }
        renderItem={(post) => (
          <Link
            key={post.id}
            href={`/post/${post.id}`}
            className="group relative flex items-baseline gap-3 border-b border-[var(--t-noise)] px-3 py-3 transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:bg-[var(--t-panel)] sm:gap-4 sm:px-4"
          >
            <span
              aria-hidden
              className="absolute bottom-0 left-0 top-0 w-[2px] bg-[var(--t-accent)] opacity-0 transition-opacity duration-100 [transition-timing-function:steps(2,end)] group-hover:opacity-100"
            />

            <RelativeTime
              date={post.createdAt}
              className="w-[112px] flex-none whitespace-normal transition-colors duration-100 [transition-timing-function:steps(2,end)] group-hover:text-[var(--t-accent)] sm:w-[168px] sm:whitespace-nowrap"
            />

            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold text-[var(--t-text)] transition-colors duration-100 [transition-timing-function:steps(2,end)] group-hover:text-white">
                {post.title}
              </span>
              <span className="mt-1 block truncate font-sans text-[12px] font-medium tracking-normal text-[var(--t-faint)]">
                /{post.circle.name}
                {post.tags.length > 0 && (
                  <span className="text-[var(--t-faint)]">
                    {' · '}
                    {post.tags.map((tag) => `#${t(`postTags.${tag}.label`)}`).join(' ')}
                  </span>
                )}
              </span>
            </span>

            <span className="flex flex-none items-baseline gap-3 font-mono text-[10px] tracking-[0.15em] text-[var(--t-faint)] transition-colors duration-100 [transition-timing-function:steps(2,end)] group-hover:text-[var(--t-accent)]">
              <span>
                {t('feed.statReplies')}{' '}
                <span className="tabular-nums text-[var(--t-text)] group-hover:text-[var(--t-accent)]">
                  {formatNumber(post.replyCount)}
                </span>
              </span>
              <span className="hidden sm:inline">
                {t('feed.statViews')}{' '}
                <span className="tabular-nums text-[var(--t-text)] group-hover:text-[var(--t-accent)]">
                  {formatNumber(post.viewCount)}
                </span>
              </span>
            </span>
          </Link>
        )}
      />
    </div>
  );
}
