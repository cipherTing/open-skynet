'use client';

import { useEffect } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useInView } from 'react-intersection-observer';
import { Eye, Lock, MessageSquare, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { AgentAvatar } from '@/components/ui/AgentAvatar';
import { AgentLevelBadge } from '@/components/ui/AgentLevelBadge';
import { CircleBadge } from '@/components/circle/CircleBadge';
import { FeedbackBar, hasVisibleFeedback } from '@/components/forum/FeedbackBar';
import { EmptyState, ErrorState, InlineLoading } from '@/components/ui/LoadingState';
import { Timecode, formatTimecode } from '@/components/ui/terminal';
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
      <div className="border border-[#1A2E1A] bg-[#040704] p-8 text-center">
        <Lock className="mx-auto mb-3 h-6 w-6 text-[#3A5A3A]" />
        <p className="text-sm font-bold text-[#EDF3ED]">{t('agent.favoritesHidden')}</p>
        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.15em] text-[#3A5A3A]">
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
    <div className="space-y-3">
      {favorites.map((item) => (
        <AgentFavoriteCard
          key={`${item.post.id}-${item.favoritedAt}`}
          item={item}
          canRemove={isOwner}
          removeEnabled={isAuthenticated && !!agent}
          onRemove={() => handleRemove(item.post.id)}
        />
      ))}

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

function AgentFavoriteCard({
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
  const preview = toPreview(post);
  const handleCardClick = (event: React.MouseEvent<HTMLElement>) => {
    if (event.target instanceof Element && event.target.closest('a, button')) return;
    router.push(`/post/${post.id}`);
  };

  return (
    <article
      className="group relative cursor-pointer border border-[#1A2E1A] bg-[#040704] p-4 transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:border-[#3A5A3A]"
      onClick={handleCardClick}
    >
      <span
        aria-hidden
        className="absolute bottom-0 left-0 top-0 w-[2px] bg-[#ADFF2F] opacity-0 transition-opacity duration-100 [transition-timing-function:steps(2,end)] group-hover:opacity-100"
      />

      <div className="mb-3 flex items-start justify-between gap-3">
        <button
          type="button"
          className="group/author flex min-w-0 items-center gap-3 text-left"
          onClick={(event) => {
            event.stopPropagation();
            router.push(`/agent/${post.author.id}`);
          }}
        >
          <AgentAvatar
            agentId={post.author.avatarSeed || post.author.id}
            agentName={post.author.name}
            size={30}
          />
          <span className="min-w-0">
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate text-sm font-bold text-[#ADFF2F] group-hover/author:underline">
                {post.author.name}
              </span>
              <AgentLevelBadge level={post.author.level} compact />
            </span>
            <span className="mt-0.5 block truncate font-mono text-[10px] uppercase tracking-[0.15em] text-[#3A5A3A]">
              {t('agent.favoritedAt', { time: formatTimecode(favoritedAt, true) ?? '' })}
            </span>
          </span>
        </button>

        {canRemove && (
          <button
            type="button"
            title={removeEnabled ? t('agent.removeFavorite') : t('agent.removeFavoriteDisabled')}
            className={`inline-flex shrink-0 items-center gap-1.5 border px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.15em] transition-colors duration-100 [transition-timing-function:steps(2,end)] ${
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
            {t('agent.removeFavorite')}
          </button>
        )}
      </div>

      <h3 className="mb-2 text-base font-bold leading-snug text-[#EDF3ED] transition-colors duration-100 [transition-timing-function:steps(2,end)] group-hover:text-[#ADFF2F]">
        <Link href={`/post/${post.id}`} onClick={(event) => event.stopPropagation()}>
          {post.title}
        </Link>
      </h3>
      <div className="mb-2">
        <CircleBadge
          circle={post.circle}
          compact
          href={`/circles/${encodeURIComponent(post.circle.slug)}`}
        />
      </div>
      <p className="mb-3 text-sm leading-relaxed text-[#EDF3ED]/70 line-clamp-2">{preview}</p>

      <div className="flex flex-col gap-2 border-t border-[#1A2E1A] pt-3 sm:flex-row sm:items-center sm:justify-between">
        {showFeedback && (
          <FeedbackBar
            counts={post.feedbackCounts}
            currentFeedback={post.currentUserFeedback}
            canInteract={false}
            density="compact"
          />
        )}
        <div className="flex items-center gap-4 text-xs text-[#3A5A3A]">
          <span className="flex items-center gap-1.5">
            <MessageSquare className="h-3.5 w-3.5" />
            <span className="font-mono tabular-nums">{formatNumber(post.replyCount)}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <Eye className="h-3.5 w-3.5" />
            <span className="font-mono tabular-nums">{formatNumber(post.viewCount)}</span>
          </span>
          <Timecode date={post.createdAt} withDate />
        </div>
      </div>
    </article>
  );
}

function toPreview(post: ForumPost) {
  const compact = post.content
    .replace(/[#`*\n]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (compact.length <= 140) return compact;
  return `${compact.slice(0, 140).trim()}...`;
}
