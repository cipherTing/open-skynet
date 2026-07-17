'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Edit3, History } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { useTranslation } from 'react-i18next';
import { MAX_POST_TAGS, POST_TAG_VALUES, type ForumPost, type PostTag } from '@skynet/shared';
import { ApiError, forumApi } from '@/lib/api';
import { ComposerTextarea } from '@/components/ui/ComposerTextarea';
import { TerminalDialog } from '@/components/ui/TerminalDialog';
import { TSkeleton, Timecode } from '@/components/ui/terminal';
import { PostTags } from './PostTags';

interface PostRevisionActionsProps {
  post: ForumPost;
  canEdit: boolean;
  onUpdated: () => Promise<void>;
}

const FIELD_LABEL_CLASS = 'font-mono text-[11px] tracking-[0.12em] text-text-secondary';

export function PostRevisionActions({ post, canEdit, onUpdated }: PostRevisionActionsProps) {
  const { t } = useTranslation();
  const [editOpen, setEditOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [title, setTitle] = useState(post.title);
  const [content, setContent] = useState(post.content);
  const [tags, setTags] = useState<PostTag[]>(post.tags);
  const [hidePreviousVersion, setHidePreviousVersion] = useState(false);
  const [hideReason, setHideReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const openEditor = () => {
    setTitle(post.title);
    setContent(post.content);
    setTags(post.tags);
    setHidePreviousVersion(false);
    setHideReason('');
    setError('');
    setEditOpen(true);
  };

  const historyQuery = useQuery({
    queryKey: ['forum', 'post-revisions', post.id, post.contentVersion],
    queryFn: () => forumApi.listPostRevisions(post.id),
    enabled: historyOpen,
  });

  const toggleTag = (tag: PostTag) => {
    setTags((current) => {
      if (current.includes(tag))
        return current.length === 1 ? current : current.filter((item) => item !== tag);
      return current.length >= MAX_POST_TAGS ? current : [...current, tag];
    });
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      await forumApi.revisePost(post.id, {
        expectedVersion: post.contentVersion,
        title: title.trim(),
        content,
        tags,
        hidePreviousVersion,
        ...(hidePreviousVersion ? { hideReason: hideReason.trim() } : {}),
      });
      await onUpdated();
      setEditOpen(false);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('revisions.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px]">
      {post.contentVersion > 1 ? (
        <button
          type="button"
          onClick={() => setHistoryOpen(true)}
          className="inline-flex items-center gap-1 text-text-tertiary transition-colors hover:text-info"
        >
          <History className="h-3.5 w-3.5" />
          {t('revisions.editedVersion', { version: post.contentVersion })}
        </button>
      ) : null}
      {canEdit ? (
        <button
          type="button"
          onClick={openEditor}
          className="inline-flex items-center gap-1 text-text-tertiary transition-colors hover:text-accent"
        >
          <Edit3 className="h-3.5 w-3.5" />
          {t('revisions.editPost')}
        </button>
      ) : null}

      <TerminalDialog
        open={editOpen}
        onOpenChange={(open) => {
          if (saving) return;
          if (open) openEditor();
          else setEditOpen(false);
        }}
        title={t('revisions.editPost')}
        code="EDIT.POST"
        size="xl"
        contentClassName="t-corner !fixed"
        footer={
          <>
            <button
              type="button"
              onClick={() => setEditOpen(false)}
              disabled={saving}
              className="t-btn t-btn--ghost"
            >
              {t('app.cancel')}
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={
                saving ||
                !title.trim() ||
                !content.trim() ||
                (hidePreviousVersion && hideReason.trim().length < 4)
              }
              className="t-btn t-btn--primary"
            >
              {saving ? t('revisions.saving') : t('revisions.save')}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <label className={`block ${FIELD_LABEL_CLASS}`}>
            {t('createPost.postTitle')}
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={200}
              className="skynet-input mt-2 w-full px-3 py-2.5 text-sm"
            />
          </label>
          <div>
            <p className={FIELD_LABEL_CLASS}>{t('createPost.tags')}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {POST_TAG_VALUES.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  aria-pressed={tags.includes(tag)}
                  onClick={() => toggleTag(tag)}
                  className={`border px-2.5 py-1 font-mono text-[11px] tracking-[0.08em] transition-colors ${
                    tags.includes(tag)
                      ? 'border-accent bg-accent-muted text-accent'
                      : 'border-border text-text-tertiary hover:border-accent/40 hover:text-text-secondary'
                  }`}
                >
                  {t(`postTags.${tag}.label`)}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className={`mb-2 ${FIELD_LABEL_CLASS}`}>{t('revisions.newContent')}</p>
              <ComposerTextarea
                value={content}
                onChange={(event) => setContent(event.target.value)}
                rows={14}
                variant="framed"
              />
            </div>
            <div>
              <p className={`mb-2 ${FIELD_LABEL_CLASS}`}>{t('createPost.preview')}</p>
              <div className="prose-deck min-h-[320px] border border-border bg-surface-3 px-4 py-3 text-sm">
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
                  {content || t('createPost.emptyPreview')}
                </ReactMarkdown>
              </div>
            </div>
          </div>
          <label className="flex items-start gap-2 border border-border px-3 py-2.5 text-xs text-text-secondary">
            <input
              type="checkbox"
              checked={hidePreviousVersion}
              onChange={(event) => setHidePreviousVersion(event.target.checked)}
              className="mt-0.5"
            />
            <span>
              <strong className="block text-text-primary">{t('revisions.hidePrevious')}</strong>
              {t('revisions.hidePreviousHint')}
            </span>
          </label>
          {hidePreviousVersion ? (
            <label className={`block ${FIELD_LABEL_CLASS}`}>
              {t('revisions.hideReason')}
              <input
                value={hideReason}
                onChange={(event) => setHideReason(event.target.value)}
                maxLength={280}
                className="skynet-input mt-2 w-full px-3 py-2.5 text-sm"
              />
            </label>
          ) : null}
          {error ? (
            <p
              role="alert"
              className="border border-danger/30 border-l-2 border-l-danger bg-danger/10 px-3 py-2 text-xs text-danger"
            >
              {error}
            </p>
          ) : null}
        </div>
      </TerminalDialog>

      <TerminalDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        title={t('revisions.postHistory')}
        code="HISTORY.POST"
        size="lg"
        contentClassName="t-corner !fixed"
      >
        <div className="space-y-3">
          {historyQuery.isPending ? (
            <div role="status" aria-label={t('revisions.loading')}>
              <TSkeleton rows={4} />
            </div>
          ) : null}
          {historyQuery.data?.items.map((revision) => (
            <article key={revision.version} className="border border-border bg-surface-1 p-4">
              <div className="flex items-center justify-between gap-3">
                <strong className="font-mono text-[11px] tracking-[0.12em] text-info">
                  {t('revisions.version', { version: revision.version })}
                </strong>
                <Timecode date={revision.createdAt} withDate />
              </div>
              {revision.content === null ? (
                <p className="mt-3 border border-danger/25 bg-danger/5 px-3 py-2 text-xs text-danger">
                  {t('revisions.hiddenContent', {
                    reason: revision.publicContentHideReason ?? t('revisions.hiddenReasonFallback'),
                  })}
                </p>
              ) : (
                <>
                  <h3 className="mt-2 text-sm font-semibold text-text-primary">{revision.title}</h3>
                  {revision.tags ? (
                    <div className="mt-2">
                      <PostTags tags={revision.tags} compact />
                    </div>
                  ) : null}
                  <div className="prose-deck mt-3 text-sm">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
                      {revision.content}
                    </ReactMarkdown>
                  </div>
                </>
              )}
            </article>
          ))}
          {historyQuery.isError ? (
            <p className="text-xs text-danger">{t('revisions.loadFailed')}</p>
          ) : null}
        </div>
      </TerminalDialog>
    </div>
  );
}
