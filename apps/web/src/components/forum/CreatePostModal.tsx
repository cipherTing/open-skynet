'use client';

import { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Eye, Search, Send } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import {
  MAX_POST_TAGS,
  MIN_POST_TAGS,
  POST_TAG_VALUES,
  type Circle,
  type ForumPost,
  type PostTag,
} from '@skynet/shared';
import { CircleSearchSelect } from '@/components/circle/CircleSearchSelect';
import { useAppForm } from '@/components/forms/skynet-form';
import { ComposerTextarea } from '@/components/ui/ComposerTextarea';
import { TerminalDialog } from '@/components/ui/TerminalDialog';
import { TButton } from '@/components/ui/terminal';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ApiError, forumApi } from '@/lib/api';
import { notifyProgressionUpdated } from '@/lib/progression-events';

interface CreatePostModalProps {
  onClose: () => void;
  onCreated: (created: ForumPost) => void;
  initialCircle?: Circle;
}

const POST_TITLE_MAX_LENGTH = 200;
const POST_CONTENT_MAX_LENGTH = 50_000;
const SIMILAR_POST_MIN_TITLE_LENGTH = 4;
const SIMILAR_POST_DEBOUNCE_MS = 350;

function normalizePostTags(values: string[]): PostTag[] {
  return POST_TAG_VALUES.filter((tag) => values.includes(tag)).slice(0, MAX_POST_TAGS);
}

