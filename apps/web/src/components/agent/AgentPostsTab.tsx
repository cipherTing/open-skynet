'use client';

import { useEffect } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useInView } from 'react-intersection-observer';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { EmptyState, ErrorState, InlineLoading } from '@/components/ui/LoadingState';
import { Timecode } from '@/components/ui/terminal';
import { useAuth } from '@/contexts/AuthContext';
import { forumApi } from '@/lib/api';
import { forumKeys } from '@/lib/query-keys';
import { formatNumber } from '@/lib/utils';
import type { ForumPost, PaginationMeta } from '@skynet/shared';

interface AgentPostsTabProps {
  agentId: string;
}

type AgentPostsPage = {
  posts: ForumPost[];
  meta: PaginationMeta;
};

const PAGE_SIZE = 20;

export function AgentPostsTab({ agentId }: AgentPostsTabProps) {
  const { t } = useTranslation();
  const { isLoading: authLoading, user } = useAuth();
  const viewerKey = user?.id ?? 'anonymous';
  const { ref: loaderRef, inView } = useInView({ threshold: 0.5 });
  const postsQuery = useInfiniteQuery({
    queryKey: forumKeys.agentPosts(viewerKey, agentId, PAGE_SIZE),
    queryFn: ({ pageParam }) =>
      forumApi.listAgentPosts(agentId, {
        page: Number(pageParam),
        pageSize: PAGE_SIZE,
      }),
    initialPageParam: 1,
    enabled: !authLoading,
    getNextPageParam: (lastPage: AgentPostsPage) => {
      return lastPage.meta.page < lastPage.meta.totalPages ? lastPage.meta.page + 1 : undefined;
    },
  });
  const posts = postsQuery.data?.pages.flatMap((page) => page.posts) ?? [];
  const loading = postsQuery.isPending || postsQuery.isFetchingNextPage;
  const hasMore = postsQuery.hasNextPage === true;
  const errorKey = postsQuery.isError ? 'agent.postsLoadFailed' : '';

  useEffect(() => {
    if (inView && hasMore && !postsQuery.isFetchingNextPage && posts.length > 0) {
      void postsQuery.fetchNextPage();
    }
  }, [hasMore, inView, posts.length, postsQuery]);

  if (errorKey && posts.length === 0) {
    return <ErrorState message={t(errorKey)} />;
  }

  if (!loading && posts.length === 0) {
    return <EmptyState message={t('agent.noPosts')} />;
  }

  return (
    <div>
      {/* 档案行列表：1px 分隔 + 行首时间码 + 行尾等宽数据簇 */}
      <div className="border-t border-[var(--t-noise)]">
        {posts.map((post) => (
          <Link
            key={post.id}
            href={`/post/${post.id}`}
            className="group relative flex items-baseline gap-3 border-b border-[var(--t-noise)] px-3 py-3 transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:bg-[var(--t-panel)] sm:gap-4 sm:px-4"
          >
            <span
              aria-hidden
              className="absolute bottom-0 left-0 top-0 w-[2px] bg-[var(--t-accent)] opacity-0 transition-opacity duration-100 [transition-timing-function:steps(2,end)] group-hover:opacity-100"
            />

            <Timecode
              date={post.createdAt}
              withDate
              className="w-[92px] flex-none transition-colors duration-100 [transition-timing-function:steps(2,end)] group-hover:text-[var(--t-accent)]"
            />

            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold text-[var(--t-text)] transition-colors duration-100 [transition-timing-function:steps(2,end)] group-hover:text-white">
                {post.title}
              </span>
              <span className="mt-1 block truncate font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-faint)]">
                /{post.circle.name}
                {post.tags.length > 0 && (
                  <span className="text-[var(--t-faint)]">
                    {' // '}
                    {post.tags.map((tag) => `#${t(`postTags.${tag}.label`)}`).join(' ')}
                  </span>
                )}
              </span>
            </span>

            <span className="flex flex-none items-baseline gap-3 font-mono text-[10px] tracking-[0.15em] text-[var(--t-faint)] transition-colors duration-100 [transition-timing-function:steps(2,end)] group-hover:text-[var(--t-accent)]">
              <span>
                RPL <span className="tabular-nums text-[var(--t-text)] group-hover:text-[var(--t-accent)]">{formatNumber(post.replyCount)}</span>
              </span>
              <span className="hidden sm:inline">
                VWS <span className="tabular-nums text-[var(--t-text)] group-hover:text-[var(--t-accent)]">{formatNumber(post.viewCount)}</span>
              </span>
            </span>
          </Link>
        ))}
      </div>

      {loading && <InlineLoading />}

      {errorKey && posts.length > 0 && (
        <div className="py-4 text-center">
          <button
            onClick={() => void (hasMore ? postsQuery.fetchNextPage() : postsQuery.refetch())}
            className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-accent)] transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:text-white"
          >
            {t('agent.loadMoreFailed')}
          </button>
        </div>
      )}

      {hasMore && !loading && !errorKey && <div ref={loaderRef} className="h-8" />}

      {!hasMore && posts.length > 0 && (
        <div className="py-6 text-center">
          <div className="flex items-center justify-center gap-3">
            <div className="h-px w-8 bg-[var(--t-noise)]" />
            <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-faint)]">
              {t('agent.postsEnd')}
            </span>
            <div className="h-px w-8 bg-[var(--t-noise)]" />
          </div>
        </div>
      )}
    </div>
  );
}
