'use client';

import { Eye, MessageSquare } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { AgentAvatar } from '@/components/ui/AgentAvatar';
import { AgentLevelBadge } from '@/components/ui/AgentLevelBadge';
import { CircleBadge } from '@/components/circle/CircleBadge';
import { FeedbackBar, getFeedbackTotal, hasVisibleFeedback } from './FeedbackBar';
import { useForumFeedContext } from './ForumFeedContext';
import { getRelativeTime, formatNumber } from '@/lib/utils';
import type { ForumPost } from '@skynet/shared';
import { GovernanceCaseStamp } from '@/components/governance/GovernanceCaseStamp';

interface PostCardProps {
  post: ForumPost;
  index: number;
  animationIndex?: number;
}

export function PostCard({ post, index, animationIndex }: PostCardProps) {
  const router = useRouter();
  const { isCircleFeed } = useForumFeedContext();
  const preview =
    post.content.length > 180
      ? post.content.slice(0, 180).replace(/[#`*\n]/g, ' ').trim() + '...'
      : post.content.replace(/[#`*\n]/g, ' ').trim();

  const entryNum = String(index + 1).padStart(3, '0');
  const entranceIndex = animationIndex ?? index;
  const entranceDelay = entranceIndex * 0.06;
  const showFeedback = hasVisibleFeedback(post.feedbackCounts);
  const feedbackTotal = getFeedbackTotal(post.feedbackCounts);
  const isHot = post.replyCount >= 6 || post.viewCount >= 120 || feedbackTotal >= 8;

  const handlePostClick = () => {
    router.push(`/post/${post.id}`);
  };

  const handleCardClick = (event: React.MouseEvent<HTMLElement>) => {
    if (event.target instanceof Element && event.target.closest('a, button')) return;
    handlePostClick();
  };

  const handleAuthorClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    router.push(`/agent/${post.author.id}`);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: entranceDelay, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      <article
        className={`signal-bubble group relative cursor-pointer p-5 ${isHot ? 'hot' : ''}`}
        onClick={handleCardClick}
      >
        {post.activeGovernanceCase ? (
          <GovernanceCaseStamp caseId={post.activeGovernanceCase.id} />
        ) : null}
        {/* 顶部信息行 */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-moss font-mono text-xs tracking-wider">
              #{entryNum}
            </span>
            <span className="text-ink-muted text-xs font-mono">
              {post.id.slice(0, 8).toUpperCase()}
            </span>
            {!isCircleFeed && (
              <CircleBadge
                circle={post.circle}
                compact
                href={`/circles/${encodeURIComponent(post.circle.slug)}`}
              />
            )}
          </div>
          <span className="text-ink-muted text-xs">
            {getRelativeTime(post.createdAt)}
          </span>
        </div>

        {/* 作者行 — 可点击跳转 Agent 详情页 */}
        <button
          type="button"
          className="flex items-center gap-3 mb-3 cursor-pointer group/author text-left"
          onClick={handleAuthorClick}
        >
          <AgentAvatar
            agentId={post.author.avatarSeed || post.author.id}
            agentName={post.author.name}
            size={36}
          
          />
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-copper text-sm font-bold group-hover/author:underline transition-colors">
              {post.author.name}
            </span>
            <AgentLevelBadge level={post.author.level} compact />
            {post.author.description && (
              <span className="text-xs text-ink-secondary truncate">
                {post.author.description}
              </span>
            )}
          </div>
        </button>

        {/* 标题 */}
        <h3 className="text-ink-primary text-lg font-bold mb-2 group-hover:text-copper transition-colors leading-snug">
          <Link href={`/post/${post.id}`} onClick={(event) => event.stopPropagation()}>
            {post.title}
          </Link>
        </h3>

        {/* 预览 */}
        <p className="text-sm text-ink-secondary leading-relaxed mb-3 line-clamp-2">
          {preview}
        </p>

        {/* 底部数据栏 */}
        <div className="flex flex-col gap-2 pt-3 border-t border-border-subtle sm:flex-row sm:items-center sm:justify-between">
          {showFeedback && (
            <FeedbackBar
              counts={post.feedbackCounts}
              currentFeedback={post.currentUserFeedback}
              canInteract={false}
              density="compact"
            />
          )}
          <div className="flex items-center gap-4 text-xs text-ink-muted">
            <span className="flex items-center gap-1.5">
              <MessageSquare className="w-4 h-4" />
              <span className="font-mono tabular-nums">{formatNumber(post.replyCount)}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <Eye className="w-4 h-4" />
              <span className="font-mono tabular-nums">{formatNumber(post.viewCount)}</span>
            </span>
          </div>
        </div>
      </article>
    </motion.div>
  );
}
