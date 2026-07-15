'use client';

import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useQuery } from '@tanstack/react-query';
import { Edit3, History, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { useTranslation } from 'react-i18next';
import type { ForumReply } from '@skynet/shared';
import { ApiError, forumApi } from '@/lib/api';
import { ComposerTextarea } from '@/components/ui/ComposerTextarea';
import { InlineLoading } from '@/components/ui/LoadingState';

interface ReplyRevisionActionsProps {
  reply: ForumReply;
  canEdit: boolean;
  onUpdated: () => Promise<void> | void;
}

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
    <div className="flex items-center gap-2">
      {reply.contentVersion > 1 ? (
        <button
          type="button"
          onClick={() => setHistoryOpen(true)}
          className="inline-flex items-center gap-1 text-[11px] text-ink-muted hover:text-steel"
        >
          <History className="h-3 w-3" />
          {t('revisions.edited')}
        </button>
      ) : null}
      {canEdit ? (
        <button
          type="button"
          onClick={openEditor}
          className="inline-flex items-center gap-1 text-[11px] text-ink-muted hover:text-copper"
        >
          <Edit3 className="h-3 w-3" />
          {t('revisions.editReply')}
        </button>
      ) : null}

      <Dialog.Root
        open={editOpen}
        onOpenChange={(open) => {
          if (saving) return;
          if (open) openEditor();
          else setEditOpen(false);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[190] bg-void/70 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[200] max-h-[calc(100dvh-32px)] w-[min(calc(100vw-32px),860px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border-subtle bg-void-deep p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <Dialog.Title className="text-base font-bold text-ink-primary">
                {t('revisions.editReply')}
              </Dialog.Title>
              <Dialog.Description className="sr-only">
                {t('revisions.editReplyDescription')}
              </Dialog.Description>
              <Dialog.Close
                className="rounded p-1 text-ink-muted hover:text-ink-primary"
                aria-label={t('app.close')}
              >
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-bold text-ink-secondary">
                  {t('revisions.newContent')}
                </p>
                <ComposerTextarea
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  rows={12}
                  variant="framed"
                />
              </div>
              <div>
                <p className="mb-2 text-xs font-bold text-ink-secondary">
                  {t('createPost.preview')}
                </p>
                <div className="prose-deck min-h-[276px] rounded-lg border border-border-subtle bg-void/30 px-4 py-3 text-sm">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
                    {content || t('createPost.emptyPreview')}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
            <label className="mt-4 flex items-start gap-2 rounded-lg border border-border-subtle px-3 py-2.5 text-xs text-ink-secondary">
              <input
                type="checkbox"
                checked={hidePreviousVersion}
                onChange={(event) => setHidePreviousVersion(event.target.checked)}
                className="mt-0.5"
              />
              <span>
                <strong className="block text-ink-primary">{t('revisions.hidePrevious')}</strong>
                {t('revisions.hidePreviousHint')}
              </span>
            </label>
            {hidePreviousVersion ? (
              <label className="mt-4 block text-xs font-bold text-ink-secondary">
                {t('revisions.hideReason')}
                <input
                  value={hideReason}
                  onChange={(event) => setHideReason(event.target.value)}
                  maxLength={280}
                  className="skynet-input mt-2 w-full rounded-md px-3 py-2.5 text-sm"
                />
              </label>
            ) : null}
            {error ? (
              <p
                role="alert"
                className="mt-4 rounded-md border border-ochre/20 bg-ochre/10 px-3 py-2 text-xs text-ochre"
              >
                {error}
              </p>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditOpen(false)}
                disabled={saving}
                className="rounded-md border border-border-subtle px-4 py-2 text-sm text-ink-secondary"
              >
                {t('app.cancel')}
              </button>
              <button
                type="button"
                onClick={() => void save()}
                disabled={
                  saving || !content.trim() || (hidePreviousVersion && hideReason.trim().length < 4)
                }
                className="rounded-md bg-copper px-4 py-2 text-sm font-bold text-void disabled:opacity-40"
              >
                {saving ? t('revisions.saving') : t('revisions.save')}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={historyOpen} onOpenChange={setHistoryOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[190] bg-void/70 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[200] max-h-[calc(100dvh-32px)] w-[min(calc(100vw-32px),680px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border-subtle bg-void-deep p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <Dialog.Title className="text-base font-bold text-ink-primary">
                {t('revisions.replyHistory')}
              </Dialog.Title>
              <Dialog.Description className="sr-only">
                {t('revisions.replyHistoryDescription')}
              </Dialog.Description>
              <Dialog.Close
                className="rounded p-1 text-ink-muted hover:text-ink-primary"
                aria-label={t('app.close')}
              >
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>
            <div className="mt-4 space-y-3">
              {historyQuery.isPending ? <InlineLoading label={t('revisions.loading')} /> : null}
              {historyQuery.data?.items.map((revision) => (
                <article
                  key={revision.version}
                  className="rounded-lg border border-border-subtle bg-void/25 p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <strong className="text-xs text-steel">
                      {t('revisions.version', { version: revision.version })}
                    </strong>
                    <span className="text-[11px] text-ink-muted">
                      {new Date(revision.createdAt).toLocaleString()}
                    </span>
                  </div>
                  {revision.content === null ? (
                    <p className="mt-3 rounded-md border border-ochre/15 bg-ochre/[0.06] px-3 py-2 text-xs text-ochre">
                      {t('revisions.hiddenContent', {
                        reason:
                          revision.publicContentHideReason ?? t('revisions.hiddenReasonFallback'),
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
                <p className="text-xs text-ochre">{t('revisions.loadFailed')}</p>
              ) : null}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
