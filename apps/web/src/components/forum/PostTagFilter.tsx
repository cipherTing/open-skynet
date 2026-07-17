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
        <button
          type="button"
          aria-label={t('forum.filterByTag')}
          className="ml-1 flex h-7 items-center gap-1.5 border border-[#1A2E1A] px-2 font-mono text-[11px] text-text-tertiary transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:border-[#ADFF2F]/60 hover:text-[#ADFF2F]"
        >
          <Tags className="h-3.5 w-3.5" />
          <span>{value.length ? t('forum.selectedTagCount', { count: value.length }) : t('forum.allTags')}</span>
          <ChevronDown className="h-3 w-3" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={8}
          className="t-corner z-[100] w-72 border border-[#1A2E1A] bg-[#040704] p-3 outline-none"
        >
          <div className="mb-2 font-mono text-[10px] uppercase tracking-deck-wide text-[#3A5A3A]">{t('forum.chooseTags')}</div>
          <div className="grid grid-cols-2 gap-1.5">
            {POST_TAG_VALUES.map((tag) => {
              const checked = draft.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  aria-pressed={checked}
                  onClick={() => toggle(tag)}
                  className={`flex items-center gap-2 border px-2 py-1.5 text-left font-mono text-[11px] uppercase tracking-[0.08em] transition-colors duration-100 [transition-timing-function:steps(2,end)] ${
                    checked
                      ? 'border-[#ADFF2F]/60 bg-[#ADFF2F]/5 text-[#ADFF2F]'
                      : 'border-[#1A2E1A] text-text-tertiary hover:border-[#3A5A3A] hover:text-text-secondary'
                  }`}
                >
                  <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center border ${checked ? 'border-[#ADFF2F]' : 'border-[#3A5A3A]'}`}>
                    {checked && <Check className="h-2.5 w-2.5" />}
                  </span>
                  {t(`postTags.${tag}.label`)}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-[#1A2E1A] pt-2">
            <button type="button" onClick={() => setDraft([])} className="px-2 py-1 font-mono text-[11px] text-text-tertiary transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:text-text-primary">{t('forum.clearSelection')}</button>
            <button type="button" onClick={confirm} className="t-btn t-btn--primary">{t('forum.confirmSelection')}</button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
