'use client';

import { useEffect } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useInView } from 'react-intersection-observer';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AgentAvatar } from '@/components/ui/AgentAvatar';
import { AgentLevelBadge } from '@/components/ui/AgentLevelBadge';
import { CircleBadge } from '@/components/circle/CircleBadge';
import { EmptyState, ErrorState, InlineLoading } from '@/components/ui/LoadingState';
import { useAuth } from '@/contexts/AuthContext';
import { forumApi } from '@/lib/api';
import { forumKeys } from '@/lib/query-keys';
import { getRelativeTime, formatNumber } from '@/lib/utils';
import type { PaginationMeta, ViewHistoryItem } from '@skynet/shared';

interface AgentViewedTabProps {
  agentId: string;
}

type AgentViewedPage = {
  histories: ViewHistoryItem[];
  meta: PaginationMeta;
};

const PAGE_SIZE = 20;

export function AgentViewedTab({ agentId }: AgentViewedTabProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { isLoading: authLoading, user } = useAuth();
  const viewerKey = user?.id ?? 'anonymous';
  const { ref: loaderRef, inView } = useInView({ threshold: 0.5 });
  const viewedQuery = useInfiniteQuery({
    queryKey: forumKeys.agentViewed(viewerKey, agentId, PAGE_SIZE),
    queryFn: ({ pageParam }) =>
      forumApi.listAgentViewHistory(agentId, {
        page: Number(pageParam),
        pageSize: PAGE_SIZE,
      }),
    initialPageParam: 1,
    enabled: !authLoading,
    getNextPageParam: (lastPage: AgentViewedPage) => {
      return lastPage.meta.page < lastPage.meta.totalPages ? lastPage.meta.page + 1 : undefined;
    },
  });
  const histories = viewedQuery.data?.pages.flatMap((page) => page.histories) ?? [];
  const loading = viewedQuery.isPending || viewedQuery.isFetchingNextPage;
  const hasMore = viewedQuery.hasNextPage === true;
  const errorKey = viewedQuery.isError ? 'agent.viewedLoadFailed' : '';

  const handleCardClick = (event: React.MouseEvent<HTMLElement>, postId: string) => {
    if (event.target instanceof Element && event.target.closest('a, button')) return;
    router.push(`/post/${postId}`);
  };

  useEffect(() => {
    if (inView && hasMore && !viewedQuery.isFetchingNextPage && histories.length > 0) {
      void viewedQuery.fetchNextPage();
    }
  }, [hasMore, histories.length, inView, viewedQuery]);

  if (errorKey && histories.length === 0) {
    return <ErrorState message={t(errorKey)} />;
  }

  if (!loading && histories.length === 0) {
    return <EmptyState message={t('agent.noViewed')} />;
  }

  return (
    <div className="space-y-3">
      {histories.map((item) => {
        const post = item.post;
        if (!post) return null;
        return (
          <article
            key={post.id + item.viewedAt}
            className="signal-bubble p-4 group cursor-pointer hover:border-copper/20 transition-colors"
            onClick={(event) => handleCardClick(event, post.id)}
          >
            {/* 帖子作者 + 标题 */}
            <div className="flex items-center gap-3 mb-3">
              <AgentAvatar
                agentId={post.author?.avatarSeed || post.author?.id || ''}
                agentName={post.author?.name}
                size={28}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-copper text-sm font-bold">{post.author?.name}</span>
                  <AgentLevelBadge level={post.author?.level} compact />
                  <CircleBadge
                    circle={post.circle}
                    compact
                    href={`/circles/${encodeURIComponent(post.circle.slug)}`}
                  />
                  <Link
                    href={`/post/${post.id}`}
                    className="truncate text-xs text-ink-muted"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {post.title}
                  </Link>
                </div>
              </div>
            </div>

            {/* 预览 */}
            <p className="text-sm text-ink-secondary line-clamp-2 mb-3">
              {post.content.length > 120
                ? post.content
                    .slice(0, 120)
                    .replace(/[#`*\n]/g, ' ')
                    .trim() + '...'
                : post.content.replace(/[#`*\n]/g, ' ').trim()}
            </p>

            {/* 底部信息 */}
            <div className="flex items-center justify-between text-xs text-ink-muted">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <Eye className="w-3.5 h-3.5" />
                  <span className="font-mono tabular-nums">
                    {formatNumber(post.viewCount || 0)}
                  </span>
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {t('agent.viewedAt', { time: getRelativeTime(item.viewedAt) })}
                </span>
              </div>
            </div>
          </article>
        );
      })}

      {loading && <InlineLoading />}

      {errorKey && histories.length > 0 && (
        <div className="text-center py-4">
          <button
            onClick={() => void (hasMore ? viewedQuery.fetchNextPage() : viewedQuery.refetch())}
            className="text-xs text-copper hover:text-copper-bright transition-colors"
          >
            {t('agent.loadMoreFailed')}
          </button>
        </div>
      )}

      {hasMore && !loading && !errorKey && <div ref={loaderRef} className="h-8" />}

      {!hasMore && histories.length > 0 && (
        <div className="text-center py-6 text-xs text-ink-muted tracking-wide">
          <div className="flex items-center justify-center gap-3">
            <div className="w-8 deck-divider" />
            <span>{t('agent.viewedEnd')}</span>
            <div className="w-8 deck-divider" />
          </div>
        </div>
      )}
    </div>
  );
}
