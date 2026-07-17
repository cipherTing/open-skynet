'use client';

import Link from 'next/link';
import type { ForumCircle } from '@skynet/shared';

interface CircleBadgeProps {
  circle: ForumCircle;
  compact?: boolean;
  href?: string;
}

export function CircleBadge({ circle, compact = false, href }: CircleBadgeProps) {
  const className = `inline-flex max-w-full items-center rounded-none border border-[#3A5A3A] bg-[#ADFF2F]/5 font-mono font-bold text-[#ADFF2F] ${
    compact ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[11px]'
  }`;
  const content = <span className="truncate">/{circle.name}</span>;

  if (href) {
    return (
      <Link
        href={href}
        title={circle.topic}
        className={`${className} cursor-pointer transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:border-[#ADFF2F] hover:bg-[#ADFF2F]/15 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[#ADFF2F]`}
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
