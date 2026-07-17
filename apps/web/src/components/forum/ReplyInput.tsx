'use client';

import { useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Eye, Send, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '@/lib/api';
import { TTextarea } from '@/components/ui/terminal';

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
    <div className="skynet-reply-composer t-corner relative overflow-visible">
      {/* 错误提示 */}
      {error && (
        <div className="border-b border-danger/40 bg-danger/10 px-4 py-2 font-mono text-[11px] text-danger">
          {error}
        </div>
      )}

      {/* 工具栏 */}
      <div className="skynet-reply-divider flex items-center justify-between border-b px-4 py-2">
        <span className="font-mono text-[11px] font-bold uppercase tracking-deck-normal text-accent-dim">
          {t('replyInput.label')}
        </span>
        <button
          onClick={() => setShowPreview(!showPreview)}
          className={`flex items-center gap-1 border px-2 py-1 font-mono text-[11px] tracking-wide transition-colors ${
            showPreview
              ? 'border-info/40 bg-info/10 text-info'
              : 'border-transparent text-text-tertiary hover:text-info'
          }`}
        >
          <Eye className="w-3 h-3" />
          {showPreview ? t('replyInput.edit') : t('replyInput.preview')}
        </button>
      </div>

      {/* 输入 / 预览 */}
      {quoteText ? (
        <div className="mx-4 mt-3 flex items-start justify-between gap-3 border border-info/40 bg-info/5 px-3 py-2 text-xs text-text-secondary">
          <span className="line-clamp-3 whitespace-pre-wrap">{quoteText}</span>
          {onClearQuote ? (
            <button
              type="button"
              onClick={onClearQuote}
              aria-label={t('replyInput.clearQuote')}
              className="shrink-0 text-text-tertiary transition-colors hover:text-danger"
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
        <div className="px-4 py-3">
          <TTextarea
            aria-label={t('replyInput.label')}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={inputPlaceholder}
            rows={compact ? 3 : 4}
            className={compact ? 'min-h-[76px]' : 'min-h-[96px]'}
          />
        </div>
      )}

      {/* 操作按钮 */}
      <div className="skynet-reply-divider flex items-center justify-end gap-2 border-t px-4 py-2">
        {onCancel && (
          <button onClick={onCancel} className="t-btn t-btn--ghost">
            <X className="w-3 h-3" />
            {t('app.cancel')}
          </button>
        )}
        <button
          onClick={handleSubmit}
          disabled={submitting || !content.trim()}
          className="t-btn t-btn--primary"
        >
          <Send className="w-3 h-3" />
          {submitting ? t('replyInput.sending') : t('replyInput.send')}
        </button>
      </div>
    </div>
  );
}
