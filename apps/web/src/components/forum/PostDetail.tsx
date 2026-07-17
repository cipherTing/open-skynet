'use client';

import { useState, useEffect, useRef } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  BellRing,
  Bookmark,
  BookmarkCheck,
  Eye,
  MessageSquare,
  Quote,
  X,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { useTranslation } from 'react-i18next';
import { AgentAvatar } from '@/components/ui/AgentAvatar';
import { AgentLevelBadge } from '@/components/ui/AgentLevelBadge';
import { CircleBadge } from '@/components/circle/CircleBadge';
import { FeedbackBar, hasVisibleFeedback } from './FeedbackBar';
import { ReportDialog } from './ReportDialog';
import { PostTags } from './PostTags';
import { PostRevisionActions } from './PostRevisionActions';
import { GovernanceCaseStamp } from '@/components/governance/GovernanceCaseStamp';
import { ReplyThread } from './ReplyThread';
import { ReplyInput } from './ReplyInput';
import { ErrorState } from '@/components/ui/LoadingState';
import { TEmpty, TSkeleton, Timecode } from '@/components/ui/terminal';
import { ApiError, forumApi } from '@/lib/api';
import { forumKeys, watchKeys } from '@/lib/query-keys';
import { notifyProgressionUpdated } from '@/lib/progression-events';
import { formatNumber } from '@/lib/utils';
import { useOwnerOperation } from '@/contexts/OwnerOperationContext';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/SignalToast';
import type { FeedbackType, ForumPost, ForumQuoteSourceType, ForumReply } from '@skynet/shared';

interface PostDetailProps {
  postId: string;
}

interface ReplyQuoteDraft {
  sourceType: ForumQuoteSourceType;
  sourceId: string;
  sourceContentVersion: number;
  text: string;
}

export function PostDetail({ postId }: PostDetailProps) {
  return <PostDetailContent key={postId} postId={postId} />;
}

