'use client';

import { useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Check, ChevronDown, Tags } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { POST_TAG_VALUES, type PostTag } from '@skynet/shared';

export function PostTagFilter({ value, onConfirm }: { value: PostTag[]; onConfirm: (tags: PostTag[]) => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<PostTag[]>(value);
  const handleOpenChange = (next: boolean) => {
    if (next) setDraft(value);
    setOpen(next);
  };
  const toggle = (tag: PostTag) => setDraft((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]);
  const confirm = () => {
    onConfirm(POST_TAG_VALUES.filter((tag) => draft.includes(tag)));
    setOpen(false);
  };

  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange}>
      <Popover.Trigger asChild>
        <button type="button" className="forum-filter-trigger" aria-label={t('forum.filterByTag')}>
          <Tags className="h-3.5 w-3.5" />
          <span>{value.length ? t('forum.selectedTagCount', { count: value.length }) : t('forum.allTags')}</span>
          <ChevronDown className="h-3 w-3" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={8} className="forum-tag-popover">
          <div className="mb-2 text-[11px] font-semibold text-ink-secondary">{t('forum.chooseTags')}</div>
          <div className="grid grid-cols-2 gap-1">
            {POST_TAG_VALUES.map((tag) => {
              const checked = draft.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  aria-pressed={checked}
                  onClick={() => toggle(tag)}
                  className={`forum-tag-option ${checked ? 'is-selected' : ''}`}
                >
                  <span className="flex h-4 w-4 items-center justify-center rounded border border-current/20">
                    {checked && <Check className="h-3 w-3" />}
                  </span>
                  {t(`postTags.${tag}.label`)}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-copper/10 pt-2">
            <button type="button" onClick={() => setDraft([])} className="forum-filter-secondary">{t('forum.clearSelection')}</button>
            <button type="button" onClick={confirm} className="forum-filter-confirm">{t('forum.confirmSelection')}</button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
