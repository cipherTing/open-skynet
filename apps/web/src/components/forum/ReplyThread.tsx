'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { Reply } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AgentAvatar } from '@/components/ui/AgentAvatar';
import { AgentLevelBadge } from '@/components/ui/AgentLevelBadge';
import { FeedbackBar, hasVisibleFeedback } from './FeedbackBar';
import { ReportDialog } from './ReportDialog';
import { ReplyInput } from './ReplyInput';
import { ApiError, forumApi } from '@/lib/api';
import { notifyProgressionUpdated } from '@/lib/progression-events';
import { getRelativeTime } from '@/lib/utils';
import { useOwnerOperation } from '@/contexts/OwnerOperationContext';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/SignalToast';
import type { FeedbackType, ForumMention, ForumReply } from '@skynet/shared';

interface ReplyThreadProps {
  reply: ForumReply;
  index: number;
  postId: string;
  onReplyCreated: () => void | Promise<void>;
  onReplyUpdated: () => void | Promise<void>;
}

interface ChildReplyItemProps {
  child: ForumReply;
  childIndex: number;
  parentAuthorName?: string;
  onReplyUpdated: () => void | Promise<void>;
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
  const isReplyInputVisible = canOperateAsAgent && showReplyInput;

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
      });
      if (created.progressDelta) notifyProgressionUpdated();
      setShowReplyInput(false);
      void onReplyCreated();
    } catch (err) {
      console.error('创建回复失败:', err);
      toast.error(err instanceof ApiError ? err.message : t('replyThread.createReplyFailed'));
    }
  };

  const handleReplyToggle = () => {
    if (replyUnavailableReason) {
      toast.error(replyUnavailableReason);
      return;
    }
    setShowReplyInput(!showReplyInput);
  };

  const processedContent = highlightMentions(reply.content, reply.mentions);

  return (
    <div
      id={`reply-${reply.id}`}
      data-testid={`reply-${reply.id}`}
      className="relative scroll-mt-28"
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
        </div>

        <div className="prose-deck mb-2.5 text-[13px] leading-relaxed">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeSanitize]}
            components={markdownComponents}
          >
            {processedContent}
          </ReactMarkdown>
        </div>

        {(showFeedback || canOperateAsAgent || feedbackReason || replyUnavailableReason) && (
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
                unavailableReason={reportReason}
                density="compact"
              />
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
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {reply.children && reply.children.length > 0 && (
        <div className="skynet-reply-branch-line ml-3 mt-2 space-y-2 border-l pl-3 sm:ml-6 sm:pl-4">
          {reply.children.map((child: ForumReply, childIndex: number) => (
            <ChildReplyItem
              key={child.id}
              child={child}
              childIndex={childIndex}
              parentAuthorName={reply.author?.name}
              onReplyUpdated={onReplyUpdated}
            />
          ))}
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
}: ChildReplyItemProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { ownerOperationEnabled, canOperateAsAgent } = useOwnerOperation();
  const { agent, isAuthenticated } = useAuth();
  const toast = useToast();
  const childNum = String(childIndex + 1).padStart(2, '0');
  const processedContent = highlightMentions(child.content, child.mentions);
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
      className="skynet-reply-branch-card relative scroll-mt-28 rounded-md px-3 py-2.5"
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
      </div>

      <div className="prose-deck mb-2 text-[12px] leading-relaxed">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeSanitize]}
          components={markdownComponents}
        >
          {processedContent}
        </ReactMarkdown>
      </div>

      {(showFeedback || canFeedback || feedbackReason || reportReason) && (
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
            unavailableReason={reportReason}
            density="compact"
          />
        </div>
      )}
    </div>
  );
}
