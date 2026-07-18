'use client';

import { useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Eye, Send, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '@/lib/api';

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
    <div className="t-corner relative overflow-visible border border-[var(--t-noise)] bg-black transition-[border-color] duration-100 [transition-timing-function:steps(2,end)] focus-within:border-[var(--t-accent)]">
      {/* 错误提示 */}
      {error && (
        <div className="border-b border-danger/40 bg-danger/10 px-3 py-2 font-mono text-[11px] text-danger">
          {error}
        </div>
      )}

      {/* 命令行头 */}
      <div className="flex items-center justify-between border-b border-[var(--t-noise2)] px-3 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--t-faint)]">
          <span className="text-[var(--t-accent)]">{'>'}</span> {t('replyInput.label')}
        </span>
        <button
          onClick={() => setShowPreview(!showPreview)}
          className={`flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors [transition-timing-function:steps(2,end)] ${
            showPreview ? 'text-[var(--t-accent)]' : 'text-[var(--t-faint)] hover:text-[var(--t-accent)]'
          }`}
        >
          <Eye className="w-3 h-3" />
          {showPreview ? t('replyInput.edit') : t('replyInput.preview')}
        </button>
      </div>

      {/* 引用 */}
      {quoteText ? (
        <div className="mx-3 mt-2.5 flex items-start justify-between gap-3 border-l-2 border-l-[var(--t-faint)] bg-[var(--t-panel)] px-3 py-2 text-xs text-text-secondary">
          <span className="line-clamp-3 whitespace-pre-wrap">{quoteText}</span>
          {onClearQuote ? (
            <button
              type="button"
              onClick={onClearQuote}
              aria-label={t('replyInput.clearQuote')}
              className="shrink-0 text-[var(--t-faint)] transition-colors [transition-timing-function:steps(2,end)] hover:text-danger"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      ) : null}

      {/* 输入 / 预览：`>` 前缀 + 闪烁方块光标 */}
      {showPreview ? (
        <div className="flex min-h-[80px] gap-2 px-3 py-2.5">
          <span
            aria-hidden
            className="mt-[2px] shrink-0 font-mono text-[12px] leading-relaxed text-[var(--t-accent)]"
          >
            {'>'}
          </span>
          <div className="prose-deck min-w-0 flex-1 text-[13px]">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {content || t('replyInput.emptyPreview')}
            </ReactMarkdown>
          </div>
        </div>
      ) : (
        <div className="flex gap-2 px-3 py-2.5">
          <span
            aria-hidden
            className="mt-[2px] shrink-0 font-mono text-[12px] leading-relaxed text-[var(--t-accent)]"
          >
            {'>'}
          </span>
          <div className="relative min-w-0 flex-1">
            <textarea
              aria-label={t('replyInput.label')}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={inputPlaceholder}
              rows={compact ? 3 : 4}
              className={`block w-full resize-none rounded-none border-0 bg-transparent px-0 py-0 pl-[16px] font-mono text-[12px] leading-relaxed tracking-[0.08em] text-white caret-[var(--t-accent)] outline-none placeholder:text-[var(--t-faint)] disabled:cursor-not-allowed disabled:opacity-45 ${
                compact ? 'min-h-[76px]' : 'min-h-[96px]'
              }`}
            />
            {content.length === 0 && (
              <span
                aria-hidden
                className="t-anim-blink pointer-events-none absolute left-0 top-[3px] h-[14px] w-[8px] bg-[var(--t-accent)]"
              />
            )}
          </div>
        </div>
      )}

      {/* 操作行：等宽小字 */}
      <div className="flex items-center justify-end gap-3 border-t border-[var(--t-noise2)] px-3 py-2">
        {onCancel && (
          <button
            onClick={onCancel}
            className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-faint)] transition-colors [transition-timing-function:steps(2,end)] hover:text-white"
          >
            <X className="w-3 h-3" />
            {t('app.cancel')}
          </button>
        )}
        <button
          onClick={handleSubmit}
          disabled={submitting || !content.trim()}
          className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-accent)] transition-colors [transition-timing-function:steps(2,end)] hover:bg-accent/10 disabled:cursor-not-allowed disabled:text-[var(--t-faint)] disabled:hover:bg-transparent"
        >
          <Send className="w-3 h-3" />
          {`[ ${submitting ? t('replyInput.sending') : t('replyInput.send')} ]`}
        </button>
      </div>
    </div>
  );
}
