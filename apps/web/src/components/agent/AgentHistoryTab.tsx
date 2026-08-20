'use client';

import { useCallback, useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AgentInteractionCard } from '@/components/agent/AgentInteractionCard';
import { AgentVirtualListTail } from '@/components/agent/AgentVirtualListTail';
import { EmptyState, ErrorState } from '@/components/ui/LoadingState';
import { VirtualList } from '@/components/ui/VirtualList';
import { usePageScrollViewport } from '@/components/layout/PageScrollViewport';
import { useAuth } from '@/contexts/AuthContext';
import { forumApi } from '@/lib/api';
import { forumKeys } from '@/lib/query-keys';
import { lastPageAddsUniqueItem, uniqueBy } from '@/lib/utils';
import type { AgentInteractionsResponse } from '@skynet/shared';
import { useCursorPaginationRetry } from '@/hooks/useCursorPaginationRetry';

interface AgentHistoryTabProps {
  agentId: string;
}

const PAGE_SIZE = 20;
const INTERACTION_ROW_ESTIMATED_HEIGHT = 112;

export function AgentHistoryTab({ agentId }: AgentHistoryTabProps) {
  const { t } = useTranslation();
  const { isLoading: authLoading, user } = useAuth();
  const viewerKey = user?.id ?? 'anonymous';
  const scrollElement = usePageScrollViewport();
  const queryKey = forumKeys.agentHistory(viewerKey, agentId, PAGE_SIZE);
  const historyQuery = useInfiniteQuery({
    queryKey,
    retry: false,
    queryFn: ({ pageParam }) =>
      forumApi.listAgentInteractions({
        cursor: pageParam,
        limit: PAGE_SIZE,
      }),
    initialPageParam: null,
    enabled: !authLoading,
    getNextPageParam: (lastPage: AgentInteractionsResponse) => lastPage.nextCursor ?? undefined,
  });
  const pageSummary = useMemo(() => {
    const pages = historyQuery.data?.pages ?? [];
    return {
      interactions: uniqueBy(
        pages.flatMap((page) => page.items),
        (interaction) => interaction.id,
      ),
      lastPageHasNewItem: lastPageAddsUniqueItem(
        pages,
        (page) => page.items,
        (interaction) => interaction.id,
      ),
    };
  }, [historyQuery.data?.pages]);
  const interactions = pageSummary.interactions;
  const loading = historyQuery.isPending || historyQuery.isFetchingNextPage;
  const hasMore = historyQuery.hasNextPage === true;
  const manualContinuation = hasMore && !pageSummary.lastPageHasNewItem;
  const errorKey = historyQuery.isError ? 'agent.historyLoadFailed' : '';
  const retryHistory = useCursorPaginationRetry({
    queryKey,
    error: historyQuery.error,
    isNextPageError: historyQuery.isFetchNextPageError,
    fetchNextPage: historyQuery.fetchNextPage,
    refetch: historyQuery.refetch,
  });

  const handleNearEnd = useCallback(() => {
    if (
      hasMore &&
      !manualContinuation &&
      !historyQuery.isFetchingNextPage &&
      !historyQuery.isFetchNextPageError &&
      interactions.length > 0
    ) {
      void historyQuery.fetchNextPage({ cancelRefetch: false });
    }
  }, [hasMore, historyQuery, interactions.length, manualContinuation]);

  if (errorKey && interactions.length === 0 && !loading) {
    return (
      <ErrorState
        message={t(errorKey)}
        actionLabel={t('app.reload')}
        onAction={() => void historyQuery.refetch()}
      />
    );
  }

  if (!loading && interactions.length === 0 && !hasMore) {
    return <EmptyState message={t('agent.noInteractions')} />;
  }

  return (
    <div>
      {/* 交互记录行：`>` 前缀 + 相对时间 */}
      <VirtualList
        items={interactions}
        scrollElement={scrollElement}
        getItemKey={(item) => item.id}
        estimateSize={() => INTERACTION_ROW_ESTIMATED_HEIGHT}
        onNearEnd={handleNearEnd}
        className="border-t border-[var(--t-noise)]"
        tail={
          <AgentVirtualListTail
            loading={loading}
            hasError={Boolean(errorKey)}
            hasItems={interactions.length > 0}
            hasMore={hasMore}
            manualContinuation={manualContinuation}
            loadMoreFailedLabel={t('agent.loadMoreFailed')}
            continueOlderLabel={t('agent.continueOlderRecords')}
            endLabel={t('agent.historyEnd')}
            onRetry={() => void retryHistory()}
            onContinue={() => void historyQuery.fetchNextPage({ cancelRefetch: false })}
          />
        }
        renderItem={(item) => <AgentInteractionCard item={item} />}
      />
    </div>
  );
}
