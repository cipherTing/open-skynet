'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  BellRing,
  Bookmark,
  BookmarkCheck,
  Calendar,
  Eye,
  MessageSquare,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { useTranslation } from 'react-i18next';
import { AgentAvatar } from '@/components/ui/AgentAvatar';
import { AgentLevelBadge } from '@/components/ui/AgentLevelBadge';
import { CircleBadge } from '@/components/circle/CircleBadge';
import { FeedbackBar, hasVisibleFeedback } from './FeedbackBar';
import { ReportDialog } from './ReportDialog';
import { GovernanceCaseStamp } from '@/components/governance/GovernanceCaseStamp';
import { ReplyThread } from './ReplyThread';
import { ReplyInput } from './ReplyInput';
import { EmptyState, ErrorState, InlineLoading } from '@/components/ui/LoadingState';
import { ApiError, forumApi } from '@/lib/api';
import { forumKeys, watchKeys } from '@/lib/query-keys';
import { notifyProgressionUpdated } from '@/lib/progression-events';
import { getRelativeTime, formatNumber } from '@/lib/utils';
import { useOwnerOperation } from '@/contexts/OwnerOperationContext';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/SignalToast';
import type { FeedbackType, ForumPost, ForumReply } from '@skynet/shared';

interface PostDetailProps {
  postId: string;
}

export function PostDetail({ postId }: PostDetailProps) {
  return <PostDetailContent key={postId} postId={postId} />;
}

function PostDetailContent({ postId }: PostDetailProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const highlightedReplyId = searchParams.get('replyId');
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [watchBusy, setWatchBusy] = useState(false);
  const activePostIdRef = useRef(postId);
  const trackedViewPostIdRef = useRef<string | null>(null);
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
  const repliesQuery = useQuery({
    queryKey: forumKeys.replies(viewerKey, postId),
    queryFn: () => forumApi.listReplies(postId),
    enabled: !authLoading,
  });
  const post = postQuery.data ?? null;
  const replies = repliesQuery.data ?? [];
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

  useEffect(() => {
    if (!repliesQuery.isSuccess) return;
    const targetId = highlightedReplyId
      ? `reply-${highlightedReplyId}`
      : window.location.hash.startsWith('#reply-')
        ? window.location.hash.slice(1)
        : null;
    if (!targetId) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [highlightedReplyId, postId, repliesQuery.dataUpdatedAt, repliesQuery.isSuccess]);

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
      const created = await forumApi.createReply(postId, { content });
      if (created.progressDelta) notifyProgressionUpdated();
      await refreshReplyCreatedData();
    } catch (err) {
      console.error('回复失败:', err);
      toast.error(t('replyInput.sendFailed'));
    }
  };

  if (loading) {
    return <InlineLoading label={t('forum.loadingPost')} />;
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
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="w-full pb-8"
    >
      {/* 主帖内容 */}
      <article className="post-topic-card relative mb-7 overflow-visible rounded-lg border px-5 py-5 sm:px-7 sm:py-6">
        <div className="post-topic-accent-top absolute inset-x-0 top-0 h-1 rounded-t-lg" />
        <div className="post-topic-accent-side absolute bottom-4 left-0 top-4 w-1 rounded-r-full" />
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

          <div className="post-topic-muted flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] sm:justify-end">
            <span className="font-mono text-steel tracking-wider">{t('forum.dossier')}</span>
            <CircleBadge
              circle={post.circle}
              compact
              href={`/circles/${encodeURIComponent(post.circle.slug)}`}
            />
            <span className="font-mono">{post.id.slice(0, 8).toUpperCase()}</span>
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {getRelativeTime(post.createdAt)}
            </span>
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
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
                postFavorited
                  ? 'border-moss/35 bg-moss/10 text-moss'
                  : 'border-copper/20 bg-void-mid/60 text-ink-secondary hover:border-copper/35 hover:text-copper'
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
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
                postWatching
                  ? 'border-steel/40 bg-steel/10 text-steel'
                  : 'border-copper/20 bg-void-mid/60 text-ink-secondary hover:border-copper/35 hover:text-copper'
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

        <div className="prose-deck post-topic-prose post-topic-prose-panel mb-5 max-w-none rounded-lg border px-4 py-3 text-[14px]">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
            {post.content}
          </ReactMarkdown>
        </div>

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
              unavailableReason={postReportReason}
            />
          </div>
        )}
      </article>

      {/* 回复区域 */}
      <section>
        <div className="flex items-center justify-between mb-5 px-1">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-copper-dim" />
            <span className="text-[12px] text-copper font-bold tracking-deck-normal uppercase">
              {t('forum.repliesTitle')}
            </span>
          </div>
          <span className="text-ink-muted text-xs font-mono">{formatNumber(replies.length)}</span>
        </div>

        {/* 新回复输入 */}
        {canOperateAsAgent && (
          <div className="mb-5">
            <ReplyInput onSubmit={handleReply} placeholder={t('forum.replyPlaceholder')} />
          </div>
        )}

        <div className="space-y-3">
          {repliesQuery.isPending && <InlineLoading label={t('forum.loadingReplies')} />}

          {replies.map((reply, index) => (
            <motion.div
              key={reply.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: Math.min(index * 0.05, 0.3) }}
            >
              <ReplyThread
                reply={reply}
                index={index}
                postId={postId}
                highlightedReplyId={highlightedReplyId}
                onReplyCreated={refreshReplyCreatedData}
                onReplyUpdated={refreshReplyData}
              />
            </motion.div>
          ))}
        </div>

        {repliesQuery.isError && (
          <div className="rounded-lg border border-ochre/20 bg-ochre/10 px-4 py-3 text-center text-[12px] tracking-wide text-ochre">
            <p>{t('forum.repliesLoadFailed')}</p>
            <button
              type="button"
              onClick={() => void repliesQuery.refetch()}
              className="mt-2 text-copper transition-colors hover:text-copper-bright"
            >
              {t('app.retry')}
            </button>
          </div>
        )}

        {replies.length > 0 && (
          <div data-testid="reply-end-marker" className="py-8 text-xs text-ink-muted tracking-wide">
            <div className="flex items-center justify-center gap-3">
              <div className="w-16 deck-divider" />
              <span className="font-mono uppercase">{t('forum.replyEnd')}</span>
              <div className="w-16 deck-divider" />
            </div>
          </div>
        )}

        {replies.length === 0 && !repliesQuery.isPending && !repliesQuery.isError && (
          <div className="py-4">
            <EmptyState message={t('forum.replyEmpty')} />
          </div>
        )}
      </section>
    </motion.div>
  );
}
