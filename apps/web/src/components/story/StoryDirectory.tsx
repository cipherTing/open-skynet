'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowUpRight, FilePlus2, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/layout/PageHeader';
import { ErrorState, InlineLoading } from '@/components/ui/LoadingState';
import { TerminalDialog } from '@/components/ui/TerminalDialog';
import { TButton, TInput, TTag, TTextarea } from '@/components/ui/terminal';
import { filterStories, STORY_STAGES, type StoryStage } from './story-workflow';
import type { CreateStoryInput, StoryItem } from './story-types';

interface StoryDirectoryProps {
  stories: StoryItem[];
  isLoading: boolean;
  isLoadingMore?: boolean;
  error?: boolean;
  canCreate?: boolean;
  hasNextPage?: boolean;
  onRetry?: () => void;
  onLoadMore?: () => void;
  onRequireAuthentication?: () => void;
  onFilterChange?: (filter: { query: string; stage: StoryStage | 'ALL' }) => void;
  onCreateStory: (input: CreateStoryInput) => void | Promise<void>;
}

const EMPTY_CREATE_STORY: CreateStoryInput = {
  title: '',
  premise: '',
  genre: '',
  tone: '',
  viewpoint: '',
  targetLength: '',
  establishedDirection: '',
  openQuestions: [],
};

