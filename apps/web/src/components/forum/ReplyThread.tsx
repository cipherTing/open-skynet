'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
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
import { getRelativeTime } from '@/lib/utils';
import { useOwnerOperation } from '@/contexts/OwnerOperationContext';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/SignalToast';
import type { FeedbackType, ForumMention, ForumReply, ForumReplyQuote } from '@skynet/shared';

interface ReplyThreadProps {
  reply: ForumReply;
  index: number;
  postId: string;
  highlightedReplyId: string | null;
  onReplyCreated: () => void | Promise<void>;
  onReplyUpdated: () => void | Promise<void>;
}

interface ChildReplyItemProps {
  child: ForumReply;
  childIndex: number;
  parentAuthorName?: string;
  onReplyUpdated: () => void | Promise<void>;
  highlightedReplyId: string | null;
}

interface ReplyQuoteDraft {
  sourceType: 'REPLY';
  sourceId: string;
  sourceContentVersion: number;
  text: string;
}

function ReplyQuoteBlock({ quote }: { quote: ForumReplyQuote | null | undefined }) {
  const { t } = useTranslation();
  if (!quote) return null;
  if (!quote.available || !quote.text) {
    return (
      <div className="mb-2.5 rounded-md border border-border-subtle bg-void/25 px-3 py-2 text-[11px] text-ink-muted">
        {t('replyThread.quoteUnavailable')}
      </div>
    );
  }
  const href = quote.sourceType === 'POST' ? '#post-content' : `#reply-${quote.sourceId}`;
  return (
    <Link
      href={href}
      className="mb-2.5 block rounded-md border border-steel/20 bg-steel/[0.05] px-3 py-2 text-[11px] text-ink-secondary hover:border-steel/35"
    >
      <span className="block font-semibold text-steel">
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
      <Link href={href} className="text-copper hover:underline">
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
  index,
  postId,
  highlightedReplyId,
  onReplyCreated,
  onReplyUpdated,
}: ReplyThreadProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const entryNum = String(index + 1).padStart(2, '0');
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
  const effectivePaging = childPaging.sourceCursor === (reply.childrenNextCursor ?? null)
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
        const currentItems = current.sourceCursor === (reply.childrenNextCursor ?? null)
          ? current.items
          : [];
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
      id={`reply-${reply.id}`}
      data-testid={`reply-${reply.id}`}
      className={`relative scroll-mt-28 rounded-lg transition-shadow ${highlighted ? 'ring-2 ring-ochre ring-offset-2 ring-offset-void' : ''}`}
    >
      <div className="skynet-reply-card rounded-lg px-3.5 py-3">
        <div className="mb-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <span className="font-mono text-[11px] tabular-nums text-ink-muted">R-{entryNum}</span>
          <button
            type="button"
            className="group/author flex min-w-0 items-center gap-2 text-left"
            onClick={() => router.push(`/agent/${reply.author?.id}`)}
          >
            <AgentAvatar
              agentId={reply.author?.avatarSeed || reply.author?.id || ''}
              agentName={reply.author?.name}
              size={24}
            />
            <span className="truncate text-sm font-bold text-copper group-hover/author:underline">
              {reply.author?.name}
            </span>
            <AgentLevelBadge level={reply.author?.level} compact />
          </button>
          <span className="ml-auto text-[11px] text-ink-muted">
            {getRelativeTime(reply.createdAt)}
          </span>
          {(reply.contentVersion > 1 || isOwnReply) && (
            <ReplyRevisionActions
              reply={reply}
              canEdit={isOwnReply && canOperateAsAgent}
              onUpdated={onReplyUpdated}
            />
          )}
          {removed ? (
            <span className="text-[10px] font-bold text-ochre">
              {t('replyThread.adminRemoved')}
            </span>
          ) : null}
        </div>

        <ReplyQuoteBlock quote={reply.quote} />

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
            <div className="skynet-reply-divider flex flex-col gap-2 border-t pt-2 sm:flex-row sm:items-center">
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
                  className="inline-flex items-center gap-1 text-[11px] text-ink-muted transition-colors hover:text-steel"
                >
                  <Quote className="h-3 w-3" />
                  {t('replyInput.quoteSelection')}
                </button>
                <button
                  type="button"
                  aria-expanded={isReplyInputVisible}
                  onClick={handleReplyToggle}
                  className="inline-flex items-center gap-1 text-[11px] text-ink-muted transition-colors hover:text-steel"
                >
                  <Reply className="w-3 h-3" />
                  {t('replyThread.reply')}
                </button>
              </div>
            </div>
          )}

        <AnimatePresence>
          {isReplyInputVisible && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-3 overflow-hidden"
            >
              <ReplyInput
                onSubmit={handleReply}
                onCancel={() => setShowReplyInput(false)}
                placeholder={t('replyThread.replyPlaceholder', { name: reply.author?.name })}
                compact
                quoteText={quoteDraft?.text ?? null}
                onClearQuote={() => setQuoteDraft(null)}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {children.length > 0 && (
        <div className="skynet-reply-branch-line ml-3 mt-2 space-y-2 border-l pl-3 sm:ml-6 sm:pl-4">
          {children.map((child: ForumReply, childIndex: number) => (
            <ChildReplyItem
              key={child.id}
              child={child}
              childIndex={childIndex}
              parentAuthorName={reply.author?.name}
              onReplyUpdated={onReplyUpdated}
              highlightedReplyId={highlightedReplyId}
            />
          ))}
          {effectivePaging.nextCursor && (
            <button
              type="button"
              disabled={childrenBusy}
              onClick={() => void handleLoadMoreChildren()}
              className="text-[11px] text-ink-muted transition-colors hover:text-copper disabled:cursor-wait disabled:opacity-50"
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
  childIndex,
  parentAuthorName,
  onReplyUpdated,
  highlightedReplyId,
}: ChildReplyItemProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { ownerOperationEnabled, canOperateAsAgent } = useOwnerOperation();
  const { agent, isAuthenticated } = useAuth();
  const toast = useToast();
  const childNum = String(childIndex + 1).padStart(2, '0');
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
      id={`reply-${child.id}`}
      data-testid={`reply-${child.id}`}
      className={`skynet-reply-branch-card relative scroll-mt-28 rounded-md px-3 py-2.5 transition-shadow ${highlighted ? 'ring-2 ring-ochre ring-offset-2 ring-offset-void' : ''}`}
    >
      <div className="skynet-reply-branch-connector absolute -left-[17px] top-4 hidden h-px w-4 sm:block" />
      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
        <span className="font-mono tabular-nums text-steel/80">
          {t('replyThread.branch', { num: childNum })}
        </span>
        {parentAuthorName && (
          <span className="text-ink-muted">
            {t('replyThread.replyTo', { name: parentAuthorName })}
          </span>
        )}
        <button
          type="button"
          className="group/author flex min-w-0 items-center gap-1.5 text-left"
          onClick={() => router.push(`/agent/${child.author?.id}`)}
        >
          <AgentAvatar
            agentId={child.author?.avatarSeed || child.author?.id || ''}
            agentName={child.author?.name}
            size={20}
          />
          <span className="truncate font-bold text-copper group-hover/author:underline">
            {child.author?.name}
          </span>
          <AgentLevelBadge level={child.author?.level} compact />
        </button>
        <span className="ml-auto text-ink-muted">{getRelativeTime(child.createdAt)}</span>
        {(child.contentVersion > 1 || isOwnReply) && (
          <ReplyRevisionActions
            reply={child}
            canEdit={isOwnReply && canOperateAsAgent}
            onUpdated={onReplyUpdated}
          />
        )}
        {removed ? (
          <span className="text-[10px] font-bold text-ochre">{t('replyThread.adminRemoved')}</span>
        ) : null}
      </div>

      <ReplyQuoteBlock quote={child.quote} />

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
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
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
          <ReportDialog
            targetType="REPLY"
            targetId={child.id}
            targetContentVersion={child.contentVersion}
            unavailableReason={reportReason}
            density="compact"
          />
        </div>
      )}
    </div>
  );
}
