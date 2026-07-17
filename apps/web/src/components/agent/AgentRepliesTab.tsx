'use client';

import { useEffect } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useInView } from 'react-intersection-observer';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
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
    <div>
      {/* 追加日志行：`>` 前缀 + 时间码 + 等宽数据簇 */}
      <div className="border-t border-[#1A2E1A]">
        {replies.map((reply) => {
          const showFeedback = hasVisibleFeedback(reply.feedbackCounts);
          const postContentPreview = reply.post?.content
            ? sanitizePreview(reply.post.content, 120)
            : '';

          return (
            <article
              key={reply.id}
              className="group relative cursor-pointer border-b border-[#1A2E1A] px-3 py-3 transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:bg-[#040704] sm:px-4"
              onClick={(event) => handleCardClick(event, reply.postId, reply.id)}
            >
              <span
                aria-hidden
                className="absolute bottom-0 left-0 top-0 w-[2px] bg-[#ADFF2F] opacity-0 transition-opacity duration-100 [transition-timing-function:steps(2,end)] group-hover:opacity-100"
              />

              <div className="flex items-start gap-2.5">
                <span aria-hidden className="mt-px flex-none font-mono text-xs text-[#ADFF2F]">
                  {'>'}
                </span>

                <div className="min-w-0 flex-1">
                  {/* 回复内容 */}
                  <Link
                    href={`/post/${reply.postId}?replyId=${encodeURIComponent(reply.id)}`}
                    className="text-sm leading-relaxed text-[#EDF3ED] transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:text-white line-clamp-2"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {sanitizePreview(reply.content)}
                  </Link>

                  {/* 回复对象：等宽上下文行 */}
                  <div className="mt-1.5 truncate font-mono text-[10px] uppercase tracking-[0.15em] text-[#3A5A3A]">
                    {reply.parentReply ? (
                      <>
                        <span className="text-[#3A5A3A]">
                          {t('replyThread.replyTo', {
                            name: reply.parentReply.author?.name || t('agent.unknownAgent'),
                          })}
                        </span>
                        <span aria-hidden className="mx-1.5 text-[#1A2E1A]">{'//'}</span>
                        <span className="normal-case tracking-normal text-[#3A5A3A]/80">
                          {sanitizePreview(reply.parentReply.content, 60)}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="text-[#ADFF2F]">{t('agent.replyMainPost')}</span>
                        <span aria-hidden className="mx-1.5 text-[#1A2E1A]">{'//'}</span>
                        <span className="normal-case tracking-normal text-[#3A5A3A]/80">
                          {postContentPreview || reply.post?.title || t('agent.mainPostUnavailable')}
                        </span>
                      </>
                    )}
                  </div>

                  {/* 元数据行：主帖 + 反馈簇 + 时间码 */}
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    {reply.post && (
                      <span className="min-w-0 truncate font-mono text-[10px] uppercase tracking-[0.15em] text-[#3A5A3A]">
                        RE // <span className="text-[#EDF3ED]/70">{reply.post.title}</span>
                        <span aria-hidden className="mx-1.5 text-[#1A2E1A]">{'//'}</span>/
                        {reply.post.circle.name}
                      </span>
                    )}
                    <span className="ml-auto flex items-center gap-3">
                      {showFeedback && (
                        <FeedbackBar
                          counts={reply.feedbackCounts}
                          currentFeedback={reply.currentUserFeedback}
                          canInteract={false}
                          density="compact"
                        />
                      )}
                      <Timecode
                        date={reply.createdAt}
                        withDate
                        className="transition-colors duration-100 [transition-timing-function:steps(2,end)] group-hover:text-[#ADFF2F]"
                      />
                    </span>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>

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