function formatUpdatedAt(value: string, language: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat(language.startsWith('zh') ? 'zh-CN' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function StoryDirectory({
  stories,
  isLoading,
  isLoadingMore = false,
  error = false,
  canCreate = true,
  hasNextPage = false,
  onRetry,
  onLoadMore,
  onRequireAuthentication,
  onFilterChange,
  onCreateStory,
}: StoryDirectoryProps) {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState('');
  const [stage, setStage] = useState<StoryStage | 'ALL'>('ALL');
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState<CreateStoryInput>(EMPTY_CREATE_STORY);
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const visibleStories = useMemo(
    () => filterStories(stories, { query, stage }),
    [stories, query, stage],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => onFilterChange?.({ query: query.trim(), stage }), 250);
    return () => window.clearTimeout(timer);
  }, [query, stage, onFilterChange]);

  const openCreateDialog = () => {
    if (!canCreate) {
      onRequireAuthentication?.();
      return;
    }
    setCreateOpen(true);
  };

  const submitStory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const input = {
      title: draft.title.trim(),
      premise: draft.premise.trim(),
      genre: draft.genre.trim(),
      tone: draft.tone.trim(),
      viewpoint: draft.viewpoint.trim(),
      targetLength: draft.targetLength.trim(),
      establishedDirection: draft.establishedDirection.trim(),
      openQuestions: draft.openQuestions.map((question) => question.trim()).filter(Boolean),
    };
    if (!input.title) {
      setFormError(t('story.create.titleRequired'));
      return;
    }
    if (!input.premise) {
      setFormError(t('story.create.premiseRequired'));
      return;
    }

    setFormError('');
    setIsSubmitting(true);
    try {
      await onCreateStory(input);
      setDraft(EMPTY_CREATE_STORY);
      setCreateOpen(false);
    } catch {
      setFormError(t('story.workspace.loadFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <PageHeader titleKey="story.directory.title" />
      <main className="skynet-auto-hide-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-10">
        <div className="mx-auto max-w-6xl">
          <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-3xl">
              <p className="mb-2 font-mono text-[10px] tracking-[0.08em] text-[var(--t-faint)]">
                STORY COMMONS // OPEN WORKSPACE
              </p>
              <h1 className="text-2xl font-semibold text-white">{t('story.directory.title')}</h1>
              <p className="mt-2 max-w-2xl font-sans text-[13px] leading-6 text-[var(--t-sub)]">
                {t('story.directory.subtitle')}
              </p>
            </div>
            <TButton variant="primary" onClick={openCreateDialog}>
              <FilePlus2 className="h-3.5 w-3.5" />
              {t('story.directory.create')}
            </TButton>
          </div>

          <div className="mb-3 flex flex-wrap items-end gap-3 border-b border-[var(--t-noise)] pb-4">
            <label className="min-w-[220px] flex-1">
              <span className="mb-1.5 block font-sans text-[11px] font-medium text-[var(--t-sub)]">
                {t('story.directory.searchLabel')}
              </span>
              <span className="relative block">
                <Search
                  aria-hidden="true"
                  className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--t-faint)]"
                />
                <TInput
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t('story.directory.searchPlaceholder')}
                  className="pl-9"
                />
              </span>
            </label>
            <label className="min-w-[180px]">
              <span className="mb-1.5 block font-sans text-[11px] font-medium text-[var(--t-sub)]">
                {t('story.directory.stageLabel')}
              </span>
              <select
                value={stage}
                onChange={(event) => setStage(event.target.value as StoryStage | 'ALL')}
                className="skynet-input h-10 w-full px-3 font-sans text-[13px]"
                aria-label={t('story.directory.stageLabel')}
              >
                <option value="ALL">{t('story.directory.allStages')}</option>
                {STORY_STAGES.map((item) => (
                  <option key={item} value={item}>
                    {t(`story.stages.${item}`)}
                  </option>
                ))}
              </select>
            </label>
            <p className="pb-2 font-mono text-[10px] text-[var(--t-faint)]">
              {t('story.directory.storyCount', { count: visibleStories.length })}
            </p>
          </div>

          {isLoading ? (
            <InlineLoading label={t('story.workspace.loading')} />
          ) : error ? (
            <ErrorState
              title={t('story.workspace.loadFailed')}
              message={t('story.workspace.loadFailed')}
              actionLabel={t('app.retry')}
              onAction={onRetry}
            />
          ) : visibleStories.length === 0 ? (
            <div className="flex min-h-56 flex-col items-center justify-center border-b border-[var(--t-noise)] px-4 text-center">
              <p className="font-sans text-[13px] text-[var(--t-sub)]">
                {stories.length === 0 ? t('story.directory.empty') : t('story.directory.noResults')}
              </p>
              {stories.length === 0 ? (
                <TButton className="mt-4" variant="secondary" onClick={openCreateDialog}>
                  <FilePlus2 className="h-3.5 w-3.5" />
                  {t('story.directory.createFirst')}
                </TButton>
              ) : null}
            </div>
          ) : (
            <div role="list" aria-label={t('story.directory.title')}>
              {visibleStories.map((story) => (
                <Link
                  key={story.id}
                  href={`/stories/${encodeURIComponent(story.id)}`}
                  role="listitem"
                  className="group grid gap-3 border-b border-[var(--t-noise)] py-4 transition-colors hover:bg-white/[0.025] sm:grid-cols-[minmax(0,1fr)_220px] sm:gap-6"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="min-w-0 break-words text-[15px] font-semibold text-white group-hover:text-[var(--t-accent)]">
                        {story.title}
                      </h2>
                      <TTag color={story.stage === 'COMPLETED' ? 'default' : 'accent'}>
                        {t(`story.stages.${story.stage}`)}
                      </TTag>
                    </div>
                    <p className="mt-1.5 line-clamp-2 font-sans text-[13px] leading-6 text-[var(--t-sub)]">
                      {story.premise}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-sans text-[11px] text-[var(--t-faint)]">
                      {story.genre ? <span>{story.genre}</span> : null}
                      <span>{t('story.directory.files', { count: story.documentCount })}</span>
                      <span>
                        {t('story.directory.questions', { count: story.openQuestions.length })}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-end justify-between gap-3 sm:flex-col sm:items-end sm:justify-center">
                    <span className="font-sans text-[11px] text-[var(--t-faint)]">
                      {t('story.directory.updatedAt', {
                        time: formatUpdatedAt(story.updatedAt, i18n.language),
                      })}
                    </span>
                    <ArrowUpRight
                      aria-hidden="true"
                      className="h-4 w-4 shrink-0 text-[var(--t-faint)] transition-colors group-hover:text-[var(--t-accent)]"
                    />
                  </div>
                </Link>
              ))}
            </div>
          )}

          {!isLoading && !error && hasNextPage ? (
            <div className="flex justify-center border-b border-[var(--t-noise)] py-5">
              <TButton variant="secondary" disabled={isLoadingMore} onClick={onLoadMore}>
                {isLoadingMore ? t('story.directory.loadingMore') : t('story.directory.loadMore')}
              </TButton>
            </div>
          ) : null}
        </div>
      </main>

      <TerminalDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title={t('story.create.title')}
        description={t('story.create.description')}
        code="STORY.OPEN"
        size="lg"
        busy={isSubmitting}
        footer={
          <>
            <TButton
              variant="secondary"
              disabled={isSubmitting}
              onClick={() => setCreateOpen(false)}
            >
              {t('app.cancel')}
            </TButton>
            <TButton
              variant="primary"
              disabled={isSubmitting}
              type="submit"
              form="create-story-form"
            >
              {isSubmitting ? t('story.workspace.editor.saving') : t('story.create.submit')}
            </TButton>
          </>
        }
      >
        <form
          id="create-story-form"
          className="space-y-4"
          onSubmit={(event) => void submitStory(event)}
        >
          <FormField label={t('story.create.storyTitle')} required>
            <TInput
              value={draft.title}
              onChange={(event) =>
                setDraft((current) => ({ ...current, title: event.target.value }))
              }
              placeholder={t('story.create.titlePlaceholder')}
              maxLength={120}
              autoFocus
            />
          </FormField>
          <FormField label={t('story.create.premise')} required>
            <TTextarea
              value={draft.premise}
              onChange={(event) =>
                setDraft((current) => ({ ...current, premise: event.target.value }))
              }
              placeholder={t('story.create.premisePlaceholder')}
              rows={2}
              maxLength={500}
            />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={t('story.create.genre')}>
              <TInput
                value={draft.genre}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, genre: event.target.value }))
                }
                placeholder={t('story.create.genrePlaceholder')}
              />
            </FormField>
            <FormField label={t('story.create.tone')}>
              <TInput
                value={draft.tone}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, tone: event.target.value }))
                }
                placeholder={t('story.create.tonePlaceholder')}
              />
            </FormField>
            <FormField label={t('story.create.pointOfView')}>
              <TInput
                value={draft.viewpoint}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, viewpoint: event.target.value }))
                }
                placeholder={t('story.create.pointOfViewPlaceholder')}
              />
            </FormField>
          </div>
          <FormField label={t('story.create.targetLength')}>
            <TInput
              value={draft.targetLength}
              onChange={(event) =>
                setDraft((current) => ({ ...current, targetLength: event.target.value }))
              }
              placeholder={t('story.create.targetLengthPlaceholder')}
            />
          </FormField>
          <FormField label={t('story.create.descriptionLabel')}>
            <TTextarea
              value={draft.establishedDirection}
              onChange={(event) =>
                setDraft((current) => ({ ...current, establishedDirection: event.target.value }))
              }
              placeholder={t('story.create.descriptionPlaceholder')}
              rows={3}
            />
          </FormField>
          <FormField label={t('story.create.openQuestions')}>
            <TTextarea
              value={draft.openQuestions.join('\n')}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  openQuestions: event.target.value.split('\n'),
                }))
              }
              placeholder={t('story.create.openQuestionsPlaceholder')}
              rows={2}
            />
          </FormField>
          {formError ? (
            <p role="alert" className="font-sans text-[12px] text-[var(--t-hazard)]">
              {formError}
            </p>
          ) : null}
        </form>
      </TerminalDialog>
    </div>
  );
}

function FormField({
  label,
  required = false,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="font-sans text-[11px] font-medium text-[var(--t-sub)]">
        {label}
        {required ? <span className="ml-1 text-[var(--t-signal)]">*</span> : null}
      </span>
      {children}
    </label>
  );
}
