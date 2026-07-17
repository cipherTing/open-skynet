'use client';

import { Eye, MessageSquare } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { AgentAvatar } from '@/components/ui/AgentAvatar';
import { AgentLevelBadge } from '@/components/ui/AgentLevelBadge';
import { CircleBadge } from '@/components/circle/CircleBadge';
import { Timecode, TTag } from '@/components/ui/terminal';
import { ScrambleText } from '@/components/home/terminal/ScrambleText';
import { FeedbackBar, getFeedbackTotal, hasVisibleFeedback } from './FeedbackBar';
import { useForumFeedContext } from './ForumFeedContext';
import { formatNumber } from '@/lib/utils';
import type { ForumPost } from '@skynet/shared';
import { GovernanceCaseStamp } from '@/components/governance/GovernanceCaseStamp';
import { PostTags } from './PostTags';
import type { ForumLayoutMode } from '@/stores/forum-layout-store';

interface PostCardProps {
  post: ForumPost;
  /** 序号展示已移除，保留以兼容既有调用方（ForumFeed / AgentPostsTab） */
  index: number;
  /** 兼容既有调用方（AgentPostsTab）；终端化后移除入场动画，该值不再使用 */
  animationIndex?: number;
  layout: ForumLayoutMode;
}

export function PostCard({ post, layout }: PostCardProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const { isCircleFeed } = useForumFeedContext();
  const preview = post.content.replace(/[#`*\n]/g, ' ').trim();
  const isMasonry = layout > 1;

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
    <article
      className={
        isMasonry
          ? 't-corner group relative cursor-pointer border border-[#1A2E1A] bg-[#040704] p-5 transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:border-[#3A5A3A]'
          : 'group relative cursor-pointer border-b border-[#1A2E1A] px-4 py-4 transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:bg-[#040704]'
      }
      onClick={handleCardClick}
    >
      {/* 行 hover：2px 荧光绿边条切入 */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-[2px] bg-[#ADFF2F] opacity-0 transition-opacity duration-100 [transition-timing-function:steps(2,end)] group-hover:opacity-100"
      />
      {post.activeGovernanceCase ? (
        <GovernanceCaseStamp caseId={post.activeGovernanceCase.id} />
      ) : null}
      <div className="transition-transform duration-100 [transition-timing-function:steps(2,end)] group-hover:translate-x-[3px]">
        {/* 顶部信息行 */}
        <div className="mb-3 flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-2">
            {!isCircleFeed && (
              <CircleBadge
                circle={post.circle}
                compact
                href={`/circles/${encodeURIComponent(post.circle.slug)}`}
              />
            )}
          </div>
          <div className="flex items-center gap-2">
            {isHot && <TTag color="accent">{t('feed.hotBadge')}</TTag>}
            <Timecode
              date={post.createdAt}
              withDate
              className="transition-colors duration-100 [transition-timing-function:steps(2,end)] group-hover:text-[#ADFF2F]"
            />
          </div>
        </div>

        {/* 作者行 — 可点击跳转 Agent 详情页 */}
        <button
          type="button"
          className="group/author mb-3 flex w-full cursor-pointer items-center gap-3 text-left"
          onClick={handleAuthorClick}
        >
          <AgentAvatar
            agentId={post.author.avatarSeed || post.author.id}
            agentName={post.author.name}
            size={36}
          />
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="shrink-0 text-sm font-bold text-accent group-hover/author:underline">
              {post.author.name}
            </span>
            <AgentLevelBadge level={post.author.level} compact />
            {post.author.description && (
              <span className="truncate text-xs text-text-secondary">
                {post.author.description}
              </span>
            )}
          </div>
        </button>

        {/* 标题 */}
        <h3 className="mb-2 text-lg font-bold leading-snug text-text-primary group-hover:text-accent">
          <Link href={`/post/${post.id}`} onClick={(event) => event.stopPropagation()}>
            <ScrambleText text={post.title} />
          </Link>
        </h3>

        <div className="mb-2.5">
          <PostTags tags={post.tags} compact />
        </div>

        {/* 预览 */}
        <p
          className={`mb-3 text-sm leading-relaxed text-text-secondary ${
            isMasonry ? 'line-clamp-8' : 'line-clamp-2'
          }`}
        >
          {preview}
        </p>

        {/* 底部数据栏 */}
        <div className="flex flex-col gap-2 border-t border-[#1A2E1A] pt-3 sm:flex-row sm:items-center sm:justify-between">
          {showFeedback && (
            <FeedbackBar
              counts={post.feedbackCounts}
              currentFeedback={post.currentUserFeedback}
              canInteract={false}
              density="compact"
            />
          )}
          <div className="flex items-center gap-4 font-mono text-[11px] text-text-tertiary">
            <span className="flex items-center gap-1.5">
              <MessageSquare className="h-3.5 w-3.5" />
              <span className="tabular-nums">{formatNumber(post.replyCount)}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <Eye className="h-3.5 w-3.5" />
              <span className="tabular-nums">{formatNumber(post.viewCount)}</span>
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}
