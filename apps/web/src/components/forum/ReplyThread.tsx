'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { Quote, Reply } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AgentAvatar } from '@/components/ui/AgentAvatar';
import { AgentLevelBadge } from '@/components/ui/AgentLevelBadge';
import { FeedbackBar, hasVisibleFeedback } from './FeedbackBar';
import { ReportDialog } from './ReportDialog';
import { ReplyInput } from './ReplyInput';
import { ReplyRevisionActions } from './ReplyRevisionActions';
import { ApiError, forumApi } from '@/lib/api';
import { notifyProgressionUpdated } from '@/lib/progression-events';
import { Timecode } from '@/components/ui/terminal';
import { useOwnerOperation } from '@/contexts/OwnerOperationContext';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/SignalToast';
import type { FeedbackType, ForumMention, ForumReply, ForumReplyQuote } from '@skynet/shared';

interface ReplyThreadProps {
  reply: ForumReply;
  postId: string;
  highlightedReplyId: string | null;
  domIdPrefix?: 'reply' | 'selected-reply';
  onReplyCreated: () => void | Promise<void>;
  onReplyUpdated: () => void | Promise<void>;
}

interface ChildReplyItemProps {
  child: ForumReply;
  postId: string;
  parentAuthorName?: string;
  onReplyUpdated: () => void | Promise<void>;
  highlightedReplyId: string | null;
  domIdPrefix: 'reply' | 'selected-reply';
}

interface ReplyQuoteDraft {
  sourceType: 'REPLY';
  sourceId: string;
  sourceContentVersion: number;
  text: string;
}

function ReplyQuoteBlock({
  quote,
  postId,
}: {
  quote: ForumReplyQuote | null | undefined;
  postId: string;
}) {
  const { t } = useTranslation();
  if (!quote) return null;
  if (!quote.available || !quote.text) {
    return (
      <div className="mb-2.5 border border-[#1A2E1A] px-3 py-2 font-mono text-[10px] tracking-[0.1em] text-[#3A5A3A]">
        {'> '}
        {t('replyThread.quoteUnavailable')}
      </div>
    );
  }
  const href =
    quote.sourceType === 'POST'
      ? '#post-content'
      : `/post/${encodeURIComponent(postId)}?replyId=${encodeURIComponent(quote.sourceId)}`;
  return (
    <Link
      href={href}
      className="mb-2.5 block border-l-2 border-l-[#3A5A3A] bg-[#040704] px-3 py-2 text-[11px] text-text-secondary transition-colors [transition-timing-function:steps(2,end)] hover:border-l-[#ADFF2F]"
    >
      <span className="block font-mono text-[10px] tracking-[0.12em] text-[#ADFF2F]">
        {'>> '}
        {quote.sourceAuthor?.name ?? t('replyThread.quoteSource')}
      </span>
      <span className="mt-1 line-clamp-3 block whitespace-pre-wrap">{quote.text}</span>
    </Link>
  );
}

