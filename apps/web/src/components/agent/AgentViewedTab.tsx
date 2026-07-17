'use client';

import { useEffect } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useInView } from 'react-intersection-observer';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { EmptyState, ErrorState, InlineLoading } from '@/components/ui/LoadingState';
import { Timecode } from '@/components/ui/terminal';
import { useAuth } from '@/contexts/AuthContext';
import { forumApi } from '@/lib/api';
import { forumKeys } from '@/lib/query-keys';
import { formatNumber } from '@/lib/utils';
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
    <div>
      {/* 足迹档案行：浏览时间码 + 标题 + 等宽数据簇 */}
      <div className="border-t border-[#1A2E1A]">
        {histories.map((item) => {
          const post = item.post;
          if (!post) return null;
          return (
            <article
              key={post.id + item.viewedAt}
              className="group relative cursor-pointer border-b border-[#1A2E1A] px-3 py-3 transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:bg-[#040704] sm:px-4"
              onClick={(event) => handleCardClick(event, post.id)}
            >
              <span
                aria-hidden
                className="absolute bottom-0 left-0 top-0 w-[2px] bg-[#ADFF2F] opacity-0 transition-opacity duration-100 [transition-timing-function:steps(2,end)] group-hover:opacity-100"
              />

              <div className="flex items-baseline gap-3 sm:gap-4">
                <Timecode
                  date={item.viewedAt}
                  withDate
                  className="w-[92px] flex-none transition-colors duration-100 [transition-timing-function:steps(2,end)] group-hover:text-[#ADFF2F]"
                />

                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-bold text-[#EDF3ED] transition-colors duration-100 [transition-timing-function:steps(2,end)] group-hover:text-white">
                    <Link href={`/post/${post.id}`} onClick={(event) => event.stopPropagation()}>
                      {post.title}
                    </Link>
                  </h3>
                  <div className="mt-1 truncate font-mono text-[10px] uppercase tracking-[0.15em] text-[#3A5A3A]">
                    <span className="text-[#ADFF2F]/80">{post.author?.name}</span>
                    <span aria-hidden className="mx-1.5 text-[#1A2E1A]">{'//'}</span>/
                    {post.circle.name}
                  </div>
                </div>

                <span className="flex flex-none items-baseline gap-3 font-mono text-[10px] tracking-[0.15em] text-[#3A5A3A] transition-colors duration-100 [transition-timing-function:steps(2,end)] group-hover:text-[#ADFF2F]">
                  <span>
                    VWS <span className="tabular-nums text-[#EDF3ED] group-hover:text-[#ADFF2F]">{formatNumber(post.viewCount || 0)}</span>
                  </span>
                </span>
              </div>
            </article>
          );
        })}
      </div>

      {loading && <InlineLoading />}

      {errorKey && histories.length > 0 && (
        <div className="py-4 text-center">
          <button
            onClick={() => void (hasMore ? viewedQuery.fetchNextPage() : viewedQuery.refetch())}
            className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#ADFF2F] transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:text-white"
          >
            {t('agent.loadMoreFailed')}
          </button>
        </div>
      )}

      {hasMore && !loading && !errorKey && <div ref={loaderRef} className="h-8" />}

      {!hasMore && histories.length > 0 && (
        <div className="py-6 text-center">
          <div className="flex items-center justify-center gap-3">
            <div className="h-px w-8 bg-[#1A2E1A]" />
            <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#3A5A3A]">
              {t('agent.viewedEnd')}
            </span>
            <div className="h-px w-8 bg-[#1A2E1A]" />
          </div>
        </div>
      )}
    </div>
  );
}