export function CreatePostModal({ onClose, onCreated, initialCircle }: CreatePostModalProps) {
  const { t } = useTranslation();
  const formId = useId();
  const [selectedCircle, setSelectedCircle] = useState<Circle | null>(initialCircle ?? null);
  const [titleForSearch, setTitleForSearch] = useState('');
  const [debouncedTitle, setDebouncedTitle] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [error, setError] = useState('');
  const [reviewPending, setReviewPending] = useState(false);
  const form = useAppForm({
    defaultValues: {
      title: '',
      content: '',
      circleId: initialCircle?.id ?? '',
      tags: [] as PostTag[],
    },
    validators: {
      onSubmit: z.object({
        title: z.string().trim().min(1, t('createPost.titleRequired')).max(POST_TITLE_MAX_LENGTH),
        content: z
          .string()
          .trim()
          .min(1, t('createPost.titleRequired'))
          .max(POST_CONTENT_MAX_LENGTH),
        circleId: z.string().min(1, t('createPost.circleRequired')),
        tags: z
          .array(z.enum(POST_TAG_VALUES))
          .min(
            MIN_POST_TAGS,
            t('createPost.tagsRequired', { min: MIN_POST_TAGS, max: MAX_POST_TAGS }),
          )
          .max(
            MAX_POST_TAGS,
            t('createPost.tagsRequired', { min: MIN_POST_TAGS, max: MAX_POST_TAGS }),
          ),
      }),
    },
    onSubmit: async ({ value }) => {
      setError('');
      try {
        const result = await forumApi.createPost({
          title: value.title.trim(),
          content: value.content.trim(),
          circleId: value.circleId,
          tags: value.tags,
        });
        notifyProgressionUpdated();
        if (result.outcome === 'PENDING_REVIEW') {
          setReviewPending(true);
          return;
        }
        onCreated(result.post);
      } catch (requestError) {
        setError(
          requestError instanceof ApiError ? requestError.message : t('createPost.createFailed'),
        );
      }
    },
  });

  useEffect(() => {
    const normalizedTitle = titleForSearch.trim().replace(/\s+/gu, ' ');
    const timer = window.setTimeout(() => {
      setDebouncedTitle(
        normalizedTitle.length >= SIMILAR_POST_MIN_TITLE_LENGTH ? normalizedTitle : '',
      );
    }, SIMILAR_POST_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [titleForSearch]);

  const similarPostsQuery = useQuery({
    queryKey: ['forum', 'similar-posts', debouncedTitle, selectedCircle?.id ?? 'all'],
    queryFn: ({ signal }) =>
      forumApi.listSimilarPosts({ title: debouncedTitle, circleId: selectedCircle?.id }, signal),
    enabled: debouncedTitle.length >= SIMILAR_POST_MIN_TITLE_LENGTH,
    staleTime: 30_000,
  });

  return (
    <form.Subscribe selector={(state) => state.isSubmitting}>
      {(isSubmitting) => (
        <TerminalDialog
          open
          onOpenChange={(nextOpen) => {
            if (!nextOpen) onClose();
          }}
          title={t('forumDialogs.createPostTitle')}
          description={t('createPost.dialogDescription')}
          code="COMPOSE.POST"
          size="lg"
          busy={isSubmitting}
          contentClassName="t-corner !fixed"
          footer={
            reviewPending ? undefined : (
              <form.Subscribe selector={(state) => [state.values, state.isSubmitting] as const}>
                {([values, submitting]) => (
                  <>
                    <TButton
                      type="button"
                      variant="secondary"
                      disabled={submitting}
                      onClick={onClose}
                    >
                      {t('app.cancel')}
                    </TButton>
                    <TButton
                      type="submit"
                      form={formId}
                      disabled={
                        submitting ||
                        !values.title.trim() ||
                        !values.content.trim() ||
                        !values.circleId ||
                        values.tags.length < MIN_POST_TAGS
                      }
                    >
                      <Send className="h-3 w-3" />
                      {submitting ? t('createPost.submitting') : t('createPost.submit')}
                    </TButton>
                  </>
                )}
              </form.Subscribe>
            )
          }
        >
          {reviewPending ? (
            <div className="py-6 text-center">
              <div className="text-base font-semibold text-text-primary">
                {t('createPost.reviewPendingTitle')}
              </div>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-text-secondary">
                {t('createPost.reviewPendingDescription')}
              </p>
              <TButton type="button" className="mt-6" onClick={onClose}>
                {t('app.close')}
              </TButton>
            </div>
          ) : (
            <form
              id={formId}
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void form.handleSubmit();
              }}
            >
              <form.AppForm>
                {error ? (
                  <div
                    role="alert"
                    className="border border-danger/30 border-l-2 border-l-danger bg-danger/10 px-3 py-2 text-[12px] text-danger"
                  >
                    {error}
                  </div>
                ) : null}

                <form.AppField name="circleId">
                  {(field) => (
                    <div>
                      <label className="mb-1.5 block font-mono text-[11px] tracking-[0.12em] text-text-secondary">
                        {t('createPost.circle')}
                      </label>
                      <CircleSearchSelect
                        selectedCircle={selectedCircle}
                        onSelect={(circle) => {
                          setSelectedCircle(circle);
                          field.handleChange(circle.id);
                        }}
                        disabled={isSubmitting}
                      />
                    </div>
                  )}
                </form.AppField>

                <form.AppField name="title">
                  {(field) => (
                    <field.InputField
                      label={t('createPost.postTitle')}
                      placeholder={t('createPost.titlePlaceholder')}
                      maxLength={POST_TITLE_MAX_LENGTH}
                      onValueChange={setTitleForSearch}
                    />
                  )}
                </form.AppField>

                <form.AppField name="tags">
                  {(field) => (
                    <div>
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <label className="font-mono text-[11px] tracking-[0.12em] text-text-secondary">
                          {t('createPost.tags')}
                        </label>
                        <span className="font-mono text-[11px] tabular-nums text-text-tertiary">
                          {t('createPost.tagCount', {
                            count: field.state.value.length,
                            max: MAX_POST_TAGS,
                          })}
                        </span>
                      </div>
                      <ToggleGroup
                        type="multiple"
                        value={field.state.value}
                        onValueChange={(values) => field.handleChange(normalizePostTags(values))}
                        className="grid w-full grid-cols-1 border-0 bg-transparent sm:grid-cols-2"
                      >
                        {POST_TAG_VALUES.map((tag) => {
                          const selected = field.state.value.includes(tag);
                          const disabled = !selected && field.state.value.length >= MAX_POST_TAGS;
                          return (
                            <ToggleGroupItem
                              key={tag}
                              value={tag}
                              disabled={disabled || isSubmitting}
                              className="min-h-14 w-full items-start border border-border px-3 py-2 text-left normal-case tracking-normal data-[state=on]:border-accent data-[state=on]:bg-accent-muted"
                            >
                              <span>
                                <span className="block font-mono text-[11px] tracking-[0.08em]">
                                  {t(`postTags.${tag}.label`)}
                                </span>
                                <span className="mt-0.5 block text-[11px] leading-4 text-text-tertiary">
                                  {t(`postTags.${tag}.description`)}
                                </span>
                              </span>
                            </ToggleGroupItem>
                          );
                        })}
                      </ToggleGroup>
                    </div>
                  )}
                </form.AppField>

                {debouncedTitle ? (
                  <div className="border border-border bg-surface-1 p-3">
                    <div className="flex items-center gap-2 font-mono text-[11px] tracking-[0.12em] text-text-secondary">
                      <Search className="h-3.5 w-3.5 text-info" />
                      {t('createPost.similarPosts')}
                    </div>
                    {similarPostsQuery.isFetching ? (
                      <p className="mt-2 text-[11px] text-text-tertiary">
                        {t('createPost.searchingSimilar')}
                      </p>
                    ) : similarPostsQuery.isError ? (
                      <p className="mt-2 text-[11px] text-danger">
                        {t('createPost.similarFailed')}
                      </p>
                    ) : similarPostsQuery.data?.length ? (
                      <div className="mt-2 space-y-1.5">
                        {similarPostsQuery.data.map((item) => (
                          <Link
                            key={item.id}
                            href={`/post/${item.id}`}
                            className="block border border-transparent px-2 py-1.5 text-xs text-text-secondary transition-colors hover:border-info/30 hover:bg-info/5 hover:text-info"
                          >
                            <span className="font-semibold">{item.title}</span>
                            <span className="ml-2 font-mono text-[10px] text-text-tertiary">
                              /{item.circle.name}
                            </span>
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-[11px] text-text-tertiary">
                        {t('createPost.noSimilarPosts')}
                      </p>
                    )}
                  </div>
                ) : null}

                <form.AppField name="content">
                  {(field) => (
                    <div>
                      <div className="mb-1.5 flex items-center justify-between">
                        <label
                          htmlFor="create-post-content"
                          className="font-mono text-[11px] tracking-[0.12em] text-text-secondary"
                        >
                          {t('createPost.content')}
                        </label>
                        <button
                          type="button"
                          onClick={() => setShowPreview((current) => !current)}
                          className={`flex items-center gap-1 font-mono text-[11px] tracking-wide transition-colors ${showPreview ? 'text-info' : 'text-text-tertiary hover:text-info'}`}
                        >
                          <Eye className="h-3 w-3" />
                          {showPreview ? t('createPost.edit') : t('createPost.preview')}
                        </button>
                      </div>
                      {showPreview ? (
                        <div className="min-h-[200px] border border-border bg-surface-3 px-3 py-2.5">
                          <div className="prose-deck text-[14px]">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {field.state.value || t('createPost.emptyPreview')}
                            </ReactMarkdown>
                          </div>
                        </div>
                      ) : (
                        <ComposerTextarea
                          id="create-post-content"
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(event) => field.handleChange(event.target.value)}
                          placeholder={t('createPost.markdownPlaceholder')}
                          maxLength={POST_CONTENT_MAX_LENGTH}
                          rows={8}
                          variant="framed"
                        />
                      )}
                    </div>
                  )}
                </form.AppField>
              </form.AppForm>
            </form>
          )}
        </TerminalDialog>
      )}
    </form.Subscribe>
  );
}
