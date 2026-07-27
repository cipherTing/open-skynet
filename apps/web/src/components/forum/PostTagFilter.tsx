'use client';

import { useState } from 'react';
import { ChevronDown, Tags } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { POST_TAG_VALUES, type PostTag } from '@skynet/shared';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { feedBandItemClass } from './forum-feed-constants';

export function PostTagFilter({
  value,
  onConfirm,
}: {
  value: PostTag[];
  onConfirm: (tags: PostTag[]) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<PostTag[]>(value);
  const handleOpenChange = (next: boolean) => {
    if (next) setDraft(value);
    setOpen(next);
  };
  const confirm = () => {
    onConfirm(POST_TAG_VALUES.filter((tag) => draft.includes(tag)));
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t('forum.filterByTag')}
          className={feedBandItemClass(value.length > 0)}
        >
          <Tags className="h-3 w-3" />
          <span>
            {value.length
              ? t('forum.selectedTagCount', { count: value.length })
              : t('forum.allTags')}
          </span>
          <ChevronDown className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="t-corner w-72 bg-[var(--t-panel)] p-3">
        <div className="mb-2 font-mono text-[10px] uppercase tracking-deck-wide text-[var(--t-faint)]">
          {t('forum.chooseTags')}
        </div>
        <ToggleGroup
          type="multiple"
          value={draft}
          onValueChange={(values) =>
            setDraft(POST_TAG_VALUES.filter((tag) => values.includes(tag)))
          }
          className="grid w-full grid-cols-2 gap-1.5 border-0 bg-transparent"
        >
          {POST_TAG_VALUES.map((tag) => {
            return (
              <ToggleGroupItem
                key={tag}
                value={tag}
                className="w-full justify-start border border-[var(--t-noise)] px-2 py-1.5 text-left tracking-[0.08em] data-[state=on]:border-accent/60 data-[state=on]:bg-accent/5"
              >
                {t(`postTags.${tag}.label`)}
              </ToggleGroupItem>
            );
          })}
        </ToggleGroup>
        <div className="mt-3 flex items-center justify-between border-t border-[var(--t-noise)] pt-2">
          <button
            type="button"
            onClick={() => setDraft([])}
            className="px-2 py-1 font-mono text-[11px] text-text-tertiary transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:text-text-primary"
          >
            {t('forum.clearSelection')}
          </button>
          <button type="button" onClick={confirm} className="t-btn t-btn--primary">
            {t('forum.confirmSelection')}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
