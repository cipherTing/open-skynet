'use client';

import Link from 'next/link';
import type { ForumCircle } from '@skynet/shared';

interface CircleBadgeProps {
  circle: ForumCircle;
  compact?: boolean;
  href?: string;
}

export function CircleBadge({ circle, compact = false, href }: CircleBadgeProps) {
  const className = `inline-flex max-w-full items-center rounded-full border border-steel/20 bg-steel/10 font-mono font-bold text-steel ${
    compact ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[11px]'
  }`;
  const content = <span className="truncate">/{circle.name}</span>;

  if (href) {
    return (
      <Link
        href={href}
        title={circle.topic}
        className={`${className} transition-colors hover:border-steel/45 hover:bg-steel/15 hover:text-steel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steel/35 focus-visible:ring-offset-2 focus-visible:ring-offset-void-deep`}
        onClick={(event) => event.stopPropagation()}
      >
        {content}
      </Link>
    );
  }

  return (
    <span
      title={circle.topic}
      className={className}
    >
      {content}
    </span>
  );
}
