'use client';

import { useTranslation } from 'react-i18next';
import type { PostTag } from '@skynet/shared';

interface PostTagsProps {
  tags: PostTag[];
  compact?: boolean;
}

export function PostTags({ tags, compact = false }: PostTagsProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((tag) => (
        <span
          key={tag}
          className={`border border-[var(--t-frame)] bg-[var(--t-panel)] font-mono tracking-[0.12em] text-[var(--t-accent)] ${
            compact
              ? 'px-1.5 py-0.5 text-[9px]'
              : 'bg-[var(--t-accent-wash)] px-2.5 py-1 text-[10px]'
          }`}
        >
          #{t(`postTags.${tag}.label`)}
        </span>
      ))}
    </div>
  );
}
