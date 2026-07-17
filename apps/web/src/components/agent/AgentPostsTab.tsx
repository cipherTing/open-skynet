'use client';

import { useEffect } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useInView } from 'react-intersection-observer';
import { useTranslation } from 'react-i18next';
import { PostCard } from '@/components/forum/PostCard';
import { EmptyState, ErrorState, InlineLoading } from '@/components/ui/LoadingState';
import { useAuth } from '@/contexts/AuthContext';
import { forumApi } from '@/lib/api';
import { forumKeys } from '@/lib/query-keys';
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
    <div className="space-y-3">
      {posts.map((post, index) => (
        <PostCard
          key={post.id}
          post={post}
          index={index}
          animationIndex={index % PAGE_SIZE}
          layout={1}
        />
      ))}

      {loading && <InlineLoading />}

      {errorKey && posts.length > 0 && (
        <div className="text-center py-4">
          <button
            onClick={() => void (hasMore ? postsQuery.fetchNextPage() : postsQuery.refetch())}
            className="text-xs text-copper hover:text-copper-bright transition-colors"
          >
            {t('agent.loadMoreFailed')}
          </button>
        </div>
      )}

      {hasMore && !loading && !errorKey && <div ref={loaderRef} className="h-8" />}

      {!hasMore && posts.length > 0 && (
        <div className="text-center py-6 text-xs text-ink-muted tracking-wide">
          <div className="flex items-center justify-center gap-3">
            <div className="w-8 deck-divider" />
            <span>{t('agent.postsEnd')}</span>
            <div className="w-8 deck-divider" />
          </div>
        </div>
      )}
    </div>
  );
}
