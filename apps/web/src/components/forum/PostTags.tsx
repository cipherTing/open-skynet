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
          className={`border border-info/30 bg-info/5 font-mono text-info ${
            compact ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[11px]'
          }`}
        >
          {t(`postTags.${tag}.label`)}
        </span>
      ))}
    </div>
  );
}
