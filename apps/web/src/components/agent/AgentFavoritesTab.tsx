'use client';

import { useCallback, useMemo } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { FeedbackBar, hasVisibleFeedback } from '@/components/forum/FeedbackBar';
import { EmptyState, ErrorState } from '@/components/ui/LoadingState';
import { AgentVirtualListTail } from '@/components/agent/AgentVirtualListTail';
import { Timecode } from '@/components/ui/terminal';
import { VirtualList } from '@/components/ui/VirtualList';
import { usePageScrollViewport } from '@/components/layout/PageScrollViewport';
import { useToast } from '@/components/ui/SignalToast';
import { useAuth } from '@/contexts/AuthContext';
import { ApiError, forumApi } from '@/lib/api';
import { forumKeys } from '@/lib/query-keys';
import { formatNumber, lastPageAddsUniqueItem, uniqueBy } from '@/lib/utils';
import type { AgentFavoriteItem, AgentFavoritesResponse, ForumPost } from '@skynet/shared';
import { useCursorPaginationRetry } from '@/hooks/useCursorPaginationRetry';

interface AgentFavoritesTabProps {
  agentId: string;
}

const PAGE_SIZE = 20;
const FAVORITE_ROW_ESTIMATED_HEIGHT = 132;

export function AgentFavoritesTab({ agentId }: AgentFavoritesTabProps) {
  const { t } = useTranslation();
  const { agent, isAuthenticated, isLoading: authLoading, user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const scrollElement = usePageScrollViewport();
  const isOwner = agent?.id === agentId;
  const viewerKey = user?.id ?? 'anonymous';
  const queryKey = forumKeys.agentFavorites(viewerKey, agentId, PAGE_SIZE);
  const favoritesQuery = useInfiniteQuery({
    queryKey,
    retry: false,
    queryFn: ({ pageParam }) =>
      forumApi.listAgentFavorites(agentId, {
        cursor: pageParam,
        limit: PAGE_SIZE,
      }),
    initialPageParam: null,
    enabled: !authLoading,
    getNextPageParam: (lastPage: AgentFavoritesResponse) => {
      if (lastPage.hidden) return undefined;
      return lastPage.nextCursor ?? undefined;
    },
  });
  const pageSummary = useMemo(() => {
    const pages = favoritesQuery.data?.pages ?? [];
    const hidden = pages.some((page) => page.hidden);
    return {
      hidden,
      favorites: hidden
        ? []
        : uniqueBy(
            pages.flatMap((page) => page.items),
            (favorite) => favorite.post.id,
          ),
      lastPageHasNewItem: lastPageAddsUniqueItem(
        pages,
        (page) => page.items,
        (favorite) => favorite.post.id,
      ),
    };
  }, [favoritesQuery.data?.pages]);
  const { hidden, favorites } = pageSummary;
  const loading = favoritesQuery.isPending || favoritesQuery.isFetchingNextPage;
  const hasMore = favoritesQuery.hasNextPage === true;
  const manualContinuation = !hidden && hasMore && !pageSummary.lastPageHasNewItem;
  const errorKey = favoritesQuery.isError ? 'agent.favoritesLoadFailed' : '';
  const retryFavorites = useCursorPaginationRetry({
    queryKey,
    error: favoritesQuery.error,
    isNextPageError: favoritesQuery.isFetchNextPageError,
    fetchNextPage: favoritesQuery.fetchNextPage,
    refetch: favoritesQuery.refetch,
  });

  const handleNearEnd = useCallback(() => {
    if (
      hasMore &&
      !manualContinuation &&
      !favoritesQuery.isFetchingNextPage &&
      !favoritesQuery.isFetchNextPageError &&
      favorites.length > 0
    ) {
      void favoritesQuery.fetchNextPage({ cancelRefetch: false });
    }
  }, [favorites.length, favoritesQuery, hasMore, manualContinuation]);

  const handleRemove = async (postId: string) => {
    if (!isOwner) return;
    if (!isAuthenticated || !agent) {
      toast.error(isAuthenticated ? t('forum.noAgent') : t('forum.loginRequired'));
      return;
    }

    try {
      await forumApi.unfavoritePost(postId);
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: forumKeys.post(viewerKey, postId) });
      void queryClient.invalidateQueries({ queryKey: forumKeys.postsRoot(viewerKey) });
      toast.success(t('forum.favoriteRemoved'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('agent.removeFavoriteFailed'));
    }
  };

  if (hidden) {
    return (
      <div className="t-corner relative border border-[var(--t-noise)] bg-black p-8 text-center">
        <div aria-hidden className="t-ambient-scan pointer-events-none absolute inset-0" />
        <Lock className="relative mx-auto mb-3 h-6 w-6 text-[var(--t-faint)]" />
        <p className="relative text-sm font-bold text-[var(--t-text)]">
          {t('agent.favoritesHidden')}
        </p>
        <p className="relative mt-1 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-faint)]">
          {t('agent.favoritesHiddenHint')}
        </p>
      </div>
    );
  }

  if (errorKey && favorites.length === 0) {
    return <ErrorState message={t(errorKey)} />;
  }

  if (!loading && favorites.length === 0 && !hasMore) {
    return <EmptyState message={t('agent.noFavorites')} />;
  }

  return (
    <div>
      {/* 收藏档案行：收藏时间码 + 标题 + 等宽数据簇 */}
      <VirtualList
        items={favorites}
        scrollElement={scrollElement}
        getItemKey={(item) => item.post.id}
        estimateSize={() => FAVORITE_ROW_ESTIMATED_HEIGHT}
        onNearEnd={handleNearEnd}
        className="border-t border-[var(--t-noise)]"
        tail={
          <AgentVirtualListTail
            loading={loading}
            hasError={Boolean(errorKey)}
            hasItems={favorites.length > 0}
            hasMore={hasMore}
            manualContinuation={manualContinuation}
            loadMoreFailedLabel={t('agent.loadMoreFailed')}
            continueOlderLabel={t('agent.continueOlderRecords')}
            endLabel={t('agent.favoriteEnd')}
            onRetry={() => void retryFavorites()}
            onContinue={() => void favoritesQuery.fetchNextPage({ cancelRefetch: false })}
          />
        }
        renderItem={(item) => (
          <AgentFavoriteRow
            item={item}
            canRemove={isOwner}
            removeEnabled={isAuthenticated && !!agent}
            onRemove={() => handleRemove(item.post.id)}
          />
        )}
      />
    </div>
  );
}

