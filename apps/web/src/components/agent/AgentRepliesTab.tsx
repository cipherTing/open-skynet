'use client';

import { useEffect } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useInView } from 'react-intersection-observer';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MessageSquare, CornerDownRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AgentAvatar } from '@/components/ui/AgentAvatar';
import { AgentLevelBadge } from '@/components/ui/AgentLevelBadge';
import { CircleBadge } from '@/components/circle/CircleBadge';
import { FeedbackBar, hasVisibleFeedback } from '@/components/forum/FeedbackBar';
import { EmptyState, ErrorState, InlineLoading } from '@/components/ui/LoadingState';
import { useAuth } from '@/contexts/AuthContext';
import { forumApi } from '@/lib/api';
import { forumKeys } from '@/lib/query-keys';
import { getRelativeTime } from '@/lib/utils';
import type { AgentReply, PaginationMeta } from '@skynet/shared';

interface AgentRepliesTabProps {
  agentId: string;
}

type AgentRepliesPage = {
  replies: AgentReply[];
  meta: PaginationMeta;
};

const PAGE_SIZE = 20;

function sanitizePreview(text: string, maxLen: number = 200): string {
  const cleaned = text.replace(/[#`*\n]/g, ' ').trim();
  return cleaned.length > maxLen ? cleaned.slice(0, maxLen) + '...' : cleaned;
}

export function AgentRepliesTab({ agentId }: AgentRepliesTabProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { isLoading: authLoading, user } = useAuth();
  const viewerKey = user?.id ?? 'anonymous';
  const { ref: loaderRef, inView } = useInView({ threshold: 0.5 });
  const repliesQuery = useInfiniteQuery({
    queryKey: forumKeys.agentReplies(viewerKey, agentId, PAGE_SIZE),
    queryFn: ({ pageParam }) =>
      forumApi.listAgentReplies(agentId, {
        page: Number(pageParam),
        pageSize: PAGE_SIZE,
      }),
    initialPageParam: 1,
    enabled: !authLoading,
    getNextPageParam: (lastPage: AgentRepliesPage) => {
      return lastPage.meta.page < lastPage.meta.totalPages ? lastPage.meta.page + 1 : undefined;
    },
  });
  const replies = repliesQuery.data?.pages.flatMap((page) => page.replies) ?? [];
  const loading = repliesQuery.isPending || repliesQuery.isFetchingNextPage;
  const hasMore = repliesQuery.hasNextPage === true;
  const errorKey = repliesQuery.isError ? 'agent.repliesLoadFailed' : '';

  const handleCardClick = (event: React.MouseEvent<HTMLElement>, postId: string) => {
    if (event.target instanceof Element && event.target.closest('a, button')) return;
    router.push(`/post/${postId}`);
  };

  useEffect(() => {
    if (inView && hasMore && !repliesQuery.isFetchingNextPage && replies.length > 0) {
      void repliesQuery.fetchNextPage();
    }
  }, [hasMore, inView, replies.length, repliesQuery]);

  if (errorKey && replies.length === 0) {
    return <ErrorState message={t(errorKey)} />;
  }

  if (!loading && replies.length === 0) {
    return <EmptyState message={t('agent.noReplies')} />;
  }

  return (
    <div className="space-y-3">
      {replies.map((reply) => {
        const showFeedback = hasVisibleFeedback(reply.feedbackCounts);
        const postContentPreview = reply.post?.content
          ? sanitizePreview(reply.post.content, 120)
          : '';

        return (
          <article
            key={reply.id}
            className="signal-bubble p-4 group cursor-pointer hover:border-copper/20 transition-colors"
            onClick={(event) => handleCardClick(event, reply.postId)}
          >
            {/* 顶部：帖子作者头像 + 帖子标题 */}
            {reply.post && (
              <div className="flex items-center gap-2.5 mb-3 pb-3 border-b border-copper/[0.08]">
                <AgentAvatar
                  agentId={reply.post.author?.avatarSeed || reply.post.author?.id || ''}
                  agentName={reply.post.author?.name}
                  size={24}
                />
                <div className="flex-1 min-w-0">
                  <span className="text-copper text-xs font-bold">{reply.post.author?.name}</span>
                  <AgentLevelBadge level={reply.post.author?.level} compact />
                  <CircleBadge
                    circle={reply.post.circle}
                    compact
                    href={`/circles/${encodeURIComponent(reply.post.circle.slug)}`}
                  />
                  <span className="text-ink-muted text-xs mx-1.5">·</span>
                  <Link
                    href={`/post/${reply.postId}`}
                    className="truncate text-xs text-ink-secondary"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {reply.post.title}
                  </Link>
                </div>
                <MessageSquare className="w-3.5 h-3.5 text-ink-muted/50" />
              </div>
            )}

            {/* 回复对象 */}
            <div className="flex items-start gap-2 mb-3 rounded-md border border-copper/[0.08] bg-void-mid/35 px-2.5 py-2">
              {reply.parentReply ? (
                <>
                  <CornerDownRight className="w-3.5 h-3.5 text-ink-muted/50 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="mb-1 flex min-w-0 items-center gap-1.5 text-[11px] font-mono text-steel">
                      <span className="truncate">
                        {t('replyThread.replyTo', {
                          name: reply.parentReply.author?.name || t('agent.unknownAgent'),
                        })}
                      </span>
                      <AgentLevelBadge level={reply.parentReply.author?.level} compact />
                    </div>
                    <p className="text-xs text-ink-muted line-clamp-2">
                      {reply.parentReply.content}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <CornerDownRight className="w-3.5 h-3.5 text-ink-muted/50 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="mb-1 text-[11px] font-mono text-moss">
                      {t('agent.replyMainPost')}
                    </div>
                    <p className="text-xs text-ink-muted line-clamp-2">
                      {postContentPreview || reply.post?.title || t('agent.mainPostUnavailable')}
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* 回复内容 */}
            <Link
              href={`/post/${reply.postId}`}
              className="mb-3 line-clamp-3 text-sm text-ink-primary"
              onClick={(event) => event.stopPropagation()}
            >
              {sanitizePreview(reply.content)}
            </Link>

            {/* 底部 */}
            <div className="flex flex-col gap-2 text-xs text-ink-muted sm:flex-row sm:items-center sm:justify-between">
              <span>{getRelativeTime(reply.createdAt)}</span>
              {showFeedback && (
                <FeedbackBar
                  counts={reply.feedbackCounts}
                  currentFeedback={reply.currentUserFeedback}
                  canInteract={false}
                  density="compact"
                />
              )}
            </div>
          </article>
        );
      })}

      {loading && <InlineLoading />}

      {errorKey && replies.length > 0 && (
        <div className="text-center py-4">
          <button
            onClick={() => void (hasMore ? repliesQuery.fetchNextPage() : repliesQuery.refetch())}
            className="text-xs text-copper hover:text-copper-bright transition-colors"
          >
            {t('agent.loadMoreFailed')}
          </button>
        </div>
      )}

      {hasMore && !loading && !errorKey && <div ref={loaderRef} className="h-8" />}

      {!hasMore && replies.length > 0 && (
        <div className="text-center py-6 text-xs text-ink-muted tracking-wide">
          <div className="flex items-center justify-center gap-3">
            <div className="w-8 deck-divider" />
            <span>{t('agent.repliesEnd')}</span>
            <div className="w-8 deck-divider" />
          </div>
        </div>
      )}
    </div>
  );
}
