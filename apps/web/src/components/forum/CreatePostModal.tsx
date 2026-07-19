'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Eye, Send, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CircleSearchSelect } from '@/components/circle/CircleSearchSelect';
import { forumApi, ApiError } from '@/lib/api';
import { notifyProgressionUpdated } from '@/lib/progression-events';
import { ComposerTextarea } from '@/components/ui/ComposerTextarea';
import { TerminalDialog } from '@/components/ui/TerminalDialog';
import {
  MAX_POST_TAGS,
  MIN_POST_TAGS,
  POST_TAG_VALUES,
  type Circle,
  type ForumPost,
  type PostTag,
} from '@skynet/shared';

interface CreatePostModalProps {
  onClose: () => void;
  onCreated: (created: ForumPost) => void;
  initialCircle?: Circle;
}

const FIELD_LABEL_CLASS = 'block font-mono text-[11px] tracking-[0.12em] text-text-secondary';

export function CreatePostModal({ onClose, onCreated, initialCircle }: CreatePostModalProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [selectedTags, setSelectedTags] = useState<PostTag[]>([]);
  const [debouncedTitle, setDebouncedTitle] = useState('');
  const [selectedCircleOverride, setSelectedCircleOverride] = useState<Circle | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [reviewPending, setReviewPending] = useState(false);

  const selectedCircle = selectedCircleOverride ?? initialCircle ?? null;

  useEffect(() => {
    const normalizedTitle = title.trim().replace(/\s+/g, ' ');
    const timer = window.setTimeout(() => {
      setDebouncedTitle(normalizedTitle.length >= 4 ? normalizedTitle : '');
    }, 350);
    return () => window.clearTimeout(timer);
  }, [title]);

  const similarPostsQuery = useQuery({
    queryKey: ['forum', 'similar-posts', debouncedTitle, selectedCircle?.id ?? 'all'],
    queryFn: ({ signal }) =>
      forumApi.listSimilarPosts({ title: debouncedTitle, circleId: selectedCircle?.id }, signal),
    enabled: debouncedTitle.length >= 4,
    staleTime: 30_000,
  });

  const toggleTag = (tag: PostTag) => {
    setSelectedTags((current) => {
      if (current.includes(tag)) return current.filter((item) => item !== tag);
      if (current.length >= MAX_POST_TAGS) return current;
      return [...current, tag];
    });
  };

  const handleSubmit = useCallback(async () => {
    if (!title.trim() || !content.trim()) {
      setError(t('createPost.titleRequired'));
      return;
    }
    if (!selectedCircle) {
      setError(t('createPost.circleRequired'));
      return;
    }
    if (selectedTags.length < MIN_POST_TAGS || selectedTags.length > MAX_POST_TAGS) {
      setError(t('createPost.tagsRequired', { min: MIN_POST_TAGS, max: MAX_POST_TAGS }));
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const result = await forumApi.createPost({
        title: title.trim(),
        content: content.trim(),
        circleId: selectedCircle.id,
        tags: selectedTags,
      });
      notifyProgressionUpdated();
      if (result.outcome === 'PENDING_REVIEW') {
        setReviewPending(true);
        return;
      }
      onCreated(result.post);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError(t('createPost.createFailed'));
      }
    } finally {
      setSubmitting(false);
    }
  }, [title, content, selectedCircle, selectedTags, onCreated, t]);

  return (
    <TerminalDialog
      open
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
      title={t('forumDialogs.createPostTitle')}
      code="COMPOSE.POST"
      size="lg"
      contentClassName="t-corner !fixed"
      footer={
        reviewPending ? undefined : (
          <>
            <button type="button" onClick={onClose} className="t-btn t-btn--ghost">
              {t('app.cancel')}
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={
                submitting ||
                !title.trim() ||
                !content.trim() ||
                !selectedCircle ||
                selectedTags.length < MIN_POST_TAGS
              }
              className="t-btn t-btn--primary"
            >
              <Send className="h-3 w-3" />
              {submitting ? t('createPost.submitting') : t('createPost.submit')}
            </button>
          </>
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
          <button type="button" onClick={onClose} className="t-btn t-btn--primary mt-6">
            {t('app.close')}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* 错误提示 */}
          {error && (
            <div className="border border-danger/30 border-l-2 border-l-danger bg-danger/10 px-3 py-2 text-[12px] text-danger">
              {error}
            </div>
          )}

          {/* 所属圈子 */}
          <div>
            <label className={`${FIELD_LABEL_CLASS} mb-1.5`}>{t('createPost.circle')}</label>
            <CircleSearchSelect
              selectedCircle={selectedCircle}
              onSelect={setSelectedCircleOverride}
              disabled={submitting}
            />
          </div>

          {/* 帖子标题 */}
          <div>
            <label className={`${FIELD_LABEL_CLASS} mb-1.5`}>{t('createPost.postTitle')}</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('createPost.titlePlaceholder')}
              className="skynet-input w-full px-3 py-2.5 text-[14px]"
            />
          </div>

          {/* 帖子标签 */}
          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <label className={FIELD_LABEL_CLASS}>{t('createPost.tags')}</label>
              <span className="font-mono text-[11px] tabular-nums text-text-tertiary">
                {t('createPost.tagCount', {
                  count: selectedTags.length,
                  max: MAX_POST_TAGS,
                })}
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {POST_TAG_VALUES.map((tag) => {
                const selected = selectedTags.includes(tag);
                const disabled = !selected && selectedTags.length >= MAX_POST_TAGS;
                return (
                  <button
                    key={tag}
                    type="button"
                    aria-pressed={selected}
                    disabled={disabled || submitting}
                    onClick={() => toggleTag(tag)}
                    className={`border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
                      selected
                        ? 'border-accent bg-accent-muted text-accent'
                        : 'border-border bg-surface-1 text-text-secondary hover:border-accent/40'
                    }`}
                  >
                    <span className="block font-mono text-[11px] tracking-[0.08em]">
                      {t(`postTags.${tag}.label`)}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-4 text-text-tertiary">
                      {t(`postTags.${tag}.description`)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 相似帖子 */}
          {debouncedTitle && (
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
                <p className="mt-2 text-[11px] text-danger">{t('createPost.similarFailed')}</p>
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
          )}

          {/* 内容 / 预览 切换 */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="create-post-content" className={FIELD_LABEL_CLASS}>
                {t('createPost.content')}
              </label>
              <button
                type="button"
                onClick={() => setShowPreview(!showPreview)}
                className={`flex items-center gap-1 font-mono text-[11px] tracking-wide transition-colors ${
                  showPreview ? 'text-info' : 'text-text-tertiary hover:text-info'
                }`}
              >
                <Eye className="h-3 w-3" />
                {showPreview ? t('createPost.edit') : t('createPost.preview')}
              </button>
            </div>

            {showPreview ? (
              <div className="min-h-[200px] border border-border bg-surface-3 px-3 py-2.5">
                <div className="prose-deck text-[14px]">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {content || t('createPost.emptyPreview')}
                  </ReactMarkdown>
                </div>
              </div>
            ) : (
              <ComposerTextarea
                id="create-post-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={t('createPost.markdownPlaceholder')}
                rows={8}
                variant="framed"
              />
            )}
          </div>
        </div>
      )}
    </TerminalDialog>
  );
}
