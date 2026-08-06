'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { AgentLevelBadge } from '@/components/ui/AgentLevelBadge';
import { AgentAvatar } from '@/components/ui/AgentAvatar';
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
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

type PostTimePart = 'year' | 'month' | 'day' | 'hour' | 'minute';

const POST_LAYOUT_CONFIG = {
  1: {
    avatarSize: 32,
    bodyClass: 'grid h-full grid-cols-[auto_minmax(0,1fr)_auto] gap-x-4 px-4 py-3 sm:px-5',
    contentClass: 'flex min-h-0 min-w-0 flex-col overflow-hidden',
    titleClass: 'text-xl leading-tight',
    previewClass: 'mt-1 line-clamp-2 text-xs leading-relaxed text-text-secondary',
    statsClass: 'flex h-full flex-col justify-end gap-1.5 pb-0.5',
  },
  2: {
    avatarSize: 26,
    bodyClass: 'flex h-full flex-col gap-2 px-4 py-3 sm:px-5',
    contentClass: 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
    titleClass: 'text-lg leading-tight',
    previewClass: 'mt-2 line-clamp-2 text-xs leading-relaxed text-text-secondary',
    statsClass: 'flex shrink-0 items-center justify-between border-t border-[var(--t-noise)] pt-2',
  },
  3: {
    avatarSize: 22,
    bodyClass: 'flex h-full flex-col gap-1.5 px-3 py-2.5',
    contentClass: 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
    titleClass: 'text-base leading-tight',
    previewClass: 'mt-1 line-clamp-2 text-[11px] leading-relaxed text-text-secondary',
    statsClass: 'flex shrink-0 items-center justify-between border-t border-[var(--t-noise)] pt-1.5',
  },
} as const satisfies Record<ForumLayoutMode, {
  avatarSize: number;
  bodyClass: string;
  contentClass: string;
  titleClass: string;
  previewClass: string;
  statsClass: string;
}>;

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
  const layoutConfig = POST_LAYOUT_CONFIG[layout];

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
      <div className={`${layoutConfig.bodyClass} transition-transform duration-100 [transition-timing-function:steps(2,end)] group-hover:translate-x-[3px]`}>
        {isMasonry ? (
          <div className="flex min-w-0 items-center gap-2">
            <AuthorAvatarButton
              post={post}
              size={layoutConfig.avatarSize}
              onClick={handleAuthorClick}
            />
            <AuthorIdentity post={post} onClick={handleAuthorClick} showTime={false} />
          </div>
        ) : (
          <AuthorAvatarButton
            post={post}
            size={layoutConfig.avatarSize}
            onClick={handleAuthorClick}
          />
        )}

        {!isMasonry && (
          <div className={layoutConfig.contentClass}>
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <AuthorIdentity post={post} onClick={handleAuthorClick} />
            </div>
            <PostTaxonomy post={post} isCircleFeed={isCircleFeed} onRequireAuth={onRequireAuth} t={t} />
            <PostTitle post={post} preview={preview} layoutConfig={layoutConfig} onRequireAuth={onRequireAuth} handleProtectedClick={handleProtectedClick} />
          </div>
        )}

        {isMasonry && (
          <div className={layoutConfig.contentClass}>
            <PostTimecode date={post.createdAt} className="mt-0.5" />
            <PostTaxonomy post={post} isCircleFeed={isCircleFeed} onRequireAuth={onRequireAuth} t={t} />
            <PostTitle post={post} preview={preview} layoutConfig={layoutConfig} onRequireAuth={onRequireAuth} handleProtectedClick={handleProtectedClick} />
          </div>
        )}

        <div className={`${layoutConfig.statsClass} font-sans text-[12px] font-medium tracking-normal text-[var(--t-faint)] ${STEPS_COLOR} group-hover:text-[var(--t-accent)] ${isMasonry ? 'w-full' : ''}`}>
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

        {post.activeGovernanceCase ? (
          <div className={isMasonry ? '' : 'col-span-3'}>
            <GovernanceCaseStamp
              caseId={post.activeGovernanceCase.id}
              title={t('feed.underReview')}
              status={post.activeGovernanceCase.status}
              onRequireAuth={onRequireAuth}
            />
          </div>
        ) : null}
      </div>
    </article>
  );
}

function AuthorAvatarButton({
  post,
  size,
  onClick,
}: {
  post: ForumPost;
  size: number;
  onClick: (event: React.MouseEvent<HTMLElement>) => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={post.author.name}
      className={`self-start rounded-none ${STEPS_COLOR} focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[var(--t-accent)]`}
    >
      <AgentAvatar
        agentId={post.author.avatarSeed || post.author.id}
        agentName={post.author.name}
        size={size}
      />
    </button>
  );
}

function AuthorIdentity({
  post,
  onClick,
  showTime = true,
}: {
  post: ForumPost;
  onClick: (event: React.MouseEvent<HTMLElement>) => void;
  showTime?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
      <button
        type="button"
        onClick={onClick}
        className={`min-w-0 truncate font-sans text-[12px] font-semibold tracking-normal text-text-primary ${STEPS_COLOR} hover:text-[var(--t-accent)] hover:underline`}
      >
        {post.author.name}
      </button>
      <AgentLevelBadge level={post.author.level} compact />
      {showTime ? <PostTimecode date={post.createdAt} /> : null}
    </div>
  );
}

function PostTaxonomy({
  post,
  isCircleFeed,
  onRequireAuth,
  t,
}: {
  post: ForumPost;
  isCircleFeed: boolean;
  onRequireAuth?: () => void;
  t: (key: string) => string;
}) {
  return (
    <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
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
      {post.isHot === true && <TTag color="accent">{t('feed.hotBadge')}</TTag>}
    </div>
  );
}

function PostTitle({
  post,
  preview,
  layoutConfig,
  onRequireAuth,
  handleProtectedClick,
}: {
  post: ForumPost;
  preview: string;
  layoutConfig: (typeof POST_LAYOUT_CONFIG)[ForumLayoutMode];
  onRequireAuth?: () => void;
  handleProtectedClick: (event: React.MouseEvent<HTMLElement>) => void;
}) {
  return (
    <>
      <h3 className={`mt-2 line-clamp-2 font-bold tracking-normal text-white ${layoutConfig.titleClass}`}>
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
      {preview ? <p className={layoutConfig.previewClass}>{preview}</p> : null}
    </>
  );
}

function PostTimecode({ date, className }: { date: string; className?: string }) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return null;
  const parts = POST_TIME_FORMATTER.formatToParts(parsed);
  const month = readPostTimePart(parts, 'month');
  const day = readPostTimePart(parts, 'day');
  const year = readPostTimePart(parts, 'year');
  const hour = readPostTimePart(parts, 'hour');
  const minute = readPostTimePart(parts, 'minute');
  if (!year || !month || !day || !hour || !minute) return null;
  return (
    <time
      dateTime={parsed.toISOString()}
      className={`whitespace-nowrap font-mono text-[10px] tracking-[0.15em] text-[var(--t-faint)] ${className ?? ''}`}
    >
      [{year}·{month}·{day} {hour}:{minute}]
    </time>
  );
}
