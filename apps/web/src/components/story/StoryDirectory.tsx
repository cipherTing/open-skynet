'use client';

import Link from 'next/link';
import { useDeferredValue, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/layout/PageHeader';
import { TTag } from '@/components/ui/terminal';
import { storyApi, STORY_PAGE_SIZE, type StoryApiPhase } from '@/lib/story-api';
import {
  StoryDate,
  StoryPager,
  StoryQueryStatus,
  StorySkillPrompt,
  useStoryPages,
} from './StoryPanels';

const phases: StoryApiPhase[] = [
  'opening',
  'setting',
  'planning',
  'serializing',
  'revising',
  'completed',
];

export function StoryDirectory() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [phase, setPhase] = useState<StoryApiPhase | ''>('');
  const query = useDeferredValue(search.trim());
  const stories = useStoryPages(['stories', query, phase], (cursor) =>
    storyApi.listStories({
      q: query.length >= 2 ? query : undefined,
      phase: phase || undefined,
      cursor,
      limit: STORY_PAGE_SIZE,
    }),
  );
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <PageHeader title={t('story.directory.title')} />
      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-6xl space-y-6">
          <header>
            <h1 className="text-2xl font-semibold text-white">{t('story.directory.title')}</h1>
            <p className="mt-3 max-w-3xl font-sans text-[13px] leading-7 text-[var(--t-sub)]">
              {t('story.directory.subtitle')}
            </p>
          </header>
          <StorySkillPrompt action="create" />
          <div className="flex flex-wrap gap-4 border-b border-[var(--t-noise)] pb-5">
            <label className="min-w-[220px] flex-1">
              <span className="mb-2 block text-[11px] text-[var(--t-sub)]">
                {t('story.directory.searchLabel')}
              </span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('story.directory.searchPlaceholder')}
                className="skynet-input h-10 w-full px-3 font-sans text-[12px]"
              />
            </label>
            <label className="min-w-[150px]">
              <span className="mb-2 block text-[11px] text-[var(--t-sub)]">
                {t('story.directory.stageLabel')}
              </span>
              <select
                value={phase}
                onChange={(event) => {
                  const next = phases.find((item) => item === event.target.value);
                  setPhase(next ?? '');
                }}
                className="skynet-input h-10 w-full px-3 font-sans text-[12px]"
              >
                <option value="">{t('story.directory.allStages')}</option>
                {phases.map((item) => (
                  <option key={item} value={item}>
                    {t('story.phases.' + item)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <StoryQueryStatus
            pending={stories.isPending}
            failed={stories.isError && !stories.data}
            retry={() => void stories.refetch()}
          >
            <ul className="divide-y divide-[var(--t-noise)]">
              {stories.data?.pages
                .flatMap((page) => page.items)
                .map((story) => (
                  <li key={story.id}>
                    <Link
                      href={'/stories/' + encodeURIComponent(story.id)}
                      className="block py-6 transition-colors hover:bg-white/[0.02]"
                    >
                      <div className="flex flex-wrap items-center gap-3">
                        <h2 className="break-words text-[16px] font-semibold text-white">
                          {story.title}
                        </h2>
                        <TTag color="accent">{t('story.phases.' + story.phase)}</TTag>
                      </div>
                      <p className="mt-3 break-words font-sans text-[13px] leading-7 text-[var(--t-sub)]">
                        {story.premise}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-5 font-sans text-[10px] text-[var(--t-faint)]">
                        {story.genre ? <span>{story.genre}</span> : null}
                        <span>
                          {t('story.directory.files', { count: story.documentCount ?? 0 })}
                        </span>
                        <span>
                          <StoryDate value={story.updatedAt} />
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
            </ul>
            {!stories.data?.pages.some((page) => page.items.length) ? (
              <p className="py-12 text-center font-sans text-[12px] text-[var(--t-faint)]">
                {t(query || phase ? 'story.directory.noResults' : 'story.directory.empty')}
              </p>
            ) : null}
            <StoryPager
              hasMore={stories.hasNextPage}
              loading={stories.isFetchingNextPage}
              failed={stories.isFetchNextPageError}
              load={() => void stories.fetchNextPage()}
            />
          </StoryQueryStatus>
        </div>
      </main>
    </div>
  );
}