function PostDetailContent({ postId }: PostDetailProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const highlightedReplyId = searchParams.get('replyId');
  const selectedReplyId = highlightedReplyId ?? '';
  const selectionKey = highlightedReplyId ? `${postId}:${highlightedReplyId}` : null;
  const [dismissedSelectionKey, setDismissedSelectionKey] = useState<string | null>(null);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [watchBusy, setWatchBusy] = useState(false);
  const activePostIdRef = useRef(postId);
  const trackedViewPostIdRef = useRef<string | null>(null);
  const postContentRef = useRef<HTMLDivElement | null>(null);
  const [replyQuote, setReplyQuote] = useState<ReplyQuoteDraft | null>(null);
  const { ownerOperationEnabled, canOperateAsAgent } = useOwnerOperation();
  const { agent, isAuthenticated, isLoading: authLoading, user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const viewerKey = user?.id ?? 'anonymous';
  const postQuery = useQuery({
    queryKey: forumKeys.post(viewerKey, postId),
    queryFn: () => forumApi.getPost(postId),
    enabled: !authLoading || viewerKey === 'anonymous',
  });
  const repliesQuery = useInfiniteQuery({
    queryKey: forumKeys.replies(viewerKey, postId),
    queryFn: ({ pageParam }) =>
      forumApi.listReplies(postId, {
        cursor: pageParam || undefined,
        limit: 20,
        childLimit: 3,
      }),
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: !authLoading,
  });
  const selectedReplyQuery = useQuery({
    queryKey: forumKeys.replySelection(viewerKey, postId, selectedReplyId),
    queryFn: () => forumApi.getReplySelection(postId, selectedReplyId),
    enabled: !authLoading && selectedReplyId.length > 0,
  });
  const post = postQuery.data ?? null;
  const replies = repliesQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const loading = postQuery.isPending;
  const hasPostError = postQuery.isError;

  useEffect(() => {
    activePostIdRef.current = postId;
  }, [postId]);

  useEffect(() => {
    if (trackedViewPostIdRef.current !== postId) {
      trackedViewPostIdRef.current = postId;
      forumApi.trackView(postId).catch((error: unknown) => {
        console.error('Track view failed:', error);
      });
    }
  }, [postId]);

  const refreshPostData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: forumKeys.post(viewerKey, postId) }),
      queryClient.invalidateQueries({ queryKey: forumKeys.postsRoot(viewerKey) }),
    ]);
  };

  const refreshReplyData = async () => {
    await queryClient.invalidateQueries({ queryKey: forumKeys.replies(viewerKey, postId) });
  };

  const refreshReplyCreatedData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: forumKeys.replies(viewerKey, postId) }),
      queryClient.invalidateQueries({ queryKey: forumKeys.post(viewerKey, postId) }),
      queryClient.invalidateQueries({ queryKey: forumKeys.postsRoot(viewerKey) }),
    ]);
  };

  const getUnavailableReason = (isOwnContent: boolean, targetName: string) => {
    if (isOwnContent) return t('forum.cannotFeedbackOwn', { target: targetName });
    if (!isAuthenticated) return t('forum.loginRequired');
    if (!agent) return t('forum.noAgent');
    if (!ownerOperationEnabled) return t('forum.ownerOperationRequiredFeedback');
    return undefined;
  };

  const getFavoriteUnavailableReason = () => {
    if (!isAuthenticated) return t('forum.loginRequired');
    if (!agent) return t('forum.noAgent');
    return undefined;
  };

  const getWatchUnavailableReason = () => {
    if (!isAuthenticated) return t('forum.loginRequired');
    if (!agent) return t('forum.noAgent');
    return undefined;
  };

  const getReportUnavailableReason = (isOwnContent: boolean, targetName: string) => {
    if (isOwnContent) return t('report.cannotOwn', { target: targetName });
    if (!isAuthenticated) return t('forum.loginRequired');
    if (!agent) return t('forum.noAgent');
    if (!ownerOperationEnabled) return t('report.ownerOperationRequired');
    return undefined;
  };

  const handleFeedback = async (type: FeedbackType) => {
    if (!post) return;
    const isOwnPost = agent?.id === post.author?.id;
    const unavailableReason = getUnavailableReason(isOwnPost, t('forum.postTarget'));
    if (unavailableReason) {
      toast.error(unavailableReason);
      return;
    }
    try {
      const result = await forumApi.feedbackOnPost(postId, type);
      if (result.progressDelta) notifyProgressionUpdated();
      await refreshPostData();
    } catch (err) {
      console.error('反馈失败:', err);
      toast.error(err instanceof ApiError ? err.message : t('replyThread.feedbackFailed'));
    }
  };

  const handleFavorite = async () => {
    if (!post || favoriteBusy) return;
    const unavailableReason = getFavoriteUnavailableReason();
    if (unavailableReason) {
      toast.error(unavailableReason);
      return;
    }

    const previousFavorited = post.currentAgentFavorited === true;
    const nextFavorited = !previousFavorited;
    const requestPostId = postId;
    setFavoriteBusy(true);
    queryClient.setQueryData<ForumPost>(forumKeys.post(viewerKey, requestPostId), {
      ...post,
      currentAgentFavorited: nextFavorited,
    });
    try {
      const result = nextFavorited
        ? await forumApi.favoritePost(requestPostId)
        : await forumApi.unfavoritePost(requestPostId);
      if (activePostIdRef.current !== requestPostId) return;
      queryClient.setQueryData<ForumPost>(forumKeys.post(viewerKey, requestPostId), (current) =>
        current ? { ...current, currentAgentFavorited: result.favorited } : current,
      );
      void queryClient.invalidateQueries({ queryKey: forumKeys.postsRoot(viewerKey) });
      if (agent) {
        void queryClient.invalidateQueries({
          queryKey: forumKeys.agentFavorites(viewerKey, agent.id, 20),
        });
      }
      toast.success(result.favorited ? t('forum.favoriteAdded') : t('forum.favoriteRemoved'));
    } catch (err) {
      if (activePostIdRef.current !== requestPostId) return;
      queryClient.setQueryData<ForumPost>(forumKeys.post(viewerKey, requestPostId), (current) =>
        current ? { ...current, currentAgentFavorited: previousFavorited } : current,
      );
      const message = err instanceof ApiError ? err.message : t('forum.favoriteFailed');
      toast.error(message);
    } finally {
      if (activePostIdRef.current === requestPostId) {
        setFavoriteBusy(false);
      }
    }
  };

  const handleWatch = async () => {
    if (!post || watchBusy) return;
    const unavailableReason = getWatchUnavailableReason();
    if (unavailableReason) {
      toast.error(unavailableReason);
      return;
    }

    const previousWatching = post.currentAgentWatching === true;
    const nextWatching = !previousWatching;
    const requestPostId = postId;
    setWatchBusy(true);
    queryClient.setQueryData<ForumPost>(forumKeys.post(viewerKey, requestPostId), {
      ...post,
      currentAgentWatching: nextWatching,
    });
    try {
      const result = nextWatching
        ? await forumApi.watchPost(requestPostId)
        : await forumApi.unwatchPost(requestPostId);
      if (activePostIdRef.current !== requestPostId) return;
      queryClient.setQueryData<ForumPost>(forumKeys.post(viewerKey, requestPostId), (current) =>
        current ? { ...current, currentAgentWatching: result.watching } : current,
      );
      await queryClient.invalidateQueries({ queryKey: watchKeys.root });
      toast.success(result.watching ? t('forum.watchAdded') : t('forum.watchRemoved'));
    } catch (err) {
      if (activePostIdRef.current !== requestPostId) return;
      queryClient.setQueryData<ForumPost>(forumKeys.post(viewerKey, requestPostId), (current) =>
        current ? { ...current, currentAgentWatching: previousWatching } : current,
      );
      void queryClient.invalidateQueries({ queryKey: watchKeys.root });
      void queryClient.invalidateQueries({ queryKey: forumKeys.post(viewerKey, requestPostId) });
      toast.error(err instanceof ApiError ? err.message : t('forum.watchFailed'));
    } finally {
      if (activePostIdRef.current === requestPostId) {
        setWatchBusy(false);
      }
    }
  };

  const handleReply = async (content: string) => {
    if (!canOperateAsAgent) return;
    try {
      const created = await forumApi.createReply(postId, {
        content,
        ...(replyQuote ? { quote: replyQuote } : {}),
      });
      if (created.progressDelta) notifyProgressionUpdated();
      setReplyQuote(null);
      await refreshReplyCreatedData();
    } catch (err) {
      console.error('回复失败:', err);
      toast.error(t('replyInput.sendFailed'));
    }
  };

  const quoteSelectedPostText = () => {
    if (!post) return;
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim() ?? '';
    const anchorNode = selection?.anchorNode;
    const focusNode = selection?.focusNode;
    if (
      !selectedText ||
      selectedText.length > 2000 ||
      !anchorNode ||
      !focusNode ||
      !postContentRef.current?.contains(anchorNode) ||
      !postContentRef.current.contains(focusNode)
    ) {
      toast.error(t('replyInput.selectQuoteText'));
      return;
    }
    setReplyQuote({
      sourceType: 'POST',
      sourceId: post.id,
      sourceContentVersion: post.contentVersion,
      text: selectedText,
    });
    document
      .getElementById('post-reply-composer')
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  if (loading) {
    return (
      <div role="status" aria-label={t('forum.loadingPost')} className="flex flex-col gap-6 py-8">
        <TSkeleton rows={2} />
        <TSkeleton rows={4} />
        <TSkeleton rows={3} />
      </div>
    );
  }

  if (hasPostError || !post) {
    return (
      <div className="py-20">
        <ErrorState message={t('forum.postLost', { id: postId })} />
      </div>
    );
  }

  const isOwnPost = agent?.id === post.author?.id;
  const postFeedbackReason = getUnavailableReason(isOwnPost, t('forum.postTarget'));
  const postReportReason = getReportUnavailableReason(isOwnPost, t('forum.postTarget'));
  const canFeedbackOnPost = canOperateAsAgent && !postFeedbackReason;
  const showPostFeedback = hasVisibleFeedback(post.feedbackCounts);
  const favoriteReason = getFavoriteUnavailableReason();
  const canFavoritePost = !favoriteReason;
  const postFavorited = post.currentAgentFavorited === true;
  const watchReason = getWatchUnavailableReason();
  const canWatchPost = !watchReason;
  const postWatching = post.currentAgentWatching === true;

  return (
    <div className="w-full pb-8">
      {/* 主帖内容 */}
      <article className="post-topic-card t-corner relative mb-7 overflow-visible border px-5 py-5 sm:px-7 sm:py-6">
        {post.activeGovernanceCase ? (
          <GovernanceCaseStamp caseId={post.activeGovernanceCase.id} />
        ) : null}

        <div className="post-topic-card-header mb-5 flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-start sm:justify-between">
          <button
            type="button"
            className="group/author flex min-w-0 items-center gap-3 text-left"
            onClick={() => router.push(`/agent/${post.author?.id}`)}
          >
            <AgentAvatar
              agentId={post.author?.avatarSeed || post.author?.id || ''}
              agentName={post.author?.name}
              size={40}
            />
            <span className="min-w-0">
              <span className="flex min-w-0 items-center gap-2">
                <span className="post-topic-author-name truncate text-base font-bold group-hover/author:underline">
                  {post.author?.name}
                </span>
                <AgentLevelBadge level={post.author?.level} />
              </span>
              {post.author?.description && (
                <span className="post-topic-muted block max-w-[520px] truncate text-[12px]">
                  {post.author.description}
                </span>
              )}
            </span>
          </button>

          <div className="post-topic-muted flex flex-wrap items-center gap-x-3 gap-y-1.5 font-mono text-[11px] tabular-nums sm:justify-end">
            <span className="tracking-wider text-info">{t('forum.dossier')}</span>
            <CircleBadge
              circle={post.circle}
              compact
              href={`/circles/${encodeURIComponent(post.circle.slug)}`}
            />
            <span>{post.id.slice(0, 8).toUpperCase()}</span>
            <Timecode date={post.createdAt} withDate />
            <span className="flex items-center gap-1">
              <MessageSquare className="w-3 h-3" />
              {formatNumber(post.replyCount || 0)}
            </span>
            <span className="flex items-center gap-1">
              <Eye className="w-3 h-3" />
              {formatNumber(post.viewCount || 0)}
            </span>
            <button
              type="button"
              disabled={favoriteBusy}
              onClick={handleFavorite}
              className={`inline-flex items-center gap-1 border px-2.5 py-1 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                postFavorited
                  ? 'border-accent/40 bg-accent-muted text-accent'
                  : 'border-border text-text-secondary hover:border-border-accent hover:text-accent'
              }`}
            >
              {postFavorited ? (
                <BookmarkCheck className="h-3.5 w-3.5" />
              ) : (
                <Bookmark className="h-3.5 w-3.5" />
              )}
              {postFavorited ? t('forum.favorited') : t('forum.favorite')}
            </button>
            <button
              type="button"
              disabled={watchBusy}
              aria-disabled={!canWatchPost || undefined}
              onClick={handleWatch}
              className={`inline-flex items-center gap-1 border px-2.5 py-1 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                postWatching
                  ? 'border-info/40 bg-info/10 text-info'
                  : 'border-border text-text-secondary hover:border-border-accent hover:text-accent'
              }`}
            >
              {postWatching ? (
                <BellRing className="h-3.5 w-3.5" />
              ) : (
                <Bell className="h-3.5 w-3.5" />
              )}
              {postWatching ? t('forum.watching') : t('forum.watch')}
            </button>
          </div>
        </div>

        <h1 className="post-topic-title mb-4 text-2xl font-bold leading-tight sm:text-3xl">
          {post.title}
        </h1>

        <div className="mb-4">
          <PostTags tags={post.tags} />
        </div>

        {(post.contentVersion > 1 || isOwnPost) && (
          <div className="mb-4">
            <PostRevisionActions
              post={post}
              canEdit={isOwnPost && canOperateAsAgent}
              onUpdated={refreshPostData}
            />
          </div>
        )}

        <div
          id="post-content"
          ref={postContentRef}
          className="prose-deck post-topic-prose post-topic-prose-panel mb-3 max-w-none border px-4 py-3"
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
            {post.content}
          </ReactMarkdown>
        </div>

        {canOperateAsAgent ? (
          <div className="mb-4 flex justify-end">
            <button
              type="button"
              onClick={quoteSelectedPostText}
              className="inline-flex items-center gap-1 font-mono text-[11px] text-text-tertiary transition-colors hover:text-info"
            >
              <Quote className="h-3.5 w-3.5" />
              {t('replyInput.quoteSelection')}
            </button>
          </div>
        ) : null}

        {(showPostFeedback || canFeedbackOnPost || postFeedbackReason) && (
          <div className="post-topic-feedback flex flex-col gap-2 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
            <FeedbackBar
              counts={post.feedbackCounts}
              currentFeedback={post.currentUserFeedback}
              canInteract={canFeedbackOnPost}
              unavailableReason={postFeedbackReason}
              onSelect={handleFeedback}
              onUnavailable={() => {
                if (postFeedbackReason) toast.error(postFeedbackReason);
              }}
            />
            <ReportDialog
              targetType="POST"
              targetId={post.id}
              targetContentVersion={post.contentVersion}
              unavailableReason={postReportReason}
            />
          </div>
        )}
      </article>

      {/* 回复区域 */}
      <section>
        <div className="mb-5 flex items-center gap-3 px-1">
          <span className="font-mono text-[11px] tracking-[0.2em] text-[#ADFF2F]">CH.02</span>
          <span className="font-mono text-[11px] tracking-[0.2em] text-[#3A5A3A]">{'//'}</span>
          <span className="text-[13px] font-bold tracking-wide text-text-primary">
            {t('forum.chapterReplies')}
          </span>
          <span aria-hidden className="h-px flex-1 bg-[#1A2E1A]" />
          <span className="font-mono text-[10px] tracking-[0.15em] text-[#3A5A3A] tabular-nums">
            {formatNumber(post.replyCount || 0)} REPLIES
          </span>
        </div>

        {/* 新回复输入 */}
        {canOperateAsAgent && (
          <div id="post-reply-composer" className="mb-5">
            <ReplyInput
              onSubmit={handleReply}
              placeholder={t('forum.replyPlaceholder')}
              quoteText={replyQuote?.text ?? null}
              onClearQuote={() => setReplyQuote(null)}
            />
          </div>
        )}

        {selectionKey && dismissedSelectionKey !== selectionKey ? (
          <div className="sticky top-2 z-20 mb-3">
            <div
              className={`selected-reply-shell border p-2.5 ${selectedReplyQuery.data ? 'selected-reply-pulse' : ''}`}
            >
              <div className="mb-2 flex items-center justify-between gap-3 px-1">
                <span className="inline-flex items-center border border-border-accent bg-accent-muted px-2 py-1 font-mono text-[11px] text-accent">
                  {t('replyThread.selected')}
                </span>
                <button
                  type="button"
                  aria-label={t('replyThread.closeSelected')}
                  title={t('replyThread.closeSelected')}
                  onClick={() => setDismissedSelectionKey(selectionKey)}
                  className="flex h-7 w-7 items-center justify-center text-text-tertiary transition-colors hover:bg-surface-3 hover:text-text-primary"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {selectedReplyQuery.isPending ? (
                <div role="status" aria-label={t('app.loading')} className="px-2 py-3">
                  <TSkeleton rows={3} />
                </div>
              ) : selectedReplyQuery.isError || !selectedReplyQuery.data ? (
                <p className="px-2 py-5 text-center font-mono text-xs font-semibold text-danger">
                  {t('replyThread.selectedLoadFailed')}
                </p>
              ) : (
                <ReplyThread
                  reply={selectedReplyQuery.data.rootReply}
                  postId={postId}
                  highlightedReplyId={selectedReplyQuery.data.selectedReplyId}
                  domIdPrefix="selected-reply"
                  onReplyCreated={refreshReplyCreatedData}
                  onReplyUpdated={refreshReplyData}
                />
              )}
            </div>
          </div>
        ) : null}

        <div className="space-y-3">
          {repliesQuery.isPending && (
            <div role="status" aria-label={t('forum.loadingReplies')} className="py-2">
              <TSkeleton rows={4} />
            </div>
          )}

          {replies.map((reply) => (
            <ReplyThread
              key={reply.id}
              reply={reply}
              postId={postId}
              highlightedReplyId={highlightedReplyId}
              onReplyCreated={refreshReplyCreatedData}
              onReplyUpdated={refreshReplyData}
            />
          ))}
        </div>

        {repliesQuery.isError && (
          <div className="border border-danger/40 border-l-2 border-l-danger bg-danger/10 px-4 py-3 text-center font-mono text-[12px] tracking-wide text-danger">
            <p>{t('forum.repliesLoadFailed')}</p>
            <button
              type="button"
              onClick={() => void repliesQuery.refetch()}
              className="mt-2 text-accent transition-colors hover:text-accent-dim"
            >
              {t('app.retry')}
            </button>
          </div>
        )}

        {repliesQuery.hasNextPage && (
          <div className="flex justify-center pt-5">
            <button
              type="button"
              disabled={repliesQuery.isFetchingNextPage}
              onClick={() => void repliesQuery.fetchNextPage()}
              className="t-btn t-btn--ghost"
            >
              {repliesQuery.isFetchingNextPage
                ? t('forum.loadingMoreReplies')
                : t('forum.loadMoreReplies')}
            </button>
          </div>
        )}

        {replies.length === 0 && !repliesQuery.isPending && !repliesQuery.isError && (
          <div className="py-4">
            <TEmpty message={t('forum.replyEmpty')} />
          </div>
        )}
      </section>
    </div>
  );
}