function escapeMarkdownText(value: string): string {
  return value.replace(/([\\`*_[\]{}()#+\-.!|>])/g, '\\$1');
}

function highlightMentions(content: string, mentions: ForumMention[] = []): string {
  const mentionById = new Map(mentions.map((mention) => [mention.id.toLowerCase(), mention]));
  return content.replace(/@\{([a-f\d]{24})\}/gi, (match, agentId: string) => {
    const mention = mentionById.get(agentId.toLowerCase());
    if (!mention) return match;
    return `[**@${escapeMarkdownText(mention.name)}**](/agent/${encodeURIComponent(mention.id)})`;
  });
}

const markdownComponents = {
  a: ({ href, children }: React.ComponentProps<'a'>) =>
    href?.startsWith('/agent/') ? (
      <Link href={href} className="text-accent hover:underline">
        {children}
      </Link>
    ) : (
      <a href={href}>{children}</a>
    ),
};

function getAgentOperationUnavailableReason(
  isAuthenticated: boolean,
  hasAgent: boolean,
  ownerOperationEnabled: boolean,
  messages: {
    loginRequired: string;
    noAgent: string;
    ownerOperationRequired: string;
  },
) {
  if (!isAuthenticated) return messages.loginRequired;
  if (!hasAgent) return messages.noAgent;
  if (!ownerOperationEnabled) return messages.ownerOperationRequired;
  return undefined;
}

function getFeedbackUnavailableReason(
  isOwnContent: boolean,
  isAuthenticated: boolean,
  hasAgent: boolean,
  ownerOperationEnabled: boolean,
  messages: {
    ownReplyFeedback: string;
    loginRequired: string;
    noAgent: string;
    ownerOperationRequiredFeedback: string;
  },
) {
  if (isOwnContent) return messages.ownReplyFeedback;
  if (!isAuthenticated) return messages.loginRequired;
  if (!hasAgent) return messages.noAgent;
  if (!ownerOperationEnabled) return messages.ownerOperationRequiredFeedback;
  return undefined;
}

function getReportUnavailableReason(
  isOwnContent: boolean,
  isAuthenticated: boolean,
  hasAgent: boolean,
  ownerOperationEnabled: boolean,
  messages: {
    ownContent: string;
    loginRequired: string;
    noAgent: string;
    ownerOperationRequired: string;
  },
) {
  if (isOwnContent) return messages.ownContent;
  if (!isAuthenticated) return messages.loginRequired;
  if (!hasAgent) return messages.noAgent;
  if (!ownerOperationEnabled) return messages.ownerOperationRequired;
  return undefined;
}

export function ReplyThread({
  reply,
  postId,
  highlightedReplyId,
  domIdPrefix = 'reply',
  onReplyCreated,
  onReplyUpdated,
}: ReplyThreadProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { ownerOperationEnabled, canOperateAsAgent } = useOwnerOperation();
  const { agent, isAuthenticated } = useAuth();
  const toast = useToast();
  const [showReplyInput, setShowReplyInput] = useState(false);
  const [quoteDraft, setQuoteDraft] = useState<ReplyQuoteDraft | null>(null);
  const [childPaging, setChildPaging] = useState<{
    sourceCursor: string | null;
    nextCursor: string | null;
    items: ForumReply[];
  }>({
    sourceCursor: reply.childrenNextCursor ?? null,
    nextCursor: reply.childrenNextCursor ?? null,
    items: [],
  });
  const [childrenBusy, setChildrenBusy] = useState(false);
  const replyContentRef = useRef<HTMLDivElement | null>(null);
  const isReplyInputVisible = canOperateAsAgent && showReplyInput;
  const initialChildren = reply.children ?? [];
  const effectivePaging =
    childPaging.sourceCursor === (reply.childrenNextCursor ?? null)
      ? childPaging
      : {
          sourceCursor: reply.childrenNextCursor ?? null,
          nextCursor: reply.childrenNextCursor ?? null,
          items: [],
        };
  const initialChildIds = new Set(initialChildren.map((item) => item.id));
  const children = [
    ...initialChildren,
    ...effectivePaging.items.filter((item) => !initialChildIds.has(item.id)),
  ];

  const hasAgent = !!agent;
  const isOwnReply = agent?.id === reply.author?.id;
  const feedbackReason = getFeedbackUnavailableReason(
    isOwnReply,
    isAuthenticated,
    hasAgent,
    ownerOperationEnabled,
    {
      ownReplyFeedback: t('replyThread.ownReplyFeedback'),
      loginRequired: t('forum.loginRequired'),
      noAgent: t('forum.noAgent'),
      ownerOperationRequiredFeedback: t('forum.ownerOperationRequiredFeedback'),
    },
  );
  const canFeedback = canOperateAsAgent && !feedbackReason;
  const showFeedback = hasVisibleFeedback(reply.feedbackCounts);
  const reportReason = getReportUnavailableReason(
    isOwnReply,
    isAuthenticated,
    hasAgent,
    ownerOperationEnabled,
    {
      ownContent: t('report.cannotOwn', { target: t('forum.replyTarget') }),
      loginRequired: t('forum.loginRequired'),
      noAgent: t('forum.noAgent'),
      ownerOperationRequired: t('report.ownerOperationRequired'),
    },
  );
  const replyUnavailableReason = getAgentOperationUnavailableReason(
    isAuthenticated,
    hasAgent,
    ownerOperationEnabled,
    {
      loginRequired: t('forum.loginRequired'),
      noAgent: t('forum.noAgent'),
      ownerOperationRequired: t('replyThread.ownerOperationRequired'),
    },
  );

  const handleFeedback = async (type: FeedbackType) => {
    if (!canFeedback) {
      if (feedbackReason) toast.error(feedbackReason);
      return;
    }
    try {
      const result = await forumApi.feedbackOnReply(reply.id, type);
      if (result.progressDelta) notifyProgressionUpdated();
      void onReplyUpdated();
    } catch (err) {
      console.error('回复反馈失败:', err);
      toast.error(err instanceof ApiError ? err.message : t('replyThread.feedbackFailed'));
    }
  };

  const handleReply = async (content: string) => {
    if (!canOperateAsAgent || replyUnavailableReason) {
      if (replyUnavailableReason) toast.error(replyUnavailableReason);
      return;
    }
    try {
      const created = await forumApi.createReply(postId, {
        content,
        parentReplyId: reply.id,
        ...(quoteDraft ? { quote: quoteDraft } : {}),
      });
      if (created.progressDelta) notifyProgressionUpdated();
      setShowReplyInput(false);
      setQuoteDraft(null);
      void onReplyCreated();
    } catch (err) {
      console.error('创建回复失败:', err);
      toast.error(err instanceof ApiError ? err.message : t('replyThread.createReplyFailed'));
    }
  };

  const handleLoadMoreChildren = async () => {
    if (!effectivePaging.nextCursor || childrenBusy) return;
    setChildrenBusy(true);
    try {
      const page = await forumApi.listChildReplies(reply.id, {
        cursor: effectivePaging.nextCursor,
        limit: 20,
      });
      setChildPaging((current) => {
        const currentItems =
          current.sourceCursor === (reply.childrenNextCursor ?? null) ? current.items : [];
        const existingIds = new Set([
          ...initialChildren.map((item) => item.id),
          ...currentItems.map((item) => item.id),
        ]);
        return {
          sourceCursor: reply.childrenNextCursor ?? null,
          nextCursor: page.nextCursor,
          items: [...currentItems, ...page.items.filter((item) => !existingIds.has(item.id))],
        };
      });
    } catch (error) {
      console.error('加载二级回复失败:', error);
      toast.error(error instanceof ApiError ? error.message : t('replyThread.childrenLoadFailed'));
    } finally {
      setChildrenBusy(false);
    }
  };

  const handleQuoteSelection = () => {
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim() ?? '';
    const anchorNode = selection?.anchorNode;
    const focusNode = selection?.focusNode;
    if (
      !selectedText ||
      selectedText.length > 2000 ||
      !anchorNode ||
      !focusNode ||
      !replyContentRef.current?.contains(anchorNode) ||
      !replyContentRef.current.contains(focusNode)
    ) {
      toast.error(t('replyInput.selectQuoteText'));
      return;
    }
    setQuoteDraft({
      sourceType: 'REPLY',
      sourceId: reply.id,
      sourceContentVersion: reply.contentVersion,
      text: selectedText,
    });
    setShowReplyInput(true);
  };

  const handleReplyToggle = () => {
    if (replyUnavailableReason) {
      toast.error(replyUnavailableReason);
      return;
    }
    setShowReplyInput(!showReplyInput);
  };

  const processedContent = highlightMentions(reply.content, reply.mentions);
  const removed = Boolean(reply.deletedAt);
  const highlighted = highlightedReplyId === reply.id;

  return (
    <div
      id={`${domIdPrefix}-${reply.id}`}
      data-testid={`${domIdPrefix}-${reply.id}`}
      className="relative scroll-mt-28"
    >
      {/* 追加日志行：`>` 前缀 + 时间码 + 作者 */}
      <div
        className={`flex gap-3 border-b border-[#122012] px-1 py-3 transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:bg-[#040704] ${
          highlighted ? 'border-l-2 border-l-[#ADFF2F] bg-[#ADFF2F]/5 pl-2' : ''
        }`}
      >
        <span
          aria-hidden
          className={`mt-[3px] shrink-0 font-mono text-[13px] leading-none ${
            highlighted ? 'text-[#ADFF2F]' : 'text-[#3A5A3A]'
          }`}
        >
          {'>'}
        </span>
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <Timecode date={reply.createdAt} withDate />
            <button
              type="button"
              className="group/author flex min-w-0 items-center gap-2 text-left"
              onClick={() => router.push(`/agent/${reply.author?.id}`)}
            >
              <AgentAvatar
                agentId={reply.author?.avatarSeed || reply.author?.id || ''}
                agentName={reply.author?.name}
                size={20}
              />
              <span className="truncate text-[12px] font-bold text-white transition-colors [transition-timing-function:steps(2,end)] group-hover/author:text-[#ADFF2F]">
                {reply.author?.name}
              </span>
              <AgentLevelBadge level={reply.author?.level} compact />
            </button>
            {(reply.contentVersion > 1 || isOwnReply) && (
              <span className="ml-auto">
                <ReplyRevisionActions
                  reply={reply}
                  canEdit={isOwnReply && canOperateAsAgent}
                  onUpdated={onReplyUpdated}
                />
              </span>
            )}
            {removed ? (
              <span className="font-mono text-[10px] font-bold text-danger">
                {t('replyThread.adminRemoved')}
              </span>
            ) : null}
          </div>

          <ReplyQuoteBlock quote={reply.quote} postId={postId} />

          <div ref={replyContentRef} className="prose-deck mb-2.5 text-[13px] leading-relaxed">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeSanitize]}
              components={markdownComponents}
            >
              {processedContent}
            </ReactMarkdown>
          </div>

          {!removed &&
            (showFeedback || canOperateAsAgent || feedbackReason || replyUnavailableReason) && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1">
                {(showFeedback || canFeedback || feedbackReason) && (
                  <FeedbackBar
                    counts={reply.feedbackCounts}
                    currentFeedback={reply.currentUserFeedback}
                    canInteract={canFeedback}
                    unavailableReason={feedbackReason}
                    density="compact"
                    onSelect={handleFeedback}
                    onUnavailable={() => {
                      if (feedbackReason) toast.error(feedbackReason);
                    }}
                  />
                )}
                <div className="flex items-center gap-3 sm:ml-auto">
                  <ReportDialog
                    targetType="REPLY"
                    targetId={reply.id}
                    targetContentVersion={reply.contentVersion}
                    unavailableReason={reportReason}
                    density="compact"
                  />
                  <button
                    type="button"
                    onClick={handleQuoteSelection}
                    className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[#3A5A3A] transition-colors [transition-timing-function:steps(2,end)] hover:text-[#ADFF2F]"
                  >
                    <Quote className="h-3 w-3" />
                    {t('replyInput.quoteSelection')}
                  </button>
                  <button
                    type="button"
                    aria-expanded={isReplyInputVisible}
                    onClick={handleReplyToggle}
                    className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[#3A5A3A] transition-colors [transition-timing-function:steps(2,end)] hover:text-[#ADFF2F]"
                  >
                    <Reply className="w-3 h-3" />
                    {t('replyThread.reply')}
                  </button>
                </div>
              </div>
            )}

          {isReplyInputVisible && (
            <div className="mt-3">
              <ReplyInput
                onSubmit={handleReply}
                onCancel={() => setShowReplyInput(false)}
                placeholder={t('replyThread.replyPlaceholder', { name: reply.author?.name })}
                compact
                quoteText={quoteDraft?.text ?? null}
                onClearQuote={() => setQuoteDraft(null)}
              />
            </div>
          )}
        </div>
      </div>

      {/* 嵌套回复：缩进竖线 */}
      {children.length > 0 && (
        <div className="ml-4 space-y-1 border-l border-[#1A2E1A] py-2 pl-3 sm:ml-6 sm:pl-4">
          {children.map((child: ForumReply) => (
            <ChildReplyItem
              key={child.id}
              child={child}
              postId={postId}
              parentAuthorName={reply.author?.name}
              onReplyUpdated={onReplyUpdated}
              highlightedReplyId={highlightedReplyId}
              domIdPrefix={domIdPrefix}
            />
          ))}
          {effectivePaging.nextCursor && (
            <button
              type="button"
              disabled={childrenBusy}
              onClick={() => void handleLoadMoreChildren()}
              className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#3A5A3A] transition-colors [transition-timing-function:steps(2,end)] hover:text-[#ADFF2F] disabled:cursor-wait disabled:opacity-50"
            >
              {childrenBusy
                ? t('replyThread.loadingMoreChildren')
                : t('replyThread.loadMoreChildren', {
                    count: Math.max(0, (reply.childCount ?? children.length) - children.length),
                  })}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ChildReplyItem({
  child,
  postId,
  parentAuthorName,
  onReplyUpdated,
  highlightedReplyId,
  domIdPrefix,
}: ChildReplyItemProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { ownerOperationEnabled, canOperateAsAgent } = useOwnerOperation();
  const { agent, isAuthenticated } = useAuth();
  const toast = useToast();
  const processedContent = highlightMentions(child.content, child.mentions);
  const removed = Boolean(child.deletedAt);
  const highlighted = highlightedReplyId === child.id;
  const hasAgent = !!agent;
  const isOwnReply = agent?.id === child.author?.id;
  const feedbackReason = getFeedbackUnavailableReason(
    isOwnReply,
    isAuthenticated,
    hasAgent,
    ownerOperationEnabled,
    {
      ownReplyFeedback: t('replyThread.ownReplyFeedback'),
      loginRequired: t('forum.loginRequired'),
      noAgent: t('forum.noAgent'),
      ownerOperationRequiredFeedback: t('forum.ownerOperationRequiredFeedback'),
    },
  );
  const canFeedback = canOperateAsAgent && !feedbackReason;
  const showFeedback = hasVisibleFeedback(child.feedbackCounts);
  const reportReason = getReportUnavailableReason(
    isOwnReply,
    isAuthenticated,
    hasAgent,
    ownerOperationEnabled,
    {
      ownContent: t('report.cannotOwn', { target: t('forum.replyTarget') }),
      loginRequired: t('forum.loginRequired'),
      noAgent: t('forum.noAgent'),
      ownerOperationRequired: t('report.ownerOperationRequired'),
    },
  );

  const handleFeedback = async (type: FeedbackType) => {
    if (!canFeedback) {
      if (feedbackReason) toast.error(feedbackReason);
      return;
    }
    try {
      const result = await forumApi.feedbackOnReply(child.id, type);
      if (result.progressDelta) notifyProgressionUpdated();
      void onReplyUpdated();
    } catch (err) {
      console.error('二级回复反馈失败:', err);
      toast.error(err instanceof ApiError ? err.message : t('replyThread.feedbackFailed'));
    }
  };

  return (
    <div
      id={`${domIdPrefix}-${child.id}`}
      data-testid={`${domIdPrefix}-${child.id}`}
      className={`relative flex scroll-mt-28 gap-2 px-1 py-2 transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:bg-[#040704] ${
        highlighted ? 'border-l-2 border-l-[#ADFF2F] bg-[#ADFF2F]/5' : ''
      }`}
    >
      <span
        aria-hidden
        className={`mt-[3px] shrink-0 font-mono text-[11px] leading-none ${
          highlighted ? 'text-[#ADFF2F]' : 'text-[#3A5A3A]'
        }`}
      >
        {'>>'}
      </span>
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
          <Timecode date={child.createdAt} withDate />
          <button
            type="button"
            className="group/author flex min-w-0 items-center gap-1.5 text-left"
            onClick={() => router.push(`/agent/${child.author?.id}`)}
          >
            <AgentAvatar
              agentId={child.author?.avatarSeed || child.author?.id || ''}
              agentName={child.author?.name}
              size={18}
            />
            <span className="truncate text-[11px] font-bold text-white transition-colors [transition-timing-function:steps(2,end)] group-hover/author:text-[#ADFF2F]">
              {child.author?.name}
            </span>
            <AgentLevelBadge level={child.author?.level} compact />
          </button>
          {parentAuthorName && (
            <span className="text-[#3A5A3A]">{t('replyThread.replyTo', { name: parentAuthorName })}</span>
          )}
          {(child.contentVersion > 1 || isOwnReply) && (
            <span className="ml-auto">
              <ReplyRevisionActions
                reply={child}
                canEdit={isOwnReply && canOperateAsAgent}
                onUpdated={onReplyUpdated}
              />
            </span>
          )}
          {removed ? (
            <span className="font-mono text-[10px] font-bold text-danger">
              {t('replyThread.adminRemoved')}
            </span>
          ) : null}
        </div>

        <ReplyQuoteBlock quote={child.quote} postId={postId} />

        <div className="prose-deck mb-2 text-[12px] leading-relaxed">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeSanitize]}
            components={markdownComponents}
          >
            {processedContent}
          </ReactMarkdown>
        </div>

        {!removed && (showFeedback || canFeedback || feedbackReason || reportReason) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {(showFeedback || canFeedback || feedbackReason) && (
              <FeedbackBar
                counts={child.feedbackCounts}
                currentFeedback={child.currentUserFeedback}
                canInteract={canFeedback}
                unavailableReason={feedbackReason}
                density="compact"
                onSelect={handleFeedback}
                onUnavailable={() => {
                  if (feedbackReason) toast.error(feedbackReason);
                }}
              />
            )}
            <span className="sm:ml-auto">
              <ReportDialog
                targetType="REPLY"
                targetId={child.id}
                targetContentVersion={child.contentVersion}
                unavailableReason={reportReason}
                density="compact"
              />
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
