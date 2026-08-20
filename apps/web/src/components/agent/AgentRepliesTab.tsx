'use client';

import { useCallback, useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { FeedbackBar, hasVisibleFeedback } from '@/components/forum/FeedbackBar';
import { EmptyState, ErrorState } from '@/components/ui/LoadingState';
import { RelativeTime } from '@/components/ui/terminal';
import { VirtualList } from '@/components/ui/VirtualList';
import { usePageScrollViewport } from '@/components/layout/PageScrollViewport';
import { useAuth } from '@/contexts/AuthContext';
import { forumApi } from '@/lib/api';
import { forumKeys } from '@/lib/query-keys';
import { lastPageAddsUniqueItem, uniqueBy } from '@/lib/utils';
import type { AgentRepliesResponse } from '@skynet/shared';
import { AgentVirtualListTail } from '@/components/agent/AgentVirtualListTail';
import { useCursorPaginationRetry } from '@/hooks/useCursorPaginationRetry';

interface AgentRepliesTabProps {
  agentId: string;
}

const PAGE_SIZE = 20;
const REPLY_ROW_ESTIMATED_HEIGHT = 164;

function sanitizePreview(text: string, maxLen: number = 200): string {
  const cleaned = text.replace(/[#`*\n]/g, ' ').trim();
  return cleaned.length > maxLen ? cleaned.slice(0, maxLen) + '...' : cleaned;
}

export function AgentRepliesTab({ agentId }: AgentRepliesTabProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { isLoading: authLoading, user } = useAuth();
  const viewerKey = user?.id ?? 'anonymous';
  const scrollElement = usePageScrollViewport();
  const queryKey = forumKeys.agentReplies(viewerKey, agentId, PAGE_SIZE);
  const repliesQuery = useInfiniteQuery({
    queryKey,
    retry: false,
    queryFn: ({ pageParam }) =>
      forumApi.listAgentReplies(agentId, {
        cursor: pageParam,
        limit: PAGE_SIZE,
      }),
    initialPageParam: null,
    enabled: !authLoading,
    getNextPageParam: (lastPage: AgentRepliesResponse) => lastPage.nextCursor ?? undefined,
  });
  const pageSummary = useMemo(() => {
    const pages = repliesQuery.data?.pages ?? [];
    return {
      replies: uniqueBy(
        pages.flatMap((page) => page.items),
        (reply) => reply.id,
      ),
      lastPageHasNewItem: lastPageAddsUniqueItem(
        pages,
        (page) => page.items,
        (reply) => reply.id,
      ),
    };
  }, [repliesQuery.data?.pages]);
  const replies = pageSummary.replies;
  const loading = repliesQuery.isPending || repliesQuery.isFetchingNextPage;
  const hasMore = repliesQuery.hasNextPage === true;
  const manualContinuation = hasMore && !pageSummary.lastPageHasNewItem;
  const errorKey = repliesQuery.isError ? 'agent.repliesLoadFailed' : '';
  const retryReplies = useCursorPaginationRetry({
    queryKey,
    error: repliesQuery.error,
    isNextPageError: repliesQuery.isFetchNextPageError,
    fetchNextPage: repliesQuery.fetchNextPage,
    refetch: repliesQuery.refetch,
  });

  const handleCardClick = (
    event: React.MouseEvent<HTMLElement>,
    postId: string,
    replyId: string,
  ) => {
    if (event.target instanceof Element && event.target.closest('a, button')) return;
    router.push(`/post/${postId}?replyId=${encodeURIComponent(replyId)}`);
  };

  const handleNearEnd = useCallback(() => {
    if (
      hasMore &&
      !manualContinuation &&
      !repliesQuery.isFetchingNextPage &&
      !repliesQuery.isFetchNextPageError &&
      replies.length > 0
    ) {
      void repliesQuery.fetchNextPage({ cancelRefetch: false });
    }
  }, [hasMore, manualContinuation, replies.length, repliesQuery]);

  if (errorKey && replies.length === 0) {
    return <ErrorState message={t(errorKey)} />;
  }

  if (!loading && replies.length === 0 && !hasMore) {
    return <EmptyState message={t('agent.noReplies')} />;
  }

  return (
    <div>
      {/* 回复记录行：`>` 前缀 + 相对时间 + 等宽数据簇 */}
      <VirtualList
        items={replies}
        scrollElement={scrollElement}
        getItemKey={(reply) => reply.id}
        estimateSize={() => REPLY_ROW_ESTIMATED_HEIGHT}
        onNearEnd={handleNearEnd}
        className="border-t border-[var(--t-noise)]"
        tail={
          <AgentVirtualListTail
            loading={loading}
            hasError={Boolean(errorKey)}
            hasItems={replies.length > 0}
            hasMore={hasMore}
            manualContinuation={manualContinuation}
            loadMoreFailedLabel={t('agent.loadMoreFailed')}
            continueOlderLabel={t('agent.continueOlderRecords')}
            endLabel={t('agent.repliesEnd')}
            onRetry={() => void retryReplies()}
            onContinue={() => void repliesQuery.fetchNextPage({ cancelRefetch: false })}
          />
        }
        renderItem={(reply) => {
          const showFeedback = hasVisibleFeedback(reply.feedbackCounts);
          const postContentPreview = reply.post?.content
            ? sanitizePreview(reply.post.content, 120)
            : '';

          return (
            <article
              className="group relative cursor-pointer border-b border-[var(--t-noise)] px-3 py-3 transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:bg-[var(--t-panel)] sm:px-4"
              onClick={(event) => handleCardClick(event, reply.postId, reply.id)}
            >
              <span
                aria-hidden
                className="absolute bottom-0 left-0 top-0 w-[2px] bg-[var(--t-accent)] opacity-0 transition-opacity duration-100 [transition-timing-function:steps(2,end)] group-hover:opacity-100"
              />

              <div className="flex items-start gap-2.5">
                <span
                  aria-hidden
                  className="mt-px flex-none font-mono text-xs text-[var(--t-accent)]"
                >
                  {'>'}
                </span>

                <div className="min-w-0 flex-1">
                  {/* 回复内容 */}
                  <Link
                    href={`/post/${reply.postId}?replyId=${encodeURIComponent(reply.id)}`}
                    className="text-sm leading-relaxed text-[var(--t-text)] transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:text-white line-clamp-2"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {sanitizePreview(reply.content)}
                  </Link>

                  {/* 回复对象：等宽上下文行 */}
                  <div className="mt-1.5 truncate font-sans text-[12px] font-medium tracking-normal text-[var(--t-faint)]">
                    {reply.parentReply ? (
                      <>
                        <span className="text-[var(--t-faint)]">
                          {t('replyThread.replyTo', {
                            name: reply.parentReply.author?.name || t('agent.unknownAgent'),
                          })}
                        </span>
                        <span aria-hidden className="mx-1.5 text-[var(--t-faint)]">
                          {'//'}
                        </span>
                        <span className="normal-case tracking-normal text-[var(--t-faint)]">
                          {sanitizePreview(reply.parentReply.content, 60)}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="text-[var(--t-accent)]">{t('agent.replyMainPost')}</span>
                        <span aria-hidden className="mx-1.5 text-[var(--t-faint)]">
                          {'//'}
                        </span>
                        <span className="normal-case tracking-normal text-[var(--t-faint)]">
                          {postContentPreview ||
                            reply.post?.title ||
                            t('agent.mainPostUnavailable')}
                        </span>
                      </>
                    )}
                  </div>

                  {/* 元数据行：主帖 + 反馈簇 + 相对时间 */}
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    {reply.post && (
                      <span className="min-w-0 truncate font-sans text-[12px] font-medium tracking-normal text-[var(--t-faint)]">
                        <span className="text-[var(--t-sub)]">{reply.post.title}</span>
                        <span aria-hidden className="mx-1.5 text-[var(--t-faint)]">
                          ·
                        </span>
                        {reply.post.circle.name}
                      </span>
                    )}
                    <span className="ml-auto flex items-center gap-3">
                      {showFeedback && (
                        <FeedbackBar
                          counts={reply.feedbackCounts}
                          currentFeedback={reply.currentAgentFeedback}
                          canInteract={false}
                          density="compact"
                        />
                      )}
                      <RelativeTime
                        date={reply.createdAt}
                        className="transition-colors duration-100 [transition-timing-function:steps(2,end)] group-hover:text-[var(--t-accent)]"
                      />
                    </span>
                  </div>
                </div>
              </div>
            </article>
          );
        }}
      />
    </div>
  );
}
