'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Edit3, History } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { useTranslation } from 'react-i18next';
import type { ForumReply } from '@skynet/shared';
import { ApiError, forumApi } from '@/lib/api';
import { ComposerTextarea } from '@/components/ui/ComposerTextarea';
import { TerminalDialog } from '@/components/ui/TerminalDialog';
import { TSkeleton, Timecode } from '@/components/ui/terminal';

interface ReplyRevisionActionsProps {
  reply: ForumReply;
  canEdit: boolean;
  onUpdated: () => Promise<void> | void;
}

const FIELD_LABEL_CLASS = 'font-mono text-[11px] tracking-[0.12em] text-text-secondary';

export function ReplyRevisionActions({ reply, canEdit, onUpdated }: ReplyRevisionActionsProps) {
  const { t } = useTranslation();
  const [editOpen, setEditOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [content, setContent] = useState(reply.content);
  const [hidePreviousVersion, setHidePreviousVersion] = useState(false);
  const [hideReason, setHideReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const openEditor = () => {
    setContent(reply.content);
    setHidePreviousVersion(false);
    setHideReason('');
    setError('');
    setEditOpen(true);
  };

  const historyQuery = useQuery({
    queryKey: ['forum', 'reply-revisions', reply.id, reply.contentVersion],
    queryFn: () => forumApi.listReplyRevisions(reply.id),
    enabled: historyOpen,
  });

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      await forumApi.reviseReply(reply.id, {
        expectedVersion: reply.contentVersion,
        content,
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
    <div className="flex items-center gap-x-3 gap-y-1 font-mono text-[10px] uppercase tracking-[0.12em]">
      {reply.contentVersion > 1 ? (
        <button
          type="button"
          onClick={() => setHistoryOpen(true)}
          className="inline-flex items-center gap-1 text-[var(--t-faint)] transition-colors [transition-timing-function:steps(2,end)] hover:text-[var(--t-accent)]"
        >
          <History className="h-3 w-3" />
          {t('revisions.edited')}
        </button>
      ) : null}
      {canEdit ? (
        <button
          type="button"
          onClick={openEditor}
          className="inline-flex items-center gap-1 text-[var(--t-faint)] transition-colors [transition-timing-function:steps(2,end)] hover:text-[var(--t-accent)]"
        >
          <Edit3 className="h-3 w-3" />
          {t('revisions.editReply')}
        </button>
      ) : null}

      <TerminalDialog
        open={editOpen}
        onOpenChange={(open) => {
          if (saving) return;
          if (open) openEditor();
          else setEditOpen(false);
        }}
        title={t('revisions.editReply')}
        code="EDIT.REPLY"
        size="lg"
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
                saving || !content.trim() || (hidePreviousVersion && hideReason.trim().length < 4)
              }
              className="t-btn t-btn--primary"
            >
              {saving ? t('revisions.saving') : t('revisions.save')}
            </button>
          </>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className={`mb-2 ${FIELD_LABEL_CLASS}`}>{t('revisions.newContent')}</p>
            <ComposerTextarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              rows={12}
              variant="framed"
            />
          </div>
          <div>
            <p className={`mb-2 ${FIELD_LABEL_CLASS}`}>{t('createPost.preview')}</p>
            <div className="prose-deck min-h-[276px] border border-border bg-surface-3 px-4 py-3 text-sm">
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
                {content || t('createPost.emptyPreview')}
              </ReactMarkdown>
            </div>
          </div>
        </div>
        <label className="mt-4 flex items-start gap-2 border border-border px-3 py-2.5 text-xs text-text-secondary">
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
          <label className={`mt-4 block ${FIELD_LABEL_CLASS}`}>
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
            className="mt-4 border border-danger/30 border-l-2 border-l-danger bg-danger/10 px-3 py-2 text-xs text-danger"
          >
            {error}
          </p>
        ) : null}
      </TerminalDialog>

      <TerminalDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        title={t('revisions.replyHistory')}
        code="HISTORY.REPLY"
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
                <div className="prose-deck mt-3 text-sm">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
                    {revision.content}
                  </ReactMarkdown>
                </div>
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
