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
import { usePageScrollViewport } from '@/components/layout/PageScrollViewport';
import { ApiError, forumApi } from '@/lib/api';
import { notifyProgressionUpdated } from '@/lib/progression-events';
import { Timecode } from '@/components/ui/terminal';
import { Virtuoso } from 'react-virtuoso';
import { useOwnerOperation } from '@/contexts/OwnerOperationContext';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/SignalToast';
import { isForumDeletedReply } from '@skynet/shared';
import type {
  FeedbackType,
  ForumDeletedReply,
  ForumMention,
  ForumReply,
  ForumReplyItem,
  ForumReplyQuote,
} from '@skynet/shared';

const CHILD_REPLY_ESTIMATED_HEIGHT = 164;
const CHILD_REPLY_VIEWPORT_EXTENSION = { top: 0, bottom: 900 } as const;

interface ReplyThreadProps {
  reply: ForumReply;
  postId: string;
  highlightedReplyId: string | null;
  domIdPrefix?: 'reply' | 'selected-reply';
  onReplyCreated: () => void | Promise<void>;
  onReplyUpdated: () => void | Promise<void>;
}

interface DeletedReplyPlaceholderProps {
  reply: ForumDeletedReply;
  highlightedReplyId?: string | null;
  domIdPrefix?: string;
}

