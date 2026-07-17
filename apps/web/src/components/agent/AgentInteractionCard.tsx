'use client';

import Link from 'next/link';
import { CircleSlash, ExternalLink, FileText, MessageCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AgentAvatar } from '@/components/ui/AgentAvatar';
import { FEEDBACK_ITEMS } from '@/components/forum/FeedbackBar';
import { getRelativeTime } from '@/lib/utils';
import type { AgentInteractionHistoryItem } from '@skynet/shared';

interface AgentInteractionCardProps {
  item: AgentInteractionHistoryItem;
  compact?: boolean;
}

const FALLBACK_FEEDBACK = {
  type: 'SPARK',
  emoji: '•',
} satisfies (typeof FEEDBACK_ITEMS)[number];

function getFeedbackMeta(type: AgentInteractionHistoryItem['feedbackType']) {
  return FEEDBACK_ITEMS.find((item) => item.type === type) ?? FALLBACK_FEEDBACK;
}

export function AgentInteractionCard({
  item,
  compact = false,
}: AgentInteractionCardProps) {
  const { t } = useTranslation();
  const feedback = getFeedbackMeta(item.feedbackType);
  const feedbackLabel =
    feedback === FALLBACK_FEEDBACK
      ? t('feedback.fallbackLabel')
      : t(`feedback.items.${feedback.type}.label`);
  const isReply = item.targetType === 'REPLY';
  const href = isReply && item.reply
    ? `/post/${item.post.id}?replyId=${encodeURIComponent(item.reply.id)}`
    : `/post/${item.post.id}`;
  const available = item.targetAvailable;
  const Icon = isReply ? MessageCircle : FileText;

  const content = (
    <div
      className={[
        'group flex gap-3 rounded-lg border border-copper/[0.12] bg-void-mid/55 transition-all',
        available ? 'hover:border-copper/30 hover:bg-void-hover' : 'opacity-75',
        compact ? 'px-3 py-2.5' : 'px-4 py-3.5',
      ].join(' ')}
    >
      <div className="flex-shrink-0 pt-0.5">
        <AgentAvatar
          agentId={item.targetAuthor.avatarSeed || item.targetAuthor.id}
          agentName={item.targetAuthor.name}
          size={compact ? 24 : 30}
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full border border-copper/20 bg-copper/[0.08] px-2 py-0.5 text-[11px] font-bold text-copper">
            <span aria-hidden="true">{feedback.emoji}</span>
            {feedbackLabel}
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] text-ink-muted">
            <Icon className="h-3 w-3" />
            {isReply ? t('feedback.replyFeedback') : t('feedback.postFeedback')}
          </span>
          <span className="text-[11px] text-ink-muted">
            {getRelativeTime(item.createdAt)}
          </span>
          {!available && (
            <span className="inline-flex items-center gap-1 rounded-full border border-ochre/20 bg-ochre/10 px-2 py-0.5 text-[10px] text-ochre">
              <CircleSlash className="h-3 w-3" />
              {t('feedback.targetOffline')}
            </span>
          )}
        </div>

        <p
          className={[
            'mt-2 text-ink-primary transition-colors',
            available ? 'group-hover:text-copper' : '',
            compact ? 'text-xs' : 'text-sm',
          ].join(' ')}
        >
          {t('feedback.marked', {
            name: item.targetAuthor.name,
            target: isReply ? t('forum.replyTarget') : t('forum.postTarget'),
          })}{' '}
          <span className="font-bold text-copper">
            {feedback.emoji} {feedbackLabel}
          </span>
        </p>

        <div className="mt-1.5 min-w-0">
          <div className="flex items-center gap-1.5 text-[12px] text-ink-secondary">
            <span className="truncate">「{item.post.title}」</span>
            {available && <ExternalLink className="h-3 w-3 flex-shrink-0 opacity-0 transition-opacity group-hover:opacity-70" />}
          </div>
          {item.reply && (
            <p className="mt-1 rounded-md border-l border-steel/25 bg-steel/[0.05] px-2 py-1.5 text-[12px] leading-relaxed text-ink-muted line-clamp-2">
              {item.reply.excerpt}
            </p>
          )}
        </div>
      </div>
    </div>
  );

  if (!available) {
    return content;
  }

  return (
    <Link href={href} className="block">
      {content}
    </Link>
  );
}
