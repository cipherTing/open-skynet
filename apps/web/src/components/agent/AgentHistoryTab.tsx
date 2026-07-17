'use client';

import { useEffect } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useInView } from 'react-intersection-observer';
import { useTranslation } from 'react-i18next';
import { AgentInteractionCard } from '@/components/agent/AgentInteractionCard';
import { EmptyState, ErrorState, InlineLoading } from '@/components/ui/LoadingState';
import { useAuth } from '@/contexts/AuthContext';
import { forumApi } from '@/lib/api';
import { forumKeys } from '@/lib/query-keys';
import type { AgentInteractionHistoryItem, PaginationMeta } from '@skynet/shared';

interface AgentHistoryTabProps {
  agentId: string;
}

type AgentHistoryPage = {
  interactions: AgentInteractionHistoryItem[];
  meta: PaginationMeta;
};

const PAGE_SIZE = 20;

export function AgentHistoryTab({ agentId }: AgentHistoryTabProps) {
  const { t } = useTranslation();
  const { isLoading: authLoading, user } = useAuth();
  const viewerKey = user?.id ?? 'anonymous';
  const { ref: loaderRef, inView } = useInView({ threshold: 0.5 });
  const historyQuery = useInfiniteQuery({
    queryKey: forumKeys.agentHistory(viewerKey, agentId, PAGE_SIZE),
    queryFn: ({ pageParam }) =>
      forumApi.listAgentInteractions(agentId, {
        page: Number(pageParam),
        pageSize: PAGE_SIZE,
      }),
    initialPageParam: 1,
    enabled: !authLoading,
    getNextPageParam: (lastPage: AgentHistoryPage) => {
      return lastPage.meta.page < lastPage.meta.totalPages ? lastPage.meta.page + 1 : undefined;
    },
  });
  const interactions = historyQuery.data?.pages.flatMap((page) => page.interactions) ?? [];
  const loading = historyQuery.isPending || historyQuery.isFetchingNextPage;
  const hasMore = historyQuery.hasNextPage === true;
  const errorKey = historyQuery.isError ? 'agent.historyLoadFailed' : '';

  useEffect(() => {
    if (inView && hasMore && !historyQuery.isFetchingNextPage && interactions.length > 0) {
      void historyQuery.fetchNextPage();
    }
  }, [hasMore, inView, interactions.length, historyQuery]);

  if (errorKey && interactions.length === 0 && !loading) {
    return <ErrorState message={t(errorKey)} actionLabel={t('app.reload')} onAction={() => void historyQuery.refetch()} />;
  }

  if (!loading && interactions.length === 0) {
    return <EmptyState message={t('agent.noInteractions')} />;
  }

  return (
    <div>
      {/* 交互日志行：`>` 前缀 + 时间码 */}
      <div className="border-t border-[#1A2E1A]">
        {interactions.map((item) => (
          <AgentInteractionCard key={item.id} item={item} />
        ))}
      </div>

      {loading && <InlineLoading />}

      {errorKey && interactions.length > 0 && (
        <div className="py-4 text-center">
          <button
            type="button"
            onClick={() => void (hasMore ? historyQuery.fetchNextPage() : historyQuery.refetch())}
            className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#ADFF2F] transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:text-white"
          >
            {t('agent.loadMoreFailed')}
          </button>
        </div>
      )}

      {hasMore && !loading && !errorKey && <div ref={loaderRef} className="h-8" />}

      {!hasMore && interactions.length > 0 && (
        <div className="py-6 text-center">
          <div className="flex items-center justify-center gap-3">
            <div className="h-px w-8 bg-[#1A2E1A]" />
            <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#3A5A3A]">
              {t('agent.historyEnd')}
            </span>
            <div className="h-px w-8 bg-[#1A2E1A]" />
          </div>
        </div>
      )}
    </div>
  );
}
