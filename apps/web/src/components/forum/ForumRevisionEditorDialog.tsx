'use client';

import { useId, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { MAX_POST_TAGS, MIN_POST_TAGS, POST_TAG_VALUES, type PostTag } from '@skynet/shared';
import { useAppForm } from '@/components/forms/skynet-form';
import { ComposerTextarea } from '@/components/ui/ComposerTextarea';
import { TerminalDialog } from '@/components/ui/TerminalDialog';
import { TButton } from '@/components/ui/terminal';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

const POST_TITLE_MAX_LENGTH = 200;
const REVISION_CONTENT_MAX_LENGTH = 50_000;
const HIDE_REASON_MIN_LENGTH = 4;
const HIDE_REASON_MAX_LENGTH = 280;

interface RevisionFormValues {
  title: string;
  content: string;
  tags: PostTag[];
  hidePreviousVersion: boolean;
  hideReason: string;
}

export type RevisionSubmission = RevisionFormValues;

interface ForumRevisionEditorDialogProps {
  kind: 'post' | 'reply';
  open: boolean;
  initialTitle?: string;
  initialContent: string;
  initialTags?: PostTag[];
  onOpenChange: (open: boolean) => void;
  onSave: (values: RevisionSubmission) => Promise<void>;
}

function normalizePostTags(values: string[]): PostTag[] {
  return POST_TAG_VALUES.filter((tag) => values.includes(tag)).slice(0, MAX_POST_TAGS);
}

export function ForumRevisionEditorDialog({
  kind,
  open,
  initialTitle = '',
  initialContent,
  initialTags = [],
  onOpenChange,
  onSave,
}: ForumRevisionEditorDialogProps) {
  const { t } = useTranslation();
  const formId = useId();
  const [formError, setFormError] = useState('');
  const isPost = kind === 'post';
  const form = useAppForm({
    defaultValues: {
      title: initialTitle,
      content: initialContent,
      tags: initialTags,
      hidePreviousVersion: false,
      hideReason: '',
    },
    validators: {
      onSubmit: z
        .object({
          title: z.string().max(POST_TITLE_MAX_LENGTH),
          content: z
            .string()
            .trim()
            .min(1, t('revisions.contentRequired'))
            .max(REVISION_CONTENT_MAX_LENGTH),
          tags: z.array(z.enum(POST_TAG_VALUES)),
          hidePreviousVersion: z.boolean(),
          hideReason: z.string().max(HIDE_REASON_MAX_LENGTH),
        })
        .superRefine((value, context) => {
          if (isPost && !value.title.trim()) {
            context.addIssue({
              code: 'custom',
              path: ['title'],
              message: t('revisions.titleRequired'),
            });
          }
          if (isPost && (value.tags.length < MIN_POST_TAGS || value.tags.length > MAX_POST_TAGS)) {
            context.addIssue({
              code: 'custom',
              path: ['tags'],
              message: t('createPost.tagsRequired', {
                min: MIN_POST_TAGS,
                max: MAX_POST_TAGS,
              }),
            });
          }
          if (
            value.hidePreviousVersion &&
            value.hideReason.trim().length < HIDE_REASON_MIN_LENGTH
          ) {
            context.addIssue({
              code: 'custom',
              path: ['hideReason'],
              message: t('revisions.hideReasonRequired'),
            });
          }
        }),
    },
    onSubmit: async ({ value }) => {
      setFormError('');
      try {
        await onSave({
          ...value,
          title: value.title.trim(),
          content: value.content.trim(),
          hideReason: value.hideReason.trim(),
        });
      } catch (error) {
        setFormError(error instanceof Error ? error.message : t('revisions.saveFailed'));
      }
    },
  });

  return (
    <form.Subscribe selector={(state) => [state.isSubmitting, state.canSubmit] as const}>
      {([isSubmitting, canSubmit]) => (
        <TerminalDialog
          open={open}
          onOpenChange={(nextOpen) => {
            if (!isSubmitting) onOpenChange(nextOpen);
          }}
          title={t(isPost ? 'revisions.editPost' : 'revisions.editReply')}
          description={t(
            isPost ? 'revisions.editPostDescription' : 'revisions.editReplyDescription',
          )}
          code={isPost ? 'EDIT.POST' : 'EDIT.REPLY'}
          size={isPost ? 'xl' : 'lg'}
          busy={isSubmitting}
          contentClassName="t-corner !fixed"
          footer={
            <>
              <TButton
                type="button"
                variant="secondary"
                disabled={isSubmitting}
                onClick={() => onOpenChange(false)}
              >
                {t('app.cancel')}
              </TButton>
              <TButton
                type="submit"
                form={formId}
                variant="primary"
                disabled={!canSubmit || isSubmitting}
              >
                {isSubmitting ? t('revisions.saving') : t('revisions.save')}
              </TButton>
            </>
          }
        >
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
              {formError ? (
                <p
                  role="alert"
                  className="border border-danger/30 border-l-2 border-l-danger bg-danger/10 px-3 py-2 text-xs text-danger"
                >
                  {formError}
                </p>
              ) : null}

              {isPost ? (
                <form.AppField name="title">
                  {(field) => (
                    <field.InputField
                      label={t('createPost.postTitle')}
                      maxLength={POST_TITLE_MAX_LENGTH}
                    />
                  )}
                </form.AppField>
              ) : null}

              {isPost ? (
                <form.AppField name="tags">
                  {(field) => (
                    <div>
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <span className="font-sans text-[12px] tracking-normal text-text-secondary">
                          {t('createPost.tags')}
                        </span>
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
                                <span className="block font-sans text-[12px] tracking-normal">
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
              ) : null}

              <form.AppField name="content">
                {(field) => (
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label
                        htmlFor={`${formId}-content`}
                        className="mb-2 block font-sans text-[12px] tracking-normal text-text-secondary"
                      >
                        {t('revisions.newContent')}
                      </label>
                      <ComposerTextarea
                        id={`${formId}-content`}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(event) => field.handleChange(event.target.value)}
                        maxLength={REVISION_CONTENT_MAX_LENGTH}
                        rows={isPost ? 14 : 12}
                        variant="framed"
                      />
                    </div>
                    <div>
                      <p className="mb-2 font-sans text-[12px] tracking-normal text-text-secondary">
                        {t('createPost.preview')}
                      </p>
                      <div className="prose-deck min-h-[276px] border border-border bg-surface-3 px-4 py-3 text-sm">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
                          {field.state.value || t('createPost.emptyPreview')}
                        </ReactMarkdown>
                      </div>
                    </div>
                  </div>
                )}
              </form.AppField>

              <form.AppField name="hidePreviousVersion">
                {(field) => (
                  <field.CheckboxField
                    label={t('revisions.hidePrevious')}
                    description={t('revisions.hidePreviousHint')}
                  />
                )}
              </form.AppField>

              <form.Subscribe selector={(state) => state.values.hidePreviousVersion}>
                {(hidePreviousVersion) =>
                  hidePreviousVersion ? (
                    <form.AppField name="hideReason">
                      {(field) => (
                        <field.InputField
                          label={t('revisions.hideReason')}
                          maxLength={HIDE_REASON_MAX_LENGTH}
                        />
                      )}
                    </form.AppField>
                  ) : null
                }
              </form.Subscribe>
            </form.AppForm>
          </form>
        </TerminalDialog>
      )}
    </form.Subscribe>
  );
}
