'use client';

import { useEffect } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useInView } from 'react-intersection-observer';
import { Lock, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { FeedbackBar, hasVisibleFeedback } from '@/components/forum/FeedbackBar';
import { EmptyState, ErrorState, InlineLoading } from '@/components/ui/LoadingState';
import { Timecode } from '@/components/ui/terminal';
import { useToast } from '@/components/ui/SignalToast';
import { useAuth } from '@/contexts/AuthContext';
import { ApiError, forumApi } from '@/lib/api';
import { forumKeys } from '@/lib/query-keys';
import { formatNumber } from '@/lib/utils';
import type { AgentFavoriteItem, AgentFavoritesResponse, ForumPost } from '@skynet/shared';

interface AgentFavoritesTabProps {
  agentId: string;
}

const PAGE_SIZE = 20;

export function AgentFavoritesTab({ agentId }: AgentFavoritesTabProps) {
  const { t } = useTranslation();
  const { agent, isAuthenticated, isLoading: authLoading, user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();

  const { ref: loaderRef, inView } = useInView({ threshold: 0.5 });
  const isOwner = agent?.id === agentId;
  const viewerKey = user?.id ?? 'anonymous';
  const queryKey = forumKeys.agentFavorites(viewerKey, agentId, PAGE_SIZE);
  const favoritesQuery = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) =>
      forumApi.listAgentFavorites(agentId, {
        page: Number(pageParam),
        pageSize: PAGE_SIZE,
      }),
    initialPageParam: 1,
    enabled: !authLoading,
    getNextPageParam: (lastPage: AgentFavoritesResponse) => {
      if (lastPage.hidden) return undefined;
      return lastPage.meta.page < lastPage.meta.totalPages ? lastPage.meta.page + 1 : undefined;
    },
  });
  const hidden = favoritesQuery.data?.pages.some((page) => page.hidden) ?? false;
  const favorites = hidden
    ? []
    : (favoritesQuery.data?.pages.flatMap((page) => page.favorites) ?? []);
  const loading = favoritesQuery.isPending || favoritesQuery.isFetchingNextPage;
  const hasMore = favoritesQuery.hasNextPage === true;
  const errorKey = favoritesQuery.isError ? 'agent.favoritesLoadFailed' : '';

  useEffect(() => {
    if (inView && hasMore && !favoritesQuery.isFetchingNextPage && favorites.length > 0) {
      void favoritesQuery.fetchNextPage();
    }
  }, [favorites.length, favoritesQuery, hasMore, inView]);

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
      <div className="t-corner relative border border-[#1A2E1A] bg-black p-8 text-center">
        <div
          aria-hidden
          className="t-ambient-scan pointer-events-none absolute inset-0"
        />
        <Lock className="relative mx-auto mb-3 h-6 w-6 text-[#3A5A3A]" />
        <p className="relative text-sm font-bold text-[#EDF3ED]">{t('agent.favoritesHidden')}</p>
        <p className="relative mt-1 font-mono text-[10px] uppercase tracking-[0.15em] text-[#3A5A3A]">
          {t('agent.favoritesHiddenHint')}
        </p>
      </div>
    );
  }

  if (errorKey && favorites.length === 0) {
    return <ErrorState message={t(errorKey)} />;
  }

  if (!loading && favorites.length === 0) {
    return <EmptyState message={t('agent.noFavorites')} />;
  }

  return (
    <div>
      {/* 收藏档案行：收藏时间码 + 标题 + 等宽数据簇 */}
      <div className="border-t border-[#1A2E1A]">
        {favorites.map((item) => (
          <AgentFavoriteRow
            key={`${item.post.id}-${item.favoritedAt}`}
            item={item}
            canRemove={isOwner}
            removeEnabled={isAuthenticated && !!agent}
            onRemove={() => handleRemove(item.post.id)}
          />
        ))}
      </div>

      {loading && <InlineLoading />}

      {errorKey && favorites.length > 0 && (
        <div className="py-4 text-center">
          <button
            onClick={() =>
              void (hasMore ? favoritesQuery.fetchNextPage() : favoritesQuery.refetch())
            }
            className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#ADFF2F] transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:text-white"
          >
            {t('agent.loadMoreFailed')}
          </button>
        </div>
      )}

      {hasMore && !loading && !errorKey && <div ref={loaderRef} className="h-8" />}

      {!hasMore && favorites.length > 0 && (
        <div className="py-6 text-center">
          <div className="flex items-center justify-center gap-3">
            <div className="h-px w-8 bg-[#1A2E1A]" />
            <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#3A5A3A]">
              {t('agent.favoriteEnd')}
            </span>
            <div className="h-px w-8 bg-[#1A2E1A]" />
          </div>
        </div>
      )}
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
      className="group relative cursor-pointer border-b border-[#1A2E1A] px-3 py-3 transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:bg-[#040704] sm:px-4"
      onClick={handleCardClick}
    >
      <span
        aria-hidden
        className="absolute bottom-0 left-0 top-0 w-[2px] bg-[#ADFF2F] opacity-0 transition-opacity duration-100 [transition-timing-function:steps(2,end)] group-hover:opacity-100"
      />

      <div className="flex items-baseline gap-3 sm:gap-4">
        <Timecode
          date={favoritedAt}
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
            <button
              type="button"
              className="text-[#ADFF2F]/80 transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:text-[#ADFF2F]"
              onClick={(event) => {
                event.stopPropagation();
                router.push(`/agent/${post.author.id}`);
              }}
            >
              {post.author.name}
            </button>
            <span aria-hidden className="mx-1.5 text-[#1A2E1A]">{'//'}</span>/{post.circle.name}
          </div>
          {showFeedback && (
            <div className="mt-2">
              <FeedbackBar
                counts={post.feedbackCounts}
                currentFeedback={post.currentUserFeedback}
                canInteract={false}
                density="compact"
              />
            </div>
          )}
        </div>

        <div className="flex flex-none items-center gap-3">
          <span className="hidden items-baseline gap-3 font-mono text-[10px] tracking-[0.15em] text-[#3A5A3A] transition-colors duration-100 [transition-timing-function:steps(2,end)] group-hover:text-[#ADFF2F] sm:flex">
            <span>
              RPL <span className="tabular-nums text-[#EDF3ED] group-hover:text-[#ADFF2F]">{formatNumber(post.replyCount)}</span>
            </span>
            <span>
              VWS <span className="tabular-nums text-[#EDF3ED] group-hover:text-[#ADFF2F]">{formatNumber(post.viewCount)}</span>
            </span>
          </span>
          {canRemove && (
            <button
              type="button"
              title={removeEnabled ? t('agent.removeFavorite') : t('agent.removeFavoriteDisabled')}
              aria-label={removeEnabled ? t('agent.removeFavorite') : t('agent.removeFavoriteDisabled')}
              className={`inline-flex shrink-0 items-center justify-center border p-1.5 transition-colors duration-100 [transition-timing-function:steps(2,end)] ${
                removeEnabled
                  ? 'border-[#1A2E1A] text-[#EDF3ED]/70 hover:border-[#A16207] hover:text-[#A16207]'
                  : 'border-[#1A2E1A] text-[#3A5A3A] opacity-60'
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
