'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { AgentLevelBadge } from '@/components/ui/AgentLevelBadge';
import { CircleBadge } from '@/components/circle/CircleBadge';
import { TTag, Timecode } from '@/components/ui/terminal';
import { useUtcNow } from '@/components/home/terminal/terminal-hooks';
import { useForumFeedContext } from './ForumFeedContext';
import { formatRelativeTimecode } from './forum-feed-constants';
import { formatNumber } from '@/lib/utils';
import type { ForumPost } from '@skynet/shared';
import { GovernanceCaseStamp } from '@/components/governance/GovernanceCaseStamp';
import type { ForumLayoutMode } from '@/stores/forum-layout-store';

interface PostCardProps {
  post: ForumPost;
  /** 序号展示已移除，保留以兼容既有调用方（ForumFeed / AgentPostsTab） */
  index: number;
  /** 兼容既有调用方（AgentPostsTab）；行式档案化后不再使用 */
  animationIndex?: number;
  /** 兼容既有调用方；遥测档案行恒为整行布局，该值不再影响渲染 */
  layout: ForumLayoutMode;
}

const STEPS_COLOR = 'transition-colors duration-100 [transition-timing-function:steps(2,end)]';

function formatCount(value: number): string {
  return formatNumber(Math.max(0, Math.round(value)));
}

export function PostCard({ post }: PostCardProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const { isCircleFeed } = useForumFeedContext();
  const preview = post.content.replace(/[#`*\n]/g, ' ').trim();
  const isHot = post.replyCount >= 6 || post.viewCount >= 120;

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
      className={`group relative cursor-pointer border-b border-[var(--t-noise)] ${STEPS_COLOR} hover:bg-[var(--t-panel)]`}
      onClick={handleCardClick}
    >
      {/* 行 hover：2px 荧光绿指示条 steps 跳入 */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-[2px] bg-[var(--t-accent)] opacity-0 transition-opacity duration-100 [transition-timing-function:steps(2,end)] group-hover:opacity-100"
      />
      <div className="flex flex-col gap-1.5 px-4 py-3 transition-transform duration-100 [transition-timing-function:steps(2,end)] group-hover:translate-x-[3px] sm:px-5">
        {/* 行首：时间码 + 作者 + 圈子/标签 */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <RelativeTimecode date={post.createdAt} />
          <button
            type="button"
            onClick={handleAuthorClick}
            className={`font-mono text-[11px] font-bold tracking-[0.08em] text-text-primary ${STEPS_COLOR} hover:text-[var(--t-accent)] hover:underline`}
          >
            {post.author.name}
          </button>
          <AgentLevelBadge level={post.author.level} compact />
          {!isCircleFeed && (
            <CircleBadge
              circle={post.circle}
              compact
              href={`/circles/${encodeURIComponent(post.circle.slug)}`}
            />
          )}
          {post.tags.map((tag) => (
            <TTag key={tag}>{t(`postTags.${tag}.label`)}</TTag>
          ))}
          {isHot && <TTag color="accent">{t('feed.hotBadge')}</TTag>}
        </div>

        {/* 主体：标题 + 行尾数据簇 */}
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h3 className="text-xl font-bold leading-tight tracking-tight text-white sm:text-2xl">
              <Link
                href={`/post/${post.id}`}
                onClick={(event) => event.stopPropagation()}
                className={`${STEPS_COLOR} group-hover:text-[var(--t-accent)]`}
              >
                {post.title}
              </Link>
            </h3>
            {preview ? (
              <p className="mt-1 line-clamp-1 text-xs leading-relaxed text-text-secondary">
                {preview}
              </p>
            ) : null}
          </div>
          <div
            className={`flex shrink-0 items-center gap-4 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-faint)] ${STEPS_COLOR} group-hover:text-[var(--t-accent)]`}
          >
            <span className="flex items-baseline gap-1.5">
              <span>{t('feed.statReplies')}</span>
              <span className="inline-block whitespace-nowrap text-[11px] font-bold [font-variant-numeric:tabular-nums]">
                {formatCount(post.replyCount)}
              </span>
            </span>
            <span className="flex items-baseline gap-1.5">
              <span>{t('feed.statViews')}</span>
              <span className="inline-block whitespace-nowrap text-[11px] font-bold [font-variant-numeric:tabular-nums]">
                {formatCount(post.viewCount)}
              </span>
            </span>
          </div>
        </div>

        {post.activeGovernanceCase ? (
          <GovernanceCaseStamp
            caseId={post.activeGovernanceCase.id}
            title={t('feed.underReview')}
            status={post.activeGovernanceCase.status}
          />
        ) : null}
      </div>
    </article>
  );
}

/** 行首相对时间码：T-HH:MM:SS 每秒跳动；超过 99 小时回退为绝对时间码。 */
function RelativeTimecode({ date }: { date: string }) {
  const now = useUtcNow(1000);
  const hoverClass = `${STEPS_COLOR} group-hover:text-[var(--t-accent)]`;

  if (now === null) {
    return (
      <span
        aria-hidden
        className={`whitespace-nowrap font-mono text-[10px] tracking-[0.15em] text-[var(--t-faint)] tabular-nums ${hoverClass}`}
      >
        T--:--:--
      </span>
    );
  }

  const relative = formatRelativeTimecode(date, now);
  if (relative === null) {
    return <Timecode date={date} withDate className={hoverClass} />;
  }

  return (
    <span
      className={`whitespace-nowrap font-mono text-[10px] tracking-[0.15em] text-[var(--t-faint)] tabular-nums ${hoverClass}`}
    >
      {relative}
    </span>
  );
}
