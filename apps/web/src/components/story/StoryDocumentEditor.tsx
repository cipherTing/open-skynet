'use client';

import { useMemo, useState, type FormEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import { AlertTriangle, GitCompareArrows, Pencil, Save, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { TButton, TPanel, TTextarea } from '@/components/ui/terminal';
import { isRevisionBaselineCurrent } from './story-workflow';
import type { SaveStoryDocumentInput, StoryDocument } from './story-types';

interface StoryDocumentEditorProps {
  document: StoryDocument;
  onSave: (input: SaveStoryDocumentInput) => void | Promise<void>;
  onOpenHistory: () => void;
}

export function StoryDocumentEditor({ document, onSave, onOpenHistory }: StoryDocumentEditorProps) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(document.content);
  const [summary, setSummary] = useState('');
  const [baseVersion, setBaseVersion] = useState(document.currentVersion);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const hasCurrentBase = isRevisionBaselineCurrent(baseVersion, document.currentVersion);
  const canSave = useMemo(
    () => isEditing && hasCurrentBase && draft.trim().length > 0 && summary.trim().length > 0,
    [isEditing, hasCurrentBase, draft, summary],
  );

  const beginEditing = () => {
    setDraft(document.content);
    setSummary('');
    setBaseVersion(document.currentVersion);
    setSaveError(false);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setSaveError(false);
  };

  const submitEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSave) return;
    setIsSaving(true);
    setSaveError(false);
    try {
      await onSave({
        documentId: document.id,
        content: draft,
        summary: summary.trim(),
        expectedVersion: baseVersion,
      });
      setIsEditing(false);
    } catch {
      setSaveError(true);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <TPanel
      title={document.title}
      meta={t('story.workspace.editor.version', { version: document.currentVersion })}
      actions={
        <div className="flex items-center gap-2">
          <TButton
            variant="secondary"
            size="sm"
            aria-label={t('story.workspace.history.title')}
            title={t('story.workspace.history.title')}
            onClick={onOpenHistory}
          >
            <GitCompareArrows className="h-3.5 w-3.5" />
          </TButton>
          {!isEditing ? (
            <TButton variant="secondary" size="sm" onClick={beginEditing}>
              <Pencil className="h-3.5 w-3.5" />
              {t('story.workspace.editor.edit')}
            </TButton>
          ) : (
            <TButton variant="secondary" size="sm" onClick={cancelEditing} disabled={isSaving}>
              <X className="h-3.5 w-3.5" />
              {t('app.cancel')}
            </TButton>
          )}
        </div>
      }
    >
      {isEditing ? (
        <form className="space-y-4" onSubmit={(event) => void submitEdit(event)}>
          {!hasCurrentBase ? (
            <section
              className="border border-[var(--t-signal)]/70 bg-[var(--t-signal)]/5 p-3"
              aria-live="assertive"
            >
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--t-signal)]" />
                <div className="min-w-0 flex-1">
                  <p className="font-sans text-[12px] font-semibold text-[var(--t-signal)]">
                    {t('story.workspace.editor.staleTitle')}
                  </p>
                  <p className="mt-1 font-sans text-[12px] leading-5 text-[var(--t-sub)]">
                    {t('story.workspace.editor.staleDescription', {
                      base: baseVersion,
                      current: document.currentVersion,
                    })}
                  </p>
                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    <DiffPane
                      title={t('story.workspace.editor.latestContent')}
                      content={document.content}
                    />
                    <DiffPane title={t('story.workspace.editor.yourDraft')} content={draft} />
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          <label className="block space-y-1.5">
            <span className="font-sans text-[11px] font-medium text-[var(--t-sub)]">
              {t('story.workspace.editor.content')}
            </span>
            <TTextarea
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
              }}
              placeholder={t('story.workspace.editor.contentPlaceholder')}
              rows={16}
              className="font-mono text-[12px] leading-6"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="font-sans text-[11px] font-medium text-[var(--t-sub)]">
              {t('story.workspace.editor.summary')}
            </span>
            <TTextarea
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              placeholder={t('story.workspace.editor.summaryPlaceholder')}
              rows={2}
            />
          </label>
          {saveError ? (
            <p role="alert" className="font-sans text-[12px] text-[var(--t-hazard)]">
              {t('story.workspace.editor.saveFailed')}
            </p>
          ) : null}
          <div className="flex justify-end">
            <TButton type="submit" disabled={!canSave || isSaving}>
              <Save className="h-3.5 w-3.5" />
              {isSaving ? t('story.workspace.editor.saving') : t('story.workspace.editor.save')}
            </TButton>
          </div>
        </form>
      ) : (
        <div className="space-y-5">
          <article className="prose prose-invert prose-sm max-w-none break-words text-[var(--t-text)] prose-headings:font-sans prose-headings:font-semibold prose-a:text-[var(--t-accent)] prose-blockquote:border-[var(--t-noise)] prose-strong:text-white">
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
              {document.content || ' '}
            </ReactMarkdown>
          </article>
        </div>
      )}
    </TPanel>
  );
}

function DiffPane({ title, content }: { title: string; content: string }) {
  return (
    <div className="min-w-0 border border-[var(--t-noise)] bg-black/60">
      <div className="border-b border-[var(--t-noise)] px-2.5 py-1.5">
        <span className="font-sans text-[10px] font-semibold text-[var(--t-sub)]">{title}</span>
      </div>
      <pre className="max-h-44 overflow-auto whitespace-pre-wrap break-words p-2.5 font-mono text-[11px] leading-5 text-[var(--t-text)]">
        {content || ' '}
      </pre>
    </div>
  );
}
