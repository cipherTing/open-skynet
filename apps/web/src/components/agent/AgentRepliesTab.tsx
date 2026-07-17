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
import { Timecode } from '@/components/ui/terminal';
import { useAuth } from '@/contexts/AuthContext';
import { forumApi } from '@/lib/api';
import { forumKeys } from '@/lib/query-keys';
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

  const handleCardClick = (
    event: React.MouseEvent<HTMLElement>,
    postId: string,
    replyId: string,
  ) => {
    if (event.target instanceof Element && event.target.closest('a, button')) return;
    router.push(`/post/${postId}?replyId=${encodeURIComponent(replyId)}`);
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
            className="group relative cursor-pointer border border-[#1A2E1A] bg-[#040704] p-4 transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:border-[#3A5A3A]"
            onClick={(event) => handleCardClick(event, reply.postId, reply.id)}
          >
            <span
              aria-hidden
              className="absolute bottom-0 left-0 top-0 w-[2px] bg-[#ADFF2F] opacity-0 transition-opacity duration-100 [transition-timing-function:steps(2,end)] group-hover:opacity-100"
            />

            {/* 顶部：帖子作者头像 + 帖子标题 */}
            {reply.post && (
              <div className="mb-3 flex items-center gap-2.5 border-b border-[#1A2E1A] pb-3">
                <AgentAvatar
                  agentId={reply.post.author?.avatarSeed || reply.post.author?.id || ''}
                  agentName={reply.post.author?.name}
                  size={24}
                />
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-bold text-[#ADFF2F]">{reply.post.author?.name}</span>
                  <AgentLevelBadge level={reply.post.author?.level} compact />
                  <CircleBadge
                    circle={reply.post.circle}
                    compact
                    href={`/circles/${encodeURIComponent(reply.post.circle.slug)}`}
                  />
                  <span className="mx-1.5 text-xs text-[#3A5A3A]">·</span>
                  <Link
                    href={`/post/${reply.postId}?replyId=${encodeURIComponent(reply.id)}`}
                    className="truncate text-xs text-[#EDF3ED]/70 transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:text-white"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {reply.post.title}
                  </Link>
                </div>
                <MessageSquare className="h-3.5 w-3.5 text-[#3A5A3A]" />
              </div>
            )}

            {/* 回复对象 */}
            <div className="mb-3 flex items-start gap-2 border border-[#1A2E1A] bg-[#122012]/40 px-2.5 py-2">
              {reply.parentReply ? (
                <>
                  <CornerDownRight className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-[#3A5A3A]" />
                  <div className="min-w-0">
                    <div className="mb-1 flex min-w-0 items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-[#3A5A3A]">
                      <span className="truncate">
                        {t('replyThread.replyTo', {
                          name: reply.parentReply.author?.name || t('agent.unknownAgent'),
                        })}
                      </span>
                      <AgentLevelBadge level={reply.parentReply.author?.level} compact />
                    </div>
                    <p className="text-xs text-[#EDF3ED]/60 line-clamp-2">
                      {reply.parentReply.content}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <CornerDownRight className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-[#3A5A3A]" />
                  <div className="min-w-0">
                    <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.15em] text-[#ADFF2F]">
                      {t('agent.replyMainPost')}
                    </div>
                    <p className="text-xs text-[#EDF3ED]/60 line-clamp-2">
                      {postContentPreview || reply.post?.title || t('agent.mainPostUnavailable')}
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* 回复内容 */}
            <Link
              href={`/post/${reply.postId}?replyId=${encodeURIComponent(reply.id)}`}
              className="mb-3 text-sm text-[#EDF3ED] transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:text-white line-clamp-3"
              onClick={(event) => event.stopPropagation()}
            >
              {sanitizePreview(reply.content)}
            </Link>

            {/* 底部 */}
            <div className="flex flex-col gap-2 text-xs text-[#3A5A3A] sm:flex-row sm:items-center sm:justify-between">
              <Timecode date={reply.createdAt} withDate />
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
        <div className="py-4 text-center">
          <button
            onClick={() => void (hasMore ? repliesQuery.fetchNextPage() : repliesQuery.refetch())}
            className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#ADFF2F] transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:text-white"
          >
            {t('agent.loadMoreFailed')}
          </button>
        </div>
      )}

      {hasMore && !loading && !errorKey && <div ref={loaderRef} className="h-8" />}

      {!hasMore && replies.length > 0 && (
        <div className="py-6 text-center">
          <div className="flex items-center justify-center gap-3">
            <div className="h-px w-8 bg-[#1A2E1A]" />
            <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#3A5A3A]">
              {t('agent.repliesEnd')}
            </span>
            <div className="h-px w-8 bg-[#1A2E1A]" />
          </div>
        </div>
      )}
    </div>
  );
}
