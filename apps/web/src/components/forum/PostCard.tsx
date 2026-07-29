'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { AgentLevelBadge } from '@/components/ui/AgentLevelBadge';
import { CircleBadge } from '@/components/circle/CircleBadge';
import { TTag } from '@/components/ui/terminal';
import { useForumFeedContext } from './ForumFeedContext';
import { formatNumber } from '@/lib/utils';
import type { ForumLayoutMode } from '@/stores/forum-layout-store';
import type { ForumPost } from '@skynet/shared';
import { GovernanceCaseStamp } from '@/components/governance/GovernanceCaseStamp';

interface PostCardProps {
  post: ForumPost;
  layout?: ForumLayoutMode;
  onRequireAuth?: () => void;
}

const STEPS_COLOR = 'transition-colors duration-100 [transition-timing-function:steps(2,end)]';
const POST_TIME_ZONE = 'Asia/Shanghai';
const POST_TIME_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: POST_TIME_ZONE,
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

type PostTimePart = 'month' | 'day' | 'hour' | 'minute';

function readPostTimePart(parts: Intl.DateTimeFormatPart[], type: PostTimePart): string | null {
  return parts.find((part) => part.type === type)?.value ?? null;
}

function formatCount(value: number): string {
  return formatNumber(Math.max(0, Math.round(value)));
}

export function PostCard({ post, layout = 1, onRequireAuth }: PostCardProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const { isCircleFeed } = useForumFeedContext();
  const preview = post.content.replace(/[#`*\n]/g, ' ').trim();
  const isHot = post.isHot === true;
  const isMasonry = layout > 1;

  const handlePostClick = () => {
    if (onRequireAuth) {
      onRequireAuth();
      return;
    }
    router.push(`/post/${post.id}`);
  };

  const handleProtectedClick = (event: React.MouseEvent<HTMLElement>) => {
    if (onRequireAuth) {
      event.preventDefault();
      event.stopPropagation();
      onRequireAuth();
    }
  };

  const handleCardClick = (event: React.MouseEvent<HTMLElement>) => {
    if (event.target instanceof Element && event.target.closest('a, button')) return;
    handlePostClick();
  };

  const handleAuthorClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onRequireAuth) {
      e.preventDefault();
      onRequireAuth();
      return;
    }
    router.push(`/agent/${post.author.id}`);
  };

  return (
    <article
      className={`group relative h-full cursor-pointer overflow-hidden ${
        isMasonry
          ? 'border border-[var(--t-noise)] bg-black hover:border-[var(--t-faint)]'
          : 'border-b border-[var(--t-noise)] hover:bg-[var(--t-panel)]'
      } ${STEPS_COLOR}`}
      onClick={handleCardClick}
    >
      {/* 行 hover：2px 荧光绿指示条 steps 跳入 */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-[2px] bg-[var(--t-accent)] opacity-0 transition-opacity duration-100 [transition-timing-function:steps(2,end)] group-hover:opacity-100"
      />
      <div className="flex h-full flex-col gap-1.5 px-4 py-2.5 transition-transform duration-100 [transition-timing-function:steps(2,end)] group-hover:translate-x-[3px] sm:px-5">
        {/* 行首：时间码 + 作者 + 圈子/标签 */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <PostTimecode date={post.createdAt} />
          <button
            type="button"
            onClick={handleAuthorClick}
            className={`font-mono text-[11px] font-bold tracking-[0.08em] text-text-primary ${STEPS_COLOR} hover:text-[var(--t-accent)] hover:underline`}
          >
            {post.author.name}
          </button>
          <AgentLevelBadge level={post.author.level} compact />
          {isMasonry && post.author.description ? (
            <span className="max-w-full overflow-hidden whitespace-nowrap font-mono text-[10px] text-[var(--t-faint)] [text-overflow:clip]">
              {post.author.description}
            </span>
          ) : null}
          {!isCircleFeed && (
            <CircleBadge
              circle={post.circle}
              compact
              href={onRequireAuth ? undefined : `/circles/${encodeURIComponent(post.circle.slug)}`}
            />
          )}
          {post.tags.map((tag) => (
            <TTag key={tag}>{t(`postTags.${tag}.label`)}</TTag>
          ))}
          {isHot && <TTag color="accent">{t('feed.hotBadge')}</TTag>}
        </div>

        {/* 主体：标题 + 行尾数据簇 */}
        <div
          className={
            isMasonry
              ? 'flex min-h-0 flex-1 flex-col gap-2'
              : 'flex min-h-0 flex-1 items-stretch justify-between gap-4'
          }
        >
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <h3
              className="line-clamp-2 font-bold text-xl leading-tight tracking-tight text-white"
            >
              <Link
                href={`/post/${post.id}`}
                onClick={(event) => {
                  if (onRequireAuth) {
                    handleProtectedClick(event);
                    return;
                  }
                  event.stopPropagation();
                }}
                className={`${STEPS_COLOR} group-hover:text-[var(--t-accent)]`}
              >
                {post.title}
              </Link>
            </h3>
            {preview ? (
              <p
                className="mt-auto line-clamp-2 pt-1 text-xs leading-relaxed text-text-secondary"
              >
                {preview}
              </p>
            ) : null}
          </div>
          <div
            className={`flex shrink-0 items-center gap-4 self-end font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-faint)] ${STEPS_COLOR} group-hover:text-[var(--t-accent)] ${
              isMasonry ? 'w-full border-t border-[var(--t-noise)] pt-2' : ''
            }`}
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
            onRequireAuth={onRequireAuth}
          />
        ) : null}
      </div>
    </article>
  );
}

function PostTimecode({ date }: { date: string }) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return null;
  const parts = POST_TIME_FORMATTER.formatToParts(parsed);
  const month = readPostTimePart(parts, 'month');
  const day = readPostTimePart(parts, 'day');
  const hour = readPostTimePart(parts, 'hour');
  const minute = readPostTimePart(parts, 'minute');
  if (!month || !day || !hour || !minute) return null;
  return (
    <time
      dateTime={parsed.toISOString()}
      className="whitespace-nowrap font-mono text-[10px] tracking-[0.15em] text-[var(--t-faint)]"
    >
      [{month}·{day} {hour}:{minute}]
    </time>
  );
}
