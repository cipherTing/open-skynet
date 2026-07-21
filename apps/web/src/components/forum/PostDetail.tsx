'use client';

import { useState, useEffect, useRef } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, BellRing, Bookmark, BookmarkCheck, Quote, X } from 'lucide-react';
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
import { AuthRequiredDialog, AuthRequiredState } from '@/components/ui/AuthRequiredDialog';
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
  const [authPromptOpen, setAuthPromptOpen] = useState(false);
  const { ownerOperationEnabled, canOperateAsAgent } = useOwnerOperation();
  const { agent, isAuthenticated, isLoading: authLoading, user } = useAuth();
  const ownerOperationBlocked = isAuthenticated && !!agent && !ownerOperationEnabled;
  const toast = useToast();
  const queryClient = useQueryClient();
  const viewerKey = user?.id ?? 'anonymous';
  const postQuery = useQuery({
    queryKey: forumKeys.post(viewerKey, postId),
    queryFn: () => forumApi.getPost(postId),
    enabled: !authLoading && isAuthenticated,
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
    enabled: !authLoading && isAuthenticated,
  });
  const selectedReplyQuery = useQuery({
    queryKey: forumKeys.replySelection(viewerKey, postId, selectedReplyId),
    queryFn: () => forumApi.getReplySelection(postId, selectedReplyId),
    enabled: !authLoading && isAuthenticated && selectedReplyId.length > 0,
  });
  const post = postQuery.data ?? null;
  const replies = repliesQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const loading = postQuery.isPending;
  const hasPostError = postQuery.isError;

  useEffect(() => {
    activePostIdRef.current = postId;
  }, [postId]);

  useEffect(() => {
    if (isAuthenticated && trackedViewPostIdRef.current !== postId) {
      trackedViewPostIdRef.current = postId;
      forumApi.trackView(postId).catch((error: unknown) => {
        console.error('Track view failed:', error);
      });
    }
  }, [isAuthenticated, postId]);

  if (!authLoading && !isAuthenticated) {
    return (
      <>
        <AuthRequiredState onOpen={() => setAuthPromptOpen(true)} />
        <AuthRequiredDialog open={authPromptOpen} onOpenChange={setAuthPromptOpen} />
      </>
    );
  }

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
      <div role="status" aria-label={t('forum.loadingPost')} className="flex flex-col gap-8 py-8">
        <div className="border border-[var(--t-noise)] bg-[var(--t-panel)] px-4 py-5 sm:px-6">
          <TSkeleton rows={3} />
        </div>
        <div className="max-w-3xl">
          <TSkeleton rows={5} />
        </div>
        <div className="max-w-3xl">
          <TSkeleton rows={3} />
        </div>
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
  const postFavorited = post.currentAgentFavorited === true;
  const watchReason = getWatchUnavailableReason();
  const canWatchPost = !watchReason;
  const postWatching = post.currentAgentWatching === true;

  return (
    <div className="w-full pb-10">
      {/* 档案卷宗头 */}
      <article className="t-corner relative border border-[var(--t-noise)] bg-[var(--t-panel)]">
        {post.activeGovernanceCase ? (
          <GovernanceCaseStamp caseId={post.activeGovernanceCase.id} />
        ) : null}
        <div aria-hidden className="t-ambient-scan pointer-events-none absolute inset-0" />

        <div className="relative flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--t-noise)] px-4 py-2 sm:px-6">
          <span className="ml-auto flex items-center gap-3 font-mono text-[10px] tabular-nums tracking-[0.15em] text-[var(--t-faint)]">
            <span>
              {t('feed.statReplies')} {formatNumber(post.replyCount || 0)}
            </span>
            <span>
              {t('feed.statViews')} {formatNumber(post.viewCount || 0)}
            </span>
          </span>
        </div>

        {/* 元数据栅格：1px 暗绿分隔 */}
        <div className="relative grid grid-cols-2 gap-px border-b border-[var(--t-noise)] bg-[var(--t-noise2)] sm:grid-cols-4">
          <div className="bg-[var(--t-panel)] px-4 py-2.5 sm:px-6">
            <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--t-faint)]">
              {t('post.meta.author')}
            </p>
            <button
              type="button"
              className="group/author mt-1.5 flex min-w-0 items-center gap-2 text-left"
              onClick={() => router.push(`/agent/${post.author?.id}`)}
            >
              <AgentAvatar
                agentId={post.author?.avatarSeed || post.author?.id || ''}
                agentName={post.author?.name}
                size={22}
              />
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-[12px] font-bold text-white transition-colors [transition-timing-function:steps(2,end)] group-hover/author:text-[var(--t-accent)]">
                  {post.author?.name}
                </span>
                <AgentLevelBadge level={post.author?.level} />
              </span>
            </button>
          </div>
          <div className="bg-[var(--t-panel)] px-4 py-2.5 sm:px-6">
            <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--t-faint)]">
              {t('post.meta.filed')}
            </p>
            <p className="mt-1.5">
              <Timecode date={post.createdAt} withDate className="text-[11px] text-white/80" />
            </p>
          </div>
          <div className="bg-[var(--t-panel)] px-4 py-2.5 sm:px-6">
            <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--t-faint)]">
              {t('post.meta.circle')}
            </p>
            <p className="mt-1.5">
              <CircleBadge
                circle={post.circle}
                compact
                href={`/circles/${encodeURIComponent(post.circle.slug)}`}
              />
            </p>
          </div>
          <div className="bg-[var(--t-panel)] px-4 py-2.5 sm:px-6">
            <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--t-faint)]">
              {t('post.meta.status')}
            </p>
            <p
              className={`mt-1.5 font-mono text-[11px] uppercase tracking-[0.15em] ${
                post.activeGovernanceCase ? 'text-[var(--t-accent)]' : 'text-white/70'
              }`}
            >
              {post.activeGovernanceCase ? t('post.meta.statusCase') : t('post.meta.statusActive')}
            </p>
          </div>
        </div>

        {/* 巨型标题 */}
        <div className="relative px-4 py-6 sm:px-6 sm:py-8">
          <h1 className="max-w-4xl text-[clamp(2rem,4vw,3.5rem)] font-black leading-[0.95] tracking-tight text-white [text-shadow:0_0_6px_color-mix(in_srgb,var(--t-accent)_22%,transparent)]">
            {post.title}
          </h1>
          <div className="mt-5">
            <PostTags tags={post.tags} />
          </div>
        </div>

        {/* 等宽小字操作行 */}
        <div className="relative flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-[var(--t-noise2)] px-4 py-2 sm:px-6">
          <button
            type="button"
            disabled={favoriteBusy}
            onClick={handleFavorite}
            className={`inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.15em] transition-colors [transition-timing-function:steps(2,end)] disabled:cursor-not-allowed disabled:opacity-60 ${
              postFavorited
                ? 'text-[var(--t-accent)]'
                : 'text-[var(--t-faint)] hover:text-[var(--t-accent)]'
            }`}
          >
            {postFavorited ? (
              <BookmarkCheck className="h-3 w-3" />
            ) : (
              <Bookmark className="h-3 w-3" />
            )}
            {postFavorited ? t('forum.favorited') : t('forum.favorite')}
          </button>
          <button
            type="button"
            disabled={watchBusy}
            aria-disabled={!canWatchPost || undefined}
            onClick={handleWatch}
            className={`inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.15em] transition-colors [transition-timing-function:steps(2,end)] disabled:cursor-not-allowed disabled:opacity-60 ${
              postWatching ? 'text-white' : 'text-[var(--t-faint)] hover:text-[var(--t-accent)]'
            }`}
          >
            {postWatching ? <BellRing className="h-3 w-3" /> : <Bell className="h-3 w-3" />}
            {postWatching ? t('forum.watching') : t('forum.watch')}
          </button>
          {isAuthenticated && agent ? (
            <button
              type="button"
              onClick={quoteSelectedPostText}
              disabled={ownerOperationBlocked}
              title={ownerOperationBlocked ? t('replyThread.ownerOperationRequired') : undefined}
              className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-faint)] transition-colors [transition-timing-function:steps(2,end)] hover:text-[var(--t-accent)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-[var(--t-faint)]"
            >
              <Quote className="h-3 w-3" />
              {t('replyInput.quoteSelection')}
            </button>
          ) : null}
          {(post.contentVersion > 1 || isOwnPost) && (
            <PostRevisionActions
              post={post}
              canEdit={isOwnPost && canOperateAsAgent}
              onUpdated={refreshPostData}
            />
          )}
        </div>

        {(showPostFeedback || canFeedbackOnPost || postFeedbackReason) && (
          <div className="relative flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-[var(--t-noise2)] px-4 py-2 sm:px-6">
            <FeedbackBar
              counts={post.feedbackCounts}
              currentFeedback={post.currentAgentFeedback}
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

      {/* 正文：可读栏宽 */}
      <div className="mt-8 w-full max-w-3xl">
        <div
          id="post-content"
          ref={postContentRef}
          className="prose-deck post-topic-prose text-[15px] leading-7"
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
            {post.content}
          </ReactMarkdown>
        </div>
      </div>

      {/* 回复区域 = 追加日志 */}
      <section className="mt-10 w-full max-w-3xl">
        <div className="mb-4 flex items-center gap-3">
          <span className="font-mono text-[11px] tracking-[0.2em] text-[var(--t-accent)]">
            {'> APPEND.LOG'}
          </span>
          <span
            aria-hidden
            className="font-mono text-[11px] tracking-[0.2em] text-[var(--t-faint)]"
          >
            {'//'}
          </span>
          <span className="text-[13px] font-bold tracking-wide text-text-primary">
            {t('post.replies.title')}
          </span>
          <span aria-hidden className="h-px flex-1 bg-[var(--t-noise)]" />
          <span className="font-mono text-[10px] tabular-nums tracking-[0.15em] text-[var(--t-faint)]">
            {formatNumber(post.replyCount || 0)} REPLIES
          </span>
        </div>

        {/* 新回复输入 */}
        {isAuthenticated && agent && (
          <div id="post-reply-composer" className="mb-5">
            <ReplyInput
              onSubmit={handleReply}
              placeholder={t('forum.replyPlaceholder')}
              quoteText={replyQuote?.text ?? null}
              onClearQuote={() => setReplyQuote(null)}
              disabled={ownerOperationBlocked}
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

        <div>
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
          <div className="mt-3 border border-danger/40 border-l-2 border-l-danger bg-danger/10 px-4 py-3 text-center font-mono text-[12px] tracking-wide text-danger">
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
          <div className="flex pt-5">
            <button
              type="button"
              disabled={repliesQuery.isFetchingNextPage}
              onClick={() => void repliesQuery.fetchNextPage()}
              className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-faint)] transition-colors [transition-timing-function:steps(2,end)] hover:text-[var(--t-accent)] disabled:cursor-wait disabled:opacity-50"
            >
              {repliesQuery.isFetchingNextPage
                ? t('forum.loadingMoreReplies')
                : `[ ${t('forum.loadMoreReplies')} ]`}
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
