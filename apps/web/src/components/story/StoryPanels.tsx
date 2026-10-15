'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { GitBranch, MessageSquareText, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { TButton, TPanel, TTag, TTextarea } from '@/components/ui/terminal';
import {
  isValidRestoreSelection,
  previewSelectedRestore,
  type StoryLineSelection,
} from './story-workflow';
import type {
  CreateStoryBranchInput,
  CreateStoryDiscussionInput,
  CreateStoryDiscussionMessageInput,
  CreateStoryReviewInput,
  RestoreStoryMetadataInput,
  RestoreStoryRevisionInput,
  StoryBranch,
  StoryComparison,
  StoryDiscussion,
  StoryDiscussionMessage,
  StoryDocument,
  StoryDocumentSummary,
  StoryReview,
  StoryRevision,
  StoryRevisionSummary,
  StoryDetail,
} from './story-types';

export function StoryMetadataHistoryPanel({
  story,
  revisions,
  canEdit,
  onRestore,
}: {
  story: StoryDetail;
  revisions: StoryRevision[];
  canEdit: boolean;
  onRestore: (input: RestoreStoryMetadataInput) => void | Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const [targetRevisionNumber, setTargetRevisionNumber] = useState<number | null>(null);
  const [changeSummary, setChangeSummary] = useState('');
  const [error, setError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const storyRevisions = useMemo(
    () =>
      revisions
        .filter((revision) => revision.documentId === null)
        .sort((left, right) => right.revisionNumber - left.revisionNumber),
    [revisions],
  );
  const targetRevision =
    storyRevisions.find((revision) => revision.revisionNumber === targetRevisionNumber) ?? null;

  const submitRestore = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!targetRevision || !changeSummary.trim()) return;
    setIsSubmitting(true);
    setError(false);
    try {
      await onRestore({
        targetRevisionNumber: targetRevision.revisionNumber,
        expectedVersion: story.currentVersion,
        changeSummary: changeSummary.trim(),
      });
      setTargetRevisionNumber(null);
      setChangeSummary('');
    } catch {
      setError(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <TPanel title={t('story.workspace.storyHistory.title')}>
      {storyRevisions.length ? (
        <div className="divide-y divide-[var(--t-noise)]">
          {storyRevisions.map((revision) => (
            <article
              key={revision.id}
              className="grid gap-2 py-3 first:pt-0 sm:grid-cols-[72px_minmax(0,1fr)_auto] sm:items-start"
            >
              <span className="font-mono text-[11px] text-[var(--t-accent)]">
                {t('story.workspace.editor.version', { version: revision.revisionNumber })}
              </span>
              <div className="min-w-0">
                <p className="break-words font-sans text-[12px] text-white">
                  {revision.changeSummary}
                </p>
                <p className="mt-1 font-sans text-[10px] text-[var(--t-faint)]">
                  {revision.authorAgentId} · {formatDate(revision.createdAt, i18n.language)}
                </p>
              </div>
              <TButton
                size="sm"
                variant="secondary"
                onClick={() => setTargetRevisionNumber(revision.revisionNumber)}
                disabled={!canEdit}
              >
                <RotateCcw className="h-3 w-3" />
                {t('story.workspace.history.restore')}
              </TButton>
            </article>
          ))}
        </div>
      ) : (
        <p className="py-3 font-sans text-[12px] text-[var(--t-faint)]">
          {t('story.workspace.storyHistory.empty')}
        </p>
      )}
      {targetRevision?.diff.afterStory ? (
        <form
          className="mt-3 space-y-3 border-t border-[var(--t-noise)] pt-4"
          onSubmit={(event) => void submitRestore(event)}
        >
          <div className="grid gap-3 lg:grid-cols-2">
            <MetadataSnapshot title={t('story.workspace.storyHistory.current')} story={story} />
            <MetadataSnapshot
              title={t('story.workspace.history.restorePreview')}
              story={targetRevision.diff.afterStory}
            />
          </div>
          <label className="block space-y-1.5">
            <span className="font-sans text-[11px] font-medium text-[var(--t-sub)]">
              {t('story.workspace.history.restoreReason')}
            </span>
            <TTextarea
              value={changeSummary}
              onChange={(event) => setChangeSummary(event.target.value)}
              rows={2}
              maxLength={280}
              placeholder={t('story.workspace.history.restoreReasonPlaceholder')}
            />
          </label>
          {error ? <ActionError /> : null}
          <div className="flex justify-end gap-2">
            <TButton
              variant="secondary"
              onClick={() => setTargetRevisionNumber(null)}
              disabled={isSubmitting}
            >
              {t('app.cancel')}
            </TButton>
            <TButton
              type="submit"
              variant="danger"
              disabled={!canEdit || !changeSummary.trim() || isSubmitting}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {t('story.workspace.history.confirmRestore')}
            </TButton>
          </div>
        </form>
      ) : null}
    </TPanel>
  );
}

function MetadataSnapshot({
  title,
  story,
}: {
  title: string;
  story: StoryDetail | NonNullable<StoryRevision['diff']['afterStory']>;
}) {
  const { t } = useTranslation();
  return (
    <section className="min-w-0 border border-[var(--t-noise)] bg-black/60">
      <p className="border-b border-[var(--t-noise)] px-2.5 py-1.5 font-sans text-[10px] font-semibold text-[var(--t-sub)]">
        {title}
      </p>
      <dl className="grid grid-cols-[100px_minmax(0,1fr)] gap-x-3 gap-y-2 p-3 font-sans text-[11px]">
        <dt className="text-[var(--t-faint)]">{t('story.create.storyTitle')}</dt>
        <dd className="break-words text-[var(--t-text)]">{story.title}</dd>
        <dt className="text-[var(--t-faint)]">{t('story.create.premise')}</dt>
        <dd className="break-words text-[var(--t-text)]">{story.premise}</dd>
        <dt className="text-[var(--t-faint)]">{t('story.workspace.stage')}</dt>
        <dd className="text-[var(--t-text)]">{t(`story.stages.${story.stage}`)}</dd>
        <dt className="text-[var(--t-faint)]">{t('story.create.genre')}</dt>
        <dd className="text-[var(--t-text)]">{story.genre ?? '—'}</dd>
        <dt className="text-[var(--t-faint)]">{t('story.create.tone')}</dt>
        <dd className="text-[var(--t-text)]">{story.tone ?? '—'}</dd>
        <dt className="text-[var(--t-faint)]">{t('story.create.pointOfView')}</dt>
        <dd className="text-[var(--t-text)]">{story.viewpoint ?? '—'}</dd>
        <dt className="text-[var(--t-faint)]">{t('story.create.targetLength')}</dt>
        <dd className="text-[var(--t-text)]">{story.targetLength ?? '—'}</dd>
        <dt className="text-[var(--t-faint)]">{t('story.create.descriptionLabel')}</dt>
        <dd className="whitespace-pre-wrap break-words text-[var(--t-text)]">
          {story.establishedDirection ?? '—'}
        </dd>
      </dl>
    </section>
  );
}

export function StoryDiscussionPanel({
  discussions,
  document,
  initialDiscussionId,
  onDiscussionResolved,
  noticeAgentSuggestions = [],
  onCreate,
  onCreateMessage,
  onLoadMessages,
  hasMoreDiscussions,
  isLoadingMoreDiscussions,
  onLoadMoreDiscussions,
}: {
  discussions: StoryDiscussion[];
  document: StoryDocumentSummary | null;
  initialDiscussionId?: string | null;
  onDiscussionResolved?: () => void;
  noticeAgentSuggestions?: string[];
  onCreate: (input: CreateStoryDiscussionInput) => void | Promise<void>;
  onCreateMessage: (input: CreateStoryDiscussionMessageInput) => void | Promise<void>;
  onLoadMessages: (discussionId: string) => Promise<StoryDiscussionMessage[]>;
  hasMoreDiscussions: boolean;
  isLoadingMoreDiscussions: boolean;
  onLoadMoreDiscussions: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [selectedDiscussionId, setSelectedDiscussionId] = useState<string | null>(
    initialDiscussionId ?? null,
  );
  const [loadedMessages, setLoadedMessages] = useState<{
    discussionId: string;
    items: StoryDiscussionMessage[];
  } | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [anchorText, setAnchorText] = useState('');
  const [noticeTargetAgentId, setNoticeTargetAgentId] = useState('');
  const [reply, setReply] = useState('');
  const [error, setError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const selectedDiscussion =
    discussions.find((item) => item.id === selectedDiscussionId) ??
    discussions.find((item) => !document || item.documentId === document.id) ??
    null;
  const selectedDiscussionIdForLoad = selectedDiscussion?.id ?? null;
  const messages =
    loadedMessages?.discussionId === selectedDiscussionIdForLoad ? loadedMessages.items : [];
  const messagesLoading =
    selectedDiscussionIdForLoad !== null &&
    loadedMessages?.discussionId !== selectedDiscussionIdForLoad;
  const visibleDiscussions = discussions.filter(
    (item) => !document || item.documentId === document.id,
  );

  useEffect(() => {
    if (!selectedDiscussionIdForLoad) return undefined;
    let active = true;
    void onLoadMessages(selectedDiscussionIdForLoad)
      .then((items) => {
        if (active) {
          setLoadedMessages({ discussionId: selectedDiscussionIdForLoad, items });
          if (selectedDiscussionIdForLoad === initialDiscussionId) onDiscussionResolved?.();
        }
      })
      .catch(() => {
        if (active) {
          setLoadedMessages({ discussionId: selectedDiscussionIdForLoad, items: [] });
          setError(true);
        }
      });
    return () => {
      active = false;
    };
  }, [selectedDiscussionIdForLoad, initialDiscussionId, onDiscussionResolved, onLoadMessages]);

  const submitDiscussion = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!document || !title.trim() || !body.trim()) return;
    setError(false);
    setIsSubmitting(true);
    try {
      await onCreate({
        documentId: document.id,
        revisionNumber: document.currentVersion,
        title: title.trim(),
        content: body.trim(),
        anchorText: anchorText.trim() || null,
        noticeTargetAgentId: noticeTargetAgentId.trim() || null,
      });
      setTitle('');
      setBody('');
      setAnchorText('');
      setNoticeTargetAgentId('');
    } catch {
      setError(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitReply = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedDiscussion || !reply.trim()) return;
    setError(false);
    setIsSubmitting(true);
    try {
      await onCreateMessage({
        discussionId: selectedDiscussion.id,
        content: reply.trim(),
        parentMessageId: null,
      });
      const nextMessages = await onLoadMessages(selectedDiscussion.id);
      setLoadedMessages({ discussionId: selectedDiscussion.id, items: nextMessages });
      setReply('');
    } catch {
      setError(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(220px,0.72fr)_minmax(0,1.4fr)]">
      <TPanel title={t('story.workspace.discussions.title')}>
        {visibleDiscussions.length ? (
          <nav
            aria-label={t('story.workspace.discussions.title')}
            className="-my-1 divide-y divide-[var(--t-noise)]"
          >
            {visibleDiscussions.map((discussion) => (
              <button
                key={discussion.id}
                type="button"
                aria-current={selectedDiscussion?.id === discussion.id ? 'page' : undefined}
                onClick={() => setSelectedDiscussionId(discussion.id)}
                className={`block w-full border-l-2 py-3 pl-3 text-left transition-colors ${selectedDiscussion?.id === discussion.id ? 'border-[var(--t-accent)] text-white' : 'border-transparent text-[var(--t-sub)] hover:text-white'}`}
              >
                <span className="block break-words font-sans text-[12px] font-semibold">
                  {discussion.title}
                </span>
                <span className="mt-1 block font-sans text-[10px] text-[var(--t-faint)]">
                  {t('story.workspace.discussions.linkedRevision', {
                    version: discussion.revisionNumber,
                  })}
                  {' · '}
                  {discussion.createdByAgentId}
                </span>
              </button>
            ))}
          </nav>
        ) : (
          <p className="py-3 font-sans text-[12px] leading-5 text-[var(--t-faint)]">
            {t('story.workspace.discussions.empty')}
          </p>
        )}
        {hasMoreDiscussions ? (
          <div className="mt-2 border-t border-[var(--t-noise)] pt-2">
            <TButton
              size="sm"
              variant="secondary"
              disabled={isLoadingMoreDiscussions}
              onClick={onLoadMoreDiscussions}
            >
              {t(
                isLoadingMoreDiscussions
                  ? 'story.workspace.discussions.loadingMore'
                  : 'story.workspace.discussions.loadMore',
              )}
            </TButton>
          </div>
        ) : null}
      </TPanel>

      <div className="space-y-5">
        <TPanel title={selectedDiscussion?.title ?? t('story.workspace.discussions.newDiscussion')}>
          {selectedDiscussion ? (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 font-sans text-[10px] text-[var(--t-faint)]">
                <span>{selectedDiscussion.createdByAgentId}</span>
                <span>{formatDate(selectedDiscussion.createdAt, i18n.language)}</span>
                <TTag color="default">
                  {t('story.workspace.discussions.linkedRevision', {
                    version: selectedDiscussion.revisionNumber,
                  })}
                </TTag>
              </div>
              {selectedDiscussion.anchorText ? (
                <blockquote className="mb-4 border-l-2 border-[var(--t-signal)]/70 pl-3 font-sans text-[12px] leading-5 text-[var(--t-faint)]">
                  {selectedDiscussion.anchorText}
                </blockquote>
              ) : null}
              {messagesLoading ? (
                <p role="status" className="py-3 font-sans text-[11px] text-[var(--t-faint)]">
                  {t('story.workspace.discussions.loadingMessages')}
                </p>
              ) : messages.length ? (
                <div className="divide-y divide-[var(--t-noise)]">
                  {messages.map((message) => (
                    <article
                      key={message.id}
                      className={`py-3 ${message.parentMessageId ? 'pl-5' : ''}`}
                    >
                      <div className="flex flex-wrap justify-between gap-2">
                        <span className="font-sans text-[11px] font-semibold text-[var(--t-text)]">
                          {message.authorAgentId}
                        </span>
                        <span className="font-sans text-[10px] text-[var(--t-faint)]">
                          {formatDate(message.createdAt, i18n.language)}
                        </span>
                      </div>
                      <p className="mt-1.5 whitespace-pre-wrap break-words font-sans text-[12px] leading-5 text-[var(--t-text)]">
                        {message.content}
                      </p>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="py-3 font-sans text-[11px] text-[var(--t-faint)]">
                  {t('story.workspace.discussions.noMessages')}
                </p>
              )}
              <form
                className="mt-3 border-t border-[var(--t-noise)] pt-3"
                onSubmit={(event) => void submitReply(event)}
              >
                <label className="block space-y-1.5">
                  <span className="font-sans text-[11px] font-medium text-[var(--t-sub)]">
                    {t('story.workspace.discussions.reply')}
                  </span>
                  <TTextarea
                    value={reply}
                    onChange={(event) => setReply(event.target.value)}
                    rows={3}
                  />
                </label>
                <div className="mt-3 flex justify-end">
                  <TButton type="submit" size="sm" disabled={!reply.trim() || isSubmitting}>
                    <MessageSquareText className="h-3.5 w-3.5" />
                    {t('story.workspace.discussions.sendReply')}
                  </TButton>
                </div>
              </form>
            </>
          ) : (
            <p className="py-3 font-sans text-[12px] text-[var(--t-faint)]">
              {t('story.workspace.noSelection')}
            </p>
          )}
        </TPanel>

        <TPanel title={t('story.workspace.discussions.newDiscussion')}>
          <form className="space-y-3" onSubmit={(event) => void submitDiscussion(event)}>
            <label className="block space-y-1.5">
              <span className="font-sans text-[11px] font-medium text-[var(--t-sub)]">
                {t('story.workspace.discussions.titleLabel')}
              </span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="skynet-input h-10 w-full px-3 font-sans text-[13px]"
                maxLength={200}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="font-sans text-[11px] font-medium text-[var(--t-sub)]">
                {t('story.workspace.discussions.body')}
              </span>
              <TTextarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder={t('story.workspace.discussions.bodyPlaceholder')}
                rows={3}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="font-sans text-[11px] font-medium text-[var(--t-sub)]">
                {t('story.workspace.discussions.anchor')}
              </span>
              <TTextarea
                value={anchorText}
                onChange={(event) => setAnchorText(event.target.value)}
                placeholder={t('story.workspace.discussions.anchorPlaceholder')}
                rows={2}
                maxLength={2000}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="font-sans text-[11px] font-medium text-[var(--t-sub)]">
                {t('story.workspace.discussions.noticeTarget')}
              </span>
              <input
                list="story-discussion-agent-suggestions"
                value={noticeTargetAgentId}
                onChange={(event) => setNoticeTargetAgentId(event.target.value)}
                placeholder={t('story.workspace.discussions.noticeTargetPlaceholder')}
                className="skynet-input h-10 w-full px-3 font-mono text-[12px]"
              />
              <datalist id="story-discussion-agent-suggestions">
                {noticeAgentSuggestions.map((agentId) => (
                  <option key={agentId} value={agentId} />
                ))}
              </datalist>
            </label>
            {error ? <ActionError /> : null}
            <div className="flex justify-end">
              <TButton
                type="submit"
                disabled={!document || !title.trim() || !body.trim() || isSubmitting}
              >
                <MessageSquareText className="h-3.5 w-3.5" />
                {t('story.workspace.discussions.submit')}
              </TButton>
            </div>
            {!document ? (
              <p className="font-sans text-[10px] text-[var(--t-faint)]">
                {t('story.workspace.discussions.selectFileFirst')}
              </p>
            ) : null}
          </form>
        </TPanel>
      </div>
    </div>
  );
}

export function StoryReviewPanel({
  reviews,
  document,
  onCreate,
}: {
  reviews: StoryReview[];
  document: StoryDocumentSummary | null;
  onCreate: (input: CreateStoryReviewInput) => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const [content, setContent] = useState('');
  const [anchorText, setAnchorText] = useState('');
  const [error, setError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const visibleReviews = useMemo(
    () =>
      reviews
        .filter((review) => !document || review.documentId === document.id)
        .sort((left, right) => right.revisionNumber - left.revisionNumber),
    [reviews, document],
  );

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!document || !content.trim()) return;
    setError(false);
    setIsSubmitting(true);
    try {
      await onCreate({
        documentId: document.id,
        revisionNumber: document.currentVersion,
        content: content.trim(),
        anchorText: anchorText.trim() || null,
      });
      setContent('');
      setAnchorText('');
    } catch {
      setError(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <TPanel title={t('story.workspace.reviews.title')}>
        {visibleReviews.length ? (
          <div className="divide-y divide-[var(--t-noise)]">
            {visibleReviews.map((review) => (
              <article key={review.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-sans text-[10px] text-[var(--t-faint)]">
                    {t('story.workspace.editor.version', { version: review.revisionNumber })}
                  </span>
                  <span className="font-sans text-[10px] text-[var(--t-faint)]">
                    {review.authorAgentId}
                  </span>
                </div>
                {review.anchorText ? (
                  <blockquote className="mt-2 border-l-2 border-[var(--t-accent-dim)] pl-3 font-sans text-[11px] leading-5 text-[var(--t-sub)]">
                    {review.anchorText}
                  </blockquote>
                ) : null}
                <p className="mt-2 whitespace-pre-wrap font-sans text-[12px] leading-5 text-[var(--t-text)]">
                  {review.content}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <p className="font-sans text-[12px] text-[var(--t-faint)]">
            {t('story.workspace.reviews.empty')}
          </p>
        )}
      </TPanel>

      <TPanel title={t('story.workspace.reviews.submit')}>
        <form className="space-y-3" onSubmit={(event) => void submit(event)}>
          <label className="block space-y-1.5">
            <span className="font-sans text-[11px] font-medium text-[var(--t-sub)]">
              {t('story.workspace.reviews.anchor')}
            </span>
            <TTextarea
              value={anchorText}
              onChange={(event) => setAnchorText(event.target.value)}
              placeholder={t('story.workspace.reviews.anchorPlaceholder')}
              rows={2}
              maxLength={2000}
            />
          </label>
          <label className="block space-y-1.5">
            <span className="font-sans text-[11px] font-medium text-[var(--t-sub)]">
              {t('story.workspace.reviews.content')}
            </span>
            <TTextarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder={t('story.workspace.reviews.contentPlaceholder')}
              rows={4}
              maxLength={10000}
            />
          </label>
          {error ? <ActionError /> : null}
          <div className="flex justify-end">
            <TButton type="submit" disabled={!document || !content.trim() || isSubmitting}>
              {t('story.workspace.reviews.submit')}
            </TButton>
          </div>
        </form>
      </TPanel>
    </div>
  );
}

export function StoryBranchPanel({
  branches,
  document,
  canEdit,
  activeBranchId,
  onSelectBranch,
  onCreate,
}: {
  branches: StoryBranch[];
  document: StoryDocumentSummary | null;
  canEdit: boolean;
  activeBranchId: string | null;
  onSelectBranch: (branchId: string | null) => void;
  onCreate: (input: CreateStoryBranchInput) => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const [isCreating, setIsCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [premise, setPremise] = useState('');
  const [error, setError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!document || !title.trim() || !premise.trim()) return;
    setError(false);
    setIsSubmitting(true);
    try {
      await onCreate({
        title: title.trim(),
        premise: premise.trim(),
        sourceDocumentId: document.id,
        sourceRevisionNumber: document.currentVersion,
      });
      setTitle('');
      setPremise('');
      setIsCreating(false);
    } catch {
      setError(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <TPanel
        title={t('story.workspace.branches.title')}
        actions={
          !isCreating ? (
            <TButton
              size="sm"
              variant="secondary"
              onClick={() => setIsCreating(true)}
              disabled={!canEdit || !document}
              title={!document ? t('story.workspace.branches.selectFileFirst') : undefined}
            >
              <GitBranch className="h-3.5 w-3.5" />
              {t('story.workspace.branches.create')}
            </TButton>
          ) : null
        }
      >
        {branches.length ? (
          <div className="divide-y divide-[var(--t-noise)]">
            {branches.map((branch) => (
              <article
                key={branch.id}
                className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="break-words font-sans text-[13px] font-semibold text-white">
                      {branch.title}
                    </h3>
                    <TTag color={branch.id === activeBranchId ? 'accent' : 'default'}>
                      {branch.id === activeBranchId
                        ? t('story.workspace.branches.active')
                        : t('story.workspace.branches.branch')}
                    </TTag>
                  </div>
                  <p className="mt-1.5 font-sans text-[12px] leading-5 text-[var(--t-sub)]">
                    {branch.premise}
                  </p>
                  <p className="mt-1 font-sans text-[10px] text-[var(--t-faint)]">
                    {t('story.workspace.branches.basedOn', {
                      documentId: branch.sourceDocumentId,
                      version: branch.sourceRevisionNumber,
                    })}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <span className="font-sans text-[10px] text-[var(--t-faint)]">
                    {branch.createdByAgentId}
                  </span>
                  {branch.id !== activeBranchId ? (
                    <TButton
                      size="sm"
                      variant="secondary"
                      onClick={() => onSelectBranch(branch.id)}
                    >
                      {t('story.workspace.branches.open')}
                    </TButton>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="py-3 font-sans text-[12px] leading-5 text-[var(--t-faint)]">
            {t('story.workspace.branches.empty')}
          </p>
        )}
      </TPanel>

      {isCreating ? (
        <TPanel title={t('story.workspace.branches.create')}>
          <form className="space-y-3" onSubmit={(event) => void submit(event)}>
            <label className="block space-y-1.5">
              <span className="font-sans text-[11px] font-medium text-[var(--t-sub)]">
                {t('story.workspace.branches.name')}
              </span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={t('story.workspace.branches.namePlaceholder')}
                className="skynet-input h-10 w-full px-3 font-sans text-[13px]"
                maxLength={120}
                autoFocus
              />
            </label>
            <label className="block space-y-1.5">
              <span className="font-sans text-[11px] font-medium text-[var(--t-sub)]">
                {t('story.workspace.branches.premise')}
              </span>
              <TTextarea
                value={premise}
                onChange={(event) => setPremise(event.target.value)}
                placeholder={t('story.workspace.branches.premisePlaceholder')}
                rows={3}
                maxLength={4000}
              />
            </label>
            {document ? (
              <p className="font-sans text-[10px] text-[var(--t-faint)]">
                {t('story.workspace.branches.sourceRevision', {
                  title: document.title,
                  version: document.currentVersion,
                })}
              </p>
            ) : null}
            {error ? <ActionError /> : null}
            <div className="flex justify-end gap-2">
              <TButton
                variant="secondary"
                onClick={() => setIsCreating(false)}
                disabled={isSubmitting}
              >
                {t('app.cancel')}
              </TButton>
              <TButton
                type="submit"
                disabled={!document || !title.trim() || !premise.trim() || isSubmitting}
              >
                <GitBranch className="h-3.5 w-3.5" />
                {t('story.workspace.branches.submit')}
              </TButton>
            </div>
          </form>
        </TPanel>
      ) : null}
    </div>
  );
}

export function StoryRevisionHistoryPanel({
  document,
  revisions,
  onCompare,
  onRestore,
  hasMore,
  isLoadingMore,
  onLoadMore,
}: {
  document: StoryDocument | null;
  revisions: StoryRevisionSummary[];
  onCompare: (
    documentId: string,
    fromRevisionNumber: number,
    toRevisionNumber: number,
  ) => Promise<StoryComparison>;
  onRestore: (input: RestoreStoryRevisionInput) => void | Promise<void>;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
}) {
  const { t } = useTranslation();
  const [fromRevisionNumber, setFromRevisionNumber] = useState('');
  const [toRevisionNumber, setToRevisionNumber] = useState('');
  const [restoreRevisionNumber, setRestoreRevisionNumber] = useState<number | null>(null);
  const [restoreMode, setRestoreMode] = useState<'WHOLE' | 'SELECTION'>('WHOLE');
  const [changeSummary, setChangeSummary] = useState('');
  const [selection, setSelection] = useState<StoryLineSelection>({
    currentStartLine: 1,
    currentEndLine: 1,
    targetStartLine: 1,
    targetEndLine: 1,
  });
  const [comparison, setComparison] = useState<StoryComparison | null>(null);
  const [restoreSnapshot, setRestoreSnapshot] = useState<StoryRevision | null>(null);
  const [isComparing, setIsComparing] = useState(false);
  const [error, setError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const documentRevisions = useMemo(
    () => revisions.filter((revision) => !document || revision.documentId === document.id),
    [revisions, document],
  );
  const restoreRevision =
    documentRevisions.find((revision) => revision.revisionNumber === restoreRevisionNumber) ?? null;
  const restoreTargetContent = restoreSnapshot?.diff.afterDocument?.content ?? '';
  const restoreSelectionValid =
    document && restoreRevision
      ? isValidRestoreSelection(document.content, restoreTargetContent, selection)
      : false;
  const restorePreview =
    document && restoreRevision
      ? restoreMode === 'WHOLE'
        ? restoreTargetContent
        : restoreSelectionValid
          ? previewSelectedRestore(document.content, restoreTargetContent, selection)
          : null
      : null;

  const beginRestore = async (revision: StoryRevisionSummary) => {
    if (!document || revision.revisionNumber >= document.currentVersion) return;
    setRestoreRevisionNumber(revision.revisionNumber);
    setRestoreSnapshot(null);
    setRestoreMode('WHOLE');
    setChangeSummary('');
    setIsComparing(true);
    setError(false);
    try {
      const comparison = await onCompare(
        document.id,
        revision.revisionNumber,
        document.currentVersion,
      );
      setRestoreSnapshot(comparison.fromRevision);
      const content = comparison.fromRevision.diff.afterDocument?.content ?? '';
      setSelection({
        currentStartLine: 1,
        currentEndLine: document.content.split('\n').length,
        targetStartLine: 1,
        targetEndLine: content.split('\n').length,
      });
    } catch {
      setError(true);
      setRestoreRevisionNumber(null);
    } finally {
      setIsComparing(false);
    }
  };

  const compareRevisions = async () => {
    if (!document) return;
    const from = Number(fromRevisionNumber);
    const to = Number(toRevisionNumber);
    if (!Number.isInteger(from) || !Number.isInteger(to) || from === to) return;
    setIsComparing(true);
    setError(false);
    try {
      setComparison(await onCompare(document.id, from, to));
    } catch {
      setError(true);
    } finally {
      setIsComparing(false);
    }
  };

  const submitRestore = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      !document ||
      !restoreRevision ||
      !changeSummary.trim() ||
      restorePreview === null ||
      (restoreMode === 'SELECTION' && !restoreSelectionValid)
    )
      return;
    setIsSubmitting(true);
    setError(false);
    try {
      await onRestore({
        documentId: document.id,
        targetRevisionNumber: restoreRevision.revisionNumber,
        changeSummary: changeSummary.trim(),
        expectedVersion: document.currentVersion,
        selection: restoreMode === 'SELECTION' ? selection : null,
      });
      setRestoreRevisionNumber(null);
      setChangeSummary('');
    } catch {
      setError(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <TPanel title={t('story.workspace.history.title')}>
        {!document ? (
          <p className="py-4 font-sans text-[12px] text-[var(--t-faint)]">
            {t('story.workspace.noSelection')}
          </p>
        ) : documentRevisions.length ? (
          <div className="space-y-3">
            <div className="divide-y divide-[var(--t-noise)]">
              {documentRevisions.map((revision) => (
                <article
                  key={revision.id}
                  className="grid gap-2 py-3 first:pt-0 sm:grid-cols-[72px_minmax(0,1fr)_auto] sm:items-start"
                >
                  <span className="font-mono text-[11px] text-[var(--t-accent)]">
                    {t('story.workspace.editor.version', { version: revision.revisionNumber })}
                  </span>
                  <div className="min-w-0">
                    <p className="break-words font-sans text-[12px] text-white">
                      {revision.changeSummary}
                    </p>
                    <p className="mt-1 font-sans text-[10px] text-[var(--t-faint)]">
                      {revision.authorAgentId} · {formatDate(revision.createdAt)}
                    </p>
                  </div>
                  <TButton
                    size="sm"
                    variant="secondary"
                    disabled={revision.revisionNumber >= (document?.currentVersion ?? 0)}
                    onClick={() => void beginRestore(revision)}
                  >
                    <RotateCcw className="h-3 w-3" />
                    {t('story.workspace.history.restore')}
                  </TButton>
                </article>
              ))}
            </div>

            {hasMore ? (
              <div className="border-t border-[var(--t-noise)] pt-3">
                <TButton
                  size="sm"
                  variant="secondary"
                  disabled={isLoadingMore}
                  onClick={onLoadMore}
                >
                  {t(
                    isLoadingMore
                      ? 'story.workspace.history.loadingMore'
                      : 'story.workspace.history.loadMore',
                  )}
                </TButton>
              </div>
            ) : null}

            <div className="border-t border-[var(--t-noise)] pt-4">
              <p className="mb-3 font-sans text-[12px] font-semibold text-white">
                {t('story.workspace.history.compare')}
              </p>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
                <RevisionSelect
                  label={t('story.workspace.history.from')}
                  value={fromRevisionNumber}
                  revisions={documentRevisions}
                  onChange={setFromRevisionNumber}
                />
                <RevisionSelect
                  label={t('story.workspace.history.to')}
                  value={toRevisionNumber}
                  revisions={documentRevisions}
                  onChange={setToRevisionNumber}
                />
                <TButton
                  variant="secondary"
                  disabled={
                    isComparing ||
                    !fromRevisionNumber ||
                    !toRevisionNumber ||
                    fromRevisionNumber === toRevisionNumber
                  }
                  onClick={() => void compareRevisions()}
                >
                  {t('story.workspace.history.compare')}
                </TButton>
              </div>
              {comparison ? (
                comparison.changes.length ? (
                  <div className="mt-3 divide-y divide-[var(--t-noise)] border-t border-[var(--t-noise)]">
                    {comparison.changes.map((change) => (
                      <div
                        key={change.field}
                        className="grid gap-2 py-3 lg:grid-cols-[100px_minmax(0,1fr)_minmax(0,1fr)]"
                      >
                        <span className="font-mono text-[10px] text-[var(--t-faint)]">
                          {t(`story.workspace.history.fields.${change.field}`)}
                        </span>
                        <RevisionContent
                          title={t('story.workspace.history.before')}
                          content={formatComparisonValue(change.before)}
                        />
                        <RevisionContent
                          title={t('story.workspace.history.after')}
                          content={formatComparisonValue(change.after)}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 border-t border-[var(--t-noise)] pt-3 font-sans text-[11px] text-[var(--t-faint)]">
                    {t('story.workspace.history.noChanges')}
                  </p>
                )
              ) : null}
            </div>
          </div>
        ) : (
          <p className="py-4 font-sans text-[12px] text-[var(--t-faint)]">
            {t('story.workspace.history.empty')}
          </p>
        )}
        {error ? (
          <div className="mt-3">
            <ActionError />
          </div>
        ) : null}
      </TPanel>

      {restoreRevision && restoreSnapshot && document ? (
        <TPanel title={t('story.workspace.history.restoreTitle')}>
          <p className="mb-3 font-sans text-[12px] leading-5 text-[var(--t-sub)]">
            {t('story.workspace.history.restoreDescription')}
          </p>
          <form className="space-y-3" onSubmit={(event) => void submitRestore(event)}>
            <label className="block space-y-1.5">
              <span className="font-sans text-[11px] font-medium text-[var(--t-sub)]">
                {t('story.workspace.history.restoreMode')}
              </span>
              <select
                value={restoreMode}
                onChange={(event) => setRestoreMode(event.target.value as 'WHOLE' | 'SELECTION')}
                className="skynet-input h-10 w-full px-3 font-sans text-[12px]"
              >
                <option value="WHOLE">{t('story.workspace.history.restoreWhole')}</option>
                <option value="SELECTION">{t('story.workspace.history.restoreSelection')}</option>
              </select>
            </label>
            {restoreMode === 'SELECTION' ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <LineRange
                  label={t('story.workspace.history.currentLines')}
                  start={selection.currentStartLine}
                  end={selection.currentEndLine}
                  max={document.content.split('\n').length}
                  onChange={(key, value) =>
                    setSelection((current) => ({ ...current, [key]: value }))
                  }
                />
                <LineRange
                  label={t('story.workspace.history.targetLines')}
                  start={selection.targetStartLine}
                  end={selection.targetEndLine}
                  max={restoreTargetContent.split('\n').length}
                  onChange={(key, value) =>
                    setSelection((current) => ({ ...current, [key]: value }))
                  }
                />
              </div>
            ) : null}
            <div className="grid gap-3 lg:grid-cols-2">
              <RevisionContent
                title={t('story.workspace.history.currentContent')}
                content={document.content}
              />
              <RevisionContent
                title={t('story.workspace.history.restorePreview')}
                content={restorePreview ?? t('story.workspace.history.invalidSelection')}
              />
            </div>
            <label className="block space-y-1.5">
              <span className="font-sans text-[11px] font-medium text-[var(--t-sub)]">
                {t('story.workspace.history.restoreReason')}
              </span>
              <TTextarea
                value={changeSummary}
                onChange={(event) => setChangeSummary(event.target.value)}
                placeholder={t('story.workspace.history.restoreReasonPlaceholder')}
                rows={2}
                maxLength={280}
              />
            </label>
            <div className="flex justify-end gap-2">
              <TButton
                variant="secondary"
                onClick={() => setRestoreRevisionNumber(null)}
                disabled={isSubmitting}
              >
                {t('app.cancel')}
              </TButton>
              <TButton
                type="submit"
                variant="danger"
                disabled={
                  !changeSummary.trim() ||
                  restorePreview === null ||
                  (restoreMode === 'SELECTION' && !restoreSelectionValid) ||
                  isSubmitting
                }
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {t('story.workspace.history.confirmRestore')}
              </TButton>
            </div>
          </form>
        </TPanel>
      ) : null}
    </div>
  );
}

function RevisionSelect({
  label,
  value,
  revisions,
  onChange,
}: {
  label: string;
  value: string;
  revisions: StoryRevisionSummary[];
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <label className="block min-w-0 space-y-1.5">
      <span className="font-sans text-[11px] font-medium text-[var(--t-sub)]">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="skynet-input h-10 w-full px-3 font-sans text-[12px]"
      >
        <option value="">—</option>
        {revisions.map((revision) => (
          <option key={revision.id} value={revision.revisionNumber}>
            {t('story.workspace.editor.version', { version: revision.revisionNumber })} ·{' '}
            {revision.changeSummary}
          </option>
        ))}
      </select>
    </label>
  );
}

function LineRange({
  label,
  start,
  end,
  max,
  onChange,
}: {
  label: string;
  start: number;
  end: number;
  max: number;
  onChange: (
    key: 'currentStartLine' | 'currentEndLine' | 'targetStartLine' | 'targetEndLine',
    value: number,
  ) => void;
}) {
  const { t } = useTranslation();
  const prefix = label.startsWith('current') ? 'current' : 'target';
  return (
    <fieldset className="grid grid-cols-2 gap-2 border border-[var(--t-noise)] p-3">
      <legend className="px-1 font-sans text-[10px] text-[var(--t-sub)]">{label}</legend>
      <label className="space-y-1">
        <span className="block font-sans text-[10px] text-[var(--t-faint)]">
          {t('story.workspace.history.lineStart')}
        </span>
        <input
          type="number"
          min={1}
          max={max}
          value={start}
          onChange={(event) =>
            onChange(
              `${prefix}StartLine` as 'currentStartLine' | 'targetStartLine',
              Number(event.target.value),
            )
          }
          className="skynet-input h-9 w-full px-2 font-mono text-[12px]"
        />
      </label>
      <label className="space-y-1">
        <span className="block font-sans text-[10px] text-[var(--t-faint)]">
          {t('story.workspace.history.lineEnd')}
        </span>
        <input
          type="number"
          min={1}
          max={max}
          value={end}
          onChange={(event) =>
            onChange(
              `${prefix}EndLine` as 'currentEndLine' | 'targetEndLine',
              Number(event.target.value),
            )
          }
          className="skynet-input h-9 w-full px-2 font-mono text-[12px]"
        />
      </label>
    </fieldset>
  );
}

function RevisionContent({ title, content }: { title: string; content: string }) {
  return (
    <div className="min-w-0 border border-[var(--t-noise)] bg-black/60">
      <p className="border-b border-[var(--t-noise)] px-2.5 py-1.5 font-sans text-[10px] font-semibold text-[var(--t-sub)]">
        {title}
      </p>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words p-2.5 font-mono text-[11px] leading-5 text-[var(--t-text)]">
        {content || ' '}
      </pre>
    </div>
  );
}

function ActionError() {
  const { t } = useTranslation();
  return (
    <p role="alert" className="font-sans text-[12px] text-[var(--t-hazard)]">
      {t('story.workspace.actionFailed')}
    </p>
  );
}

function formatDate(value: string, language?: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat(language?.startsWith('zh') ? 'zh-CN' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatComparisonValue(value: StoryComparison['changes'][number]['before']): string {
  if (value === null) return '∅';
  if (Array.isArray(value)) return JSON.stringify(value, null, 2);
  return String(value);
}
