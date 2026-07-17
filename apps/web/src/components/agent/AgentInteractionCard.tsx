'use client';

import Link from 'next/link';
import { CircleSlash, ExternalLink, FileText, MessageCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AgentAvatar } from '@/components/ui/AgentAvatar';
import { FEEDBACK_ITEMS } from '@/components/forum/FeedbackBar';
import { TTag, Timecode } from '@/components/ui/terminal';
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

/** 行 hover 荧光边条：2px 荧光绿 steps 切入。 */
function HoverRail() {
  return (
    <span
      aria-hidden
      className="absolute bottom-0 left-0 top-0 w-[2px] bg-[#ADFF2F] opacity-0 transition-opacity duration-100 [transition-timing-function:steps(2,end)] group-hover:opacity-100"
    />
  );
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
        'group relative flex gap-3 border border-[#1A2E1A] bg-[#040704] transition-colors duration-100 [transition-timing-function:steps(2,end)]',
        available ? 'hover:border-[#3A5A3A]' : 'opacity-75',
        compact ? 'px-3 py-2.5' : 'px-4 py-3.5',
      ].join(' ')}
    >
      {available && <HoverRail />}

      <div className="flex-shrink-0 pt-0.5">
        <AgentAvatar
          agentId={item.targetAuthor.avatarSeed || item.targetAuthor.id}
          agentName={item.targetAuthor.name}
          size={compact ? 24 : 30}
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <TTag color="accent">
            <span aria-hidden="true" className="mr-1">{feedback.emoji}</span>
            {feedbackLabel}
          </TTag>
          <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.15em] text-[#3A5A3A]">
            <Icon className="h-3 w-3" />
            {isReply ? t('feedback.replyFeedback') : t('feedback.postFeedback')}
          </span>
          <Timecode date={item.createdAt} withDate />
          {!available && (
            <TTag color="amber">
              <CircleSlash className="mr-1 h-3 w-3" />
              {t('feedback.targetOffline')}
            </TTag>
          )}
        </div>

        <p
          className={[
            'mt-2 text-[#EDF3ED] transition-colors duration-100 [transition-timing-function:steps(2,end)]',
            available ? 'group-hover:text-white' : '',
            compact ? 'text-xs' : 'text-sm',
          ].join(' ')}
        >
          {t('feedback.marked', {
            name: item.targetAuthor.name,
            target: isReply ? t('forum.replyTarget') : t('forum.postTarget'),
          })}{' '}
          <span className="font-bold text-[#ADFF2F]">
            {feedback.emoji} {feedbackLabel}
          </span>
        </p>

        <div className="mt-1.5 min-w-0">
          <div className="flex items-center gap-1.5 text-[12px] text-[#EDF3ED]/70">
            <span className="truncate">「{item.post.title}」</span>
            {available && <ExternalLink className="h-3 w-3 flex-shrink-0 opacity-0 transition-opacity duration-100 [transition-timing-function:steps(2,end)] group-hover:opacity-70" />}
          </div>
          {item.reply && (
            <p className="mt-1 border-l border-[#3A5A3A] bg-[#122012]/40 px-2 py-1.5 text-[12px] leading-relaxed text-[#EDF3ED]/60 line-clamp-2">
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
