'use client';

import { useState, useCallback, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { X, Eye, Send, Radio } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { CircleSearchSelect } from '@/components/circle/CircleSearchSelect';
import { forumApi, ApiError } from '@/lib/api';
import { notifyProgressionUpdated } from '@/lib/progression-events';
import { ComposerTextarea } from '@/components/ui/ComposerTextarea';
import { FLOATING_Z_INDEX } from '@/components/ui/FloatingPortal';
import type { Circle, ForumPost } from '@skynet/shared';

interface CreatePostModalProps {
  onClose: () => void;
  onCreated: (created: ForumPost) => void;
  initialCircle?: Circle;
}

export function CreatePostModal({ onClose, onCreated, initialCircle }: CreatePostModalProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [selectedCircleOverride, setSelectedCircleOverride] = useState<Circle | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [reviewPending, setReviewPending] = useState(false);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleEsc);
    };
  }, [onClose]);

  const selectedCircle = selectedCircleOverride ?? initialCircle ?? null;

  const handleSubmit = useCallback(async () => {
    if (!title.trim() || !content.trim()) {
      setError(t('createPost.titleRequired'));
      return;
    }
    if (!selectedCircle) {
      setError(t('createPost.circleRequired'));
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const result = await forumApi.createPost({
        title: title.trim(),
        content: content.trim(),
        circleId: selectedCircle.id,
      });
      if (result.outcome === 'PENDING_REVIEW') {
        setReviewPending(true);
        return;
      }
      if (result.post.progressDelta) notifyProgressionUpdated();
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
  }, [title, content, selectedCircle, onCreated, t]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: FLOATING_Z_INDEX.modal }}
      onClick={onClose}
    >
      {/* 遮罩 */}
      <div className="absolute inset-0 bg-void/45 backdrop-blur-[2px]" />

      {/* 模态框 */}
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        className="relative w-full max-w-2xl mx-4 signal-bubble"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-post-title"
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-copper/10">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-moss" />
            <span id="create-post-title" className="text-moss font-mono text-xs tracking-wider">
              {t('createPost.title')}
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label={t('app.cancel')}
            className="text-ink-muted hover:text-ochre transition-colors p-1 rounded-md hover:bg-ochre/5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {reviewPending ? (
            <div className="py-6 text-center">
              <div className="text-base font-bold text-ink-primary">{t('createPost.reviewPendingTitle')}</div>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ink-secondary">{t('createPost.reviewPendingDescription')}</p>
              <button type="button" onClick={onClose} className="mt-6 rounded-md bg-copper px-4 py-2 text-sm font-bold text-void">{t('app.close')}</button>
            </div>
          ) : (
            <>
          {/* 错误提示 */}
          {error && (
            <div className="px-3 py-2 border border-ochre/20 bg-ochre/10 text-ochre text-[12px] rounded-md">
              {error}
            </div>
          )}

          {/* 标题 */}
          <div>
            <label className="block text-[11px] text-copper tracking-deck-normal font-bold uppercase mb-1.5">
              {t('createPost.circle')}
            </label>
            <CircleSearchSelect
              selectedCircle={selectedCircle}
              onSelect={setSelectedCircleOverride}
              disabled={submitting}
            />
          </div>

          {/* 标题 */}
          <div>
            <label className="block text-[11px] text-copper tracking-deck-normal font-bold uppercase mb-1.5">
              {t('createPost.postTitle')}
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('createPost.titlePlaceholder')}
              className="skynet-input w-full rounded-lg px-3 py-2.5 text-[14px]"
            />
          </div>

          {/* 内容 / 预览 切换 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="create-post-content"
                className="text-[11px] text-copper tracking-deck-normal font-bold uppercase"
              >
                {t('createPost.content')}
              </label>
              <button
                onClick={() => setShowPreview(!showPreview)}
                className={`flex items-center gap-1 text-[11px] tracking-wide transition-colors ${
                  showPreview ? 'text-steel' : 'text-ink-muted hover:text-steel'
                }`}
              >
                <Eye className="w-3 h-3" />
                {showPreview ? t('createPost.edit') : t('createPost.preview')}
              </button>
            </div>

            {showPreview ? (
              <div className="min-h-[200px] px-3 py-2.5 bg-void-deep/60 border border-copper/10 rounded-lg">
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

          {/* 操作按钮 */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-[12px] text-ink-secondary hover:text-ink-primary border border-copper/15 hover:border-copper/30 transition-all tracking-wide rounded-lg"
            >
              {t('app.cancel')}
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || !title.trim() || !content.trim() || !selectedCircle}
              className="flex items-center gap-1.5 px-4 py-2 text-[12px] text-void bg-copper hover:bg-copper-dim disabled:opacity-40 disabled:cursor-not-allowed transition-all tracking-wide font-bold rounded-lg"
            >
              <Send className="w-3 h-3" />
              {submitting ? t('createPost.submitting') : t('createPost.submit')}
            </button>
          </div>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
