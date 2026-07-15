'use client';

import { useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Eye, Send, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { ApiError } from '@/lib/api';
import { ComposerTextarea } from '@/components/ui/ComposerTextarea';

interface ReplyInputProps {
  onSubmit: (content: string) => Promise<void>;
  onCancel?: () => void;
  placeholder?: string;
  compact?: boolean;
  quoteText?: string | null;
  onClearQuote?: () => void;
}

export function ReplyInput({
  onSubmit,
  onCancel,
  placeholder,
  compact = false,
  quoteText,
  onClearQuote,
}: ReplyInputProps) {
  const { t } = useTranslation();
  const [content, setContent] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = useCallback(async () => {
    if (!content.trim()) return;
    setError('');
    setSubmitting(true);
    try {
      await onSubmit(content.trim());
      setContent('');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError(t('replyInput.sendFailed'));
      }
    } finally {
      setSubmitting(false);
    }
  }, [content, onSubmit, t]);

  const inputPlaceholder = placeholder ?? t('forum.replyPlaceholder');

  return (
    <div className="signal-bubble skynet-reply-composer overflow-visible">
      {/* 错误提示 */}
      {error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="px-4 py-2 border-b border-ochre/15 bg-ochre/10 text-ochre text-[11px]"
        >
          {error}
        </motion.div>
      )}

      {/* 工具栏 */}
      <div className="skynet-reply-divider flex items-center justify-between border-b px-4 py-2">
        <span className="text-xs text-copper-dim tracking-deck-normal uppercase font-bold">
          {t('replyInput.label')}
        </span>
        <button
          onClick={() => setShowPreview(!showPreview)}
          className={`flex items-center gap-1 text-xs tracking-wide transition-colors ${
            showPreview ? 'text-steel' : 'text-ink-muted hover:text-steel'
          }`}
        >
          <Eye className="w-3 h-3" />
          {showPreview ? t('replyInput.edit') : t('replyInput.preview')}
        </button>
      </div>

      {/* 输入 / 预览 */}
      {quoteText ? (
        <div className="mx-4 mt-3 flex items-start justify-between gap-3 rounded-md border border-steel/20 bg-steel/[0.06] px-3 py-2 text-xs text-ink-secondary">
          <span className="line-clamp-3 whitespace-pre-wrap">{quoteText}</span>
          {onClearQuote ? (
            <button
              type="button"
              onClick={onClearQuote}
              aria-label={t('replyInput.clearQuote')}
              className="shrink-0 text-ink-muted hover:text-ochre"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      ) : null}
      {showPreview ? (
        <div className="min-h-[80px] px-4 py-3">
          <div className="prose-deck text-[13px]">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {content || t('replyInput.emptyPreview')}
            </ReactMarkdown>
          </div>
        </div>
      ) : (
        <ComposerTextarea
          aria-label={t('replyInput.label')}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={inputPlaceholder}
          rows={compact ? 3 : 4}
          variant="bare"
          className={compact ? '!min-h-[76px]' : undefined}
        />
      )}

      {/* 操作按钮 */}
      <div className="skynet-reply-divider flex items-center justify-end gap-2 border-t px-4 py-2">
        {onCancel && (
          <button
            onClick={onCancel}
            className="flex items-center gap-1 px-3 py-1.5 text-[11px] text-ink-muted hover:text-ink-secondary transition-colors tracking-wide"
          >
            <X className="w-3 h-3" />
            {t('app.cancel')}
          </button>
        )}
        <button
          onClick={handleSubmit}
          disabled={submitting || !content.trim()}
          className="flex items-center gap-1 px-4 py-1.5 text-[11px] text-void bg-copper hover:bg-copper-dim disabled:opacity-40 disabled:cursor-not-allowed transition-all tracking-wide font-bold rounded-md"
        >
          <Send className="w-3 h-3" />
          {submitting ? t('replyInput.sending') : t('replyInput.send')}
        </button>
      </div>
    </div>
  );
}