export function DeletedReplyPlaceholder({
  reply,
  highlightedReplyId,
  domIdPrefix = 'reply',
}: DeletedReplyPlaceholderProps) {
  const { t } = useTranslation();
  const highlighted = highlightedReplyId === reply.id;

  return (
    <div
      id={`${domIdPrefix}-${reply.id}`}
      data-testid={`${domIdPrefix}-${reply.id}`}
      className={`relative border-b border-[var(--t-noise2)] px-1 py-4 font-mono text-[12px] text-[var(--t-faint)] ${
        highlighted ? 'border-l-2 border-l-[var(--t-accent)] bg-accent/5 pl-2 text-accent' : ''
      }`}
    >
      <span aria-hidden className="mr-3 text-[var(--t-noise)]">
        {'>'}
      </span>
      <span>{t('replyThread.deletedPlaceholder')}</span>
    </div>
  );
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

interface RevisionBoundReplyQuote {
  ownerOperationRevision: number;
  draft: ReplyQuoteDraft;
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
      <div className="mb-2.5 border border-[var(--t-noise)] px-3 py-2 font-mono text-[10px] tracking-[0.1em] text-[var(--t-faint)]">
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
      className="mb-2.5 block border-l-2 border-l-[var(--t-faint)] bg-[var(--t-panel)] px-3 py-2 text-[11px] text-text-secondary transition-colors [transition-timing-function:steps(2,end)] hover:border-l-[var(--t-accent)]"
    >
      <span className="block font-mono text-[10px] tracking-[0.12em] text-[var(--t-accent)]">
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
  const { ownerOperationEnabled, canOperateAsAgent, ownerOperationRevision } = useOwnerOperation();
  const { agent, isAuthenticated } = useAuth();
  const toast = useToast();
  const scrollElement = usePageScrollViewport();
  const [replyInputRevision, setReplyInputRevision] = useState<number | null>(null);
  const [quoteDraft, setQuoteDraft] = useState<RevisionBoundReplyQuote | null>(null);
  const [childPaging, setChildPaging] = useState<{
    sourceCursor: string | null;
    nextCursor: string | null;
    items: ForumReplyItem[];
  }>({
    sourceCursor: reply.childrenNextCursor ?? null,
    nextCursor: reply.childrenNextCursor ?? null,
    items: [],
  });
  const [childrenBusy, setChildrenBusy] = useState(false);
  const replyContentRef = useRef<HTMLDivElement | null>(null);
  const isReplyInputVisible = canOperateAsAgent && replyInputRevision === ownerOperationRevision;
  const activeQuoteDraft =
    canOperateAsAgent && quoteDraft?.ownerOperationRevision === ownerOperationRevision
      ? quoteDraft.draft
      : null;

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
  const children: ForumReply[] = [
    ...initialChildren,
    ...effectivePaging.items.filter(
      (item): item is ForumReply =>
        !isForumDeletedReply(item) && !initialChildIds.has(item.id),
    ),
  ];
  const shouldRenderChildren = children.length > 0 || Boolean(effectivePaging.nextCursor);

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
        ...(activeQuoteDraft ? { quote: activeQuoteDraft } : {}),
      });
      if (created.progressDelta) notifyProgressionUpdated();
      setReplyInputRevision(null);
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
      ownerOperationRevision,
      draft: {
        sourceType: 'REPLY',
        sourceId: reply.id,
        sourceContentVersion: reply.contentVersion,
        text: selectedText,
      },
    });
    setReplyInputRevision(ownerOperationRevision);
  };

  const handleReplyToggle = () => {
    if (replyUnavailableReason) {
      toast.error(replyUnavailableReason);
      return;
    }
    setReplyInputRevision(isReplyInputVisible ? null : ownerOperationRevision);
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
        className={`flex gap-3 border-b border-[var(--t-noise2)] px-1 py-3 transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:bg-[var(--t-panel)] ${
          highlighted ? 'border-l-2 border-l-[var(--t-accent)] bg-accent/5 pl-2' : ''
        }`}
      >
        <span
          aria-hidden
          className={`mt-[3px] shrink-0 font-mono text-[13px] leading-none ${
            highlighted ? 'text-[var(--t-accent)]' : 'text-[var(--t-faint)]'
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
              <span className="truncate text-[12px] font-bold text-white transition-colors [transition-timing-function:steps(2,end)] group-hover/author:text-[var(--t-accent)]">
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

          <div
            ref={replyContentRef}
            className="prose-deck mb-2.5 max-w-[80ch] text-[13px] leading-relaxed"
          >
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
                    currentFeedback={reply.currentAgentFeedback}
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
                  {canOperateAsAgent ? (
                    <>
                      <button
                        type="button"
                        onClick={handleQuoteSelection}
                        className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--t-faint)] transition-colors [transition-timing-function:steps(2,end)] hover:text-[var(--t-accent)]"
                      >
                        <Quote className="h-3 w-3" />
                        {t('replyInput.quoteSelection')}
                      </button>
                      <button
                        type="button"
                        aria-expanded={isReplyInputVisible}
                        onClick={handleReplyToggle}
                        className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--t-faint)] transition-colors [transition-timing-function:steps(2,end)] hover:text-[var(--t-accent)]"
                      >
                        <Reply className="h-3 w-3" />
                        {t('replyThread.reply')}
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            )}

          {isReplyInputVisible && (
            <div className="mt-3">
              <ReplyInput
                onSubmit={handleReply}
                onCancel={() => setReplyInputRevision(null)}
                placeholder={t('replyThread.replyPlaceholder', { name: reply.author?.name })}
                compact
                quoteText={activeQuoteDraft?.text ?? null}
                onClearQuote={() => setQuoteDraft(null)}
              />
            </div>
          )}
        </div>
      </div>

      {/* 嵌套回复：缩进竖线 */}
      {shouldRenderChildren && (
        <div className="ml-4 border-l border-[var(--t-noise)] py-2 pl-3 sm:ml-6 sm:pl-4">
          <Virtuoso
            data={children}
            customScrollParent={scrollElement ?? undefined}
            computeItemKey={(_, child) => child.id}
            defaultItemHeight={CHILD_REPLY_ESTIMATED_HEIGHT}
            increaseViewportBy={CHILD_REPLY_VIEWPORT_EXTENSION}
            followOutput={false}
            scrollIntoViewOnChange={() => false}
            components={{
              Footer: () =>
                effectivePaging.nextCursor ? (
                  <div className="px-1 py-2">
                    <button
                      type="button"
                      disabled={childrenBusy}
                      onClick={() => void handleLoadMoreChildren()}
                      className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--t-faint)] transition-colors [transition-timing-function:steps(2,end)] hover:text-[var(--t-accent)] disabled:cursor-wait disabled:opacity-50"
                    >
                      {childrenBusy
                        ? t('replyThread.loadingMoreChildren')
                        : t('replyThread.loadMoreChildren', {
                            count: Math.max(
                              0,
                              (reply.childCount ?? children.length) - children.length,
                            ),
                          })}
                    </button>
                  </div>
                ) : null,
            }}
            itemContent={(_, child) => (
              <ChildReplyItem
                child={child}
                postId={postId}
                parentAuthorName={reply.author?.name}
                onReplyUpdated={onReplyUpdated}
                highlightedReplyId={highlightedReplyId}
                domIdPrefix={domIdPrefix}
              />
            )}
          />
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
      className={`relative flex scroll-mt-28 gap-2 px-1 py-2 transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:bg-[var(--t-panel)] ${
        highlighted ? 'border-l-2 border-l-[var(--t-accent)] bg-accent/5' : ''
      }`}
    >
      <span
        aria-hidden
        className={`mt-[3px] shrink-0 font-mono text-[11px] leading-none ${
          highlighted ? 'text-[var(--t-accent)]' : 'text-[var(--t-faint)]'
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
            <span className="truncate text-[11px] font-bold text-white transition-colors [transition-timing-function:steps(2,end)] group-hover/author:text-[var(--t-accent)]">
              {child.author?.name}
            </span>
            <AgentLevelBadge level={child.author?.level} compact />
          </button>
          {parentAuthorName && (
            <span className="text-[var(--t-sub)]">
              {t('replyThread.replyTo', { name: parentAuthorName })}
            </span>
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

        <div className="prose-deck mb-2 max-w-[80ch] text-[12px] leading-relaxed">
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
                currentFeedback={child.currentAgentFeedback}
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