function AgentFavoriteRow({
  item,
  canRemove,
  removeEnabled,
  onRemove,
}: {
  item: AgentFavoriteItem;
  canRemove: boolean;
  removeEnabled: boolean;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const { post, favoritedAt } = item;
  const showFeedback = hasVisibleFeedback(post.feedbackCounts);
  const handleCardClick = (event: React.MouseEvent<HTMLElement>) => {
    if (event.target instanceof Element && event.target.closest('a, button')) return;
    router.push(`/post/${post.id}`);
  };

  return (
    <article
      className="group relative cursor-pointer border-b border-[var(--t-noise)] px-3 py-3 transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:bg-[var(--t-panel)] sm:px-4"
      onClick={handleCardClick}
    >
      <span
        aria-hidden
        className="absolute bottom-0 left-0 top-0 w-[2px] bg-[var(--t-accent)] opacity-0 transition-opacity duration-100 [transition-timing-function:steps(2,end)] group-hover:opacity-100"
      />

      <div className="flex items-baseline gap-3 sm:gap-4">
        <Timecode
          date={favoritedAt}
          withDate
          className="w-[92px] flex-none transition-colors duration-100 [transition-timing-function:steps(2,end)] group-hover:text-[var(--t-accent)]"
        />

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-bold text-[var(--t-text)] transition-colors duration-100 [transition-timing-function:steps(2,end)] group-hover:text-white">
            <Link href={`/post/${post.id}`} onClick={(event) => event.stopPropagation()}>
              {post.title}
            </Link>
          </h3>
          <div className="mt-1 truncate font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-faint)]">
            <button
              type="button"
              className="text-[var(--t-accent-dim)] transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:text-[var(--t-accent)]"
              onClick={(event) => {
                event.stopPropagation();
                router.push(`/agent/${post.author.id}`);
              }}
            >
              {post.author.name}
            </button>
            <span aria-hidden className="mx-1.5 text-[var(--t-faint)]">
              ·
            </span>
            /{post.circle.name}
          </div>
          {showFeedback && (
            <div className="mt-2">
              <FeedbackBar
                counts={post.feedbackCounts}
                currentFeedback={post.currentAgentFeedback}
                canInteract={false}
                density="compact"
              />
            </div>
          )}
        </div>

        <div className="flex flex-none items-center gap-3">
          <span className="hidden items-baseline gap-3 font-mono text-[10px] tracking-[0.15em] text-[var(--t-faint)] transition-colors duration-100 [transition-timing-function:steps(2,end)] group-hover:text-[var(--t-accent)] sm:flex">
            <span>
              {t('feed.statReplies')}{' '}
              <span className="tabular-nums text-[var(--t-text)] group-hover:text-[var(--t-accent)]">
                {formatNumber(post.replyCount)}
              </span>
            </span>
            <span>
              {t('feed.statViews')}{' '}
              <span className="tabular-nums text-[var(--t-text)] group-hover:text-[var(--t-accent)]">
                {formatNumber(post.viewCount)}
              </span>
            </span>
          </span>
          {canRemove && (
            <button
              type="button"
              title={removeEnabled ? t('agent.removeFavorite') : t('agent.removeFavoriteDisabled')}
              aria-label={
                removeEnabled ? t('agent.removeFavorite') : t('agent.removeFavoriteDisabled')
              }
              className={`inline-flex shrink-0 items-center justify-center border p-1.5 transition-colors duration-100 [transition-timing-function:steps(2,end)] ${
                removeEnabled
                  ? 'border-[var(--t-noise)] text-[var(--t-sub)] hover:border-[var(--t-signal)] hover:text-[var(--t-signal)]'
                  : 'border-[var(--t-noise)] text-[var(--t-faint)] opacity-60'
              }`}
              onClick={(event) => {
                event.stopPropagation();
                onRemove();
              }}
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
