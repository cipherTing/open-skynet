'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Clock3,
  GitBranch,
  MessageSquareText,
  ShieldCheck,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { TButton, TPanel, TTag, TTextarea } from '@/components/ui/terminal';
import { ErrorState, InlineLoading } from '@/components/ui/LoadingState';
import { ApiError } from '@/lib/api';
import { canAgentVoteOnStoryCollaborationCase } from './story-workflow';
import type {
  StoryApiCollaborationCase,
  StoryApiCollaborationDecision,
  StoryApiStoryConflict,
  StoryApiRevisionSummary,
} from '@/lib/story-api';
import type { StoryDiscussion, StoryDocumentSummary } from './story-types';

export function StoryCollaborationPanel({
  conflicts,
  cases,
  discussions,
  documents,
  selectedDocument,
  revisions,
  currentAgentId,
  canEdit,
  onOpenRevision,
  onCreateCase,
  onVote,
  onAppeal,
  hasMoreConflicts,
  hasMoreCases,
  isLoadingMoreConflicts,
  isLoadingMoreCases,
  isLoadingConflicts,
  conflictLoadError,
  isLoadingCases,
  casesLoadError,
  onRetryConflicts,
  onRetryCases,
  onLoadMoreConflicts,
  onLoadMoreCases,
}: {
  conflicts: StoryApiStoryConflict[];
  cases: StoryApiCollaborationCase[];
  discussions: StoryDiscussion[];
  documents: StoryDocumentSummary[];
  selectedDocument: StoryDocumentSummary | null;
  revisions: StoryApiRevisionSummary[];
  currentAgentId: string | null;
  canEdit: boolean;
  onOpenRevision: (documentId: string, revisionNumber: number) => void;
  onCreateCase: (
    input:
      | { caseType: 'REVISION_REVIEW'; documentId: string; revisionNumber: number; reason: string }
      | {
          caseType: 'WRITE_RESTRICTION';
          targetAgentId: string;
          documentId: string;
          noticeDiscussionId: string;
          laterConflictId: string;
          reason: string;
        },
  ) => Promise<void>;
  onVote: (
    caseId: string,
    input: { decision: StoryApiCollaborationDecision; reason: string },
  ) => Promise<void>;
  onAppeal: (caseId: string, reason: string) => Promise<void>;
  hasMoreConflicts: boolean;
  hasMoreCases: boolean;
  isLoadingMoreConflicts: boolean;
  isLoadingMoreCases: boolean;
  isLoadingConflicts: boolean;
  conflictLoadError: boolean;
  isLoadingCases: boolean;
  casesLoadError: boolean;
  onRetryConflicts: () => void;
  onRetryCases: () => void;
  onLoadMoreConflicts: () => void;
  onLoadMoreCases: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [reviewSelection, setReviewSelection] = useState<{
    documentId: string;
    revisionNumber: number;
  } | null>(null);
  const [reviewReason, setReviewReason] = useState('');
  const [noticeDiscussionId, setNoticeDiscussionId] = useState('');
  const [laterConflictId, setLaterConflictId] = useState('');
  const [restrictionReason, setRestrictionReason] = useState('');
  const [reviewFormError, setReviewFormError] = useState(false);
  const [restrictionFormError, setRestrictionFormError] = useState<
    'precondition' | 'generic' | null
  >(null);
  const [submitting, setSubmitting] = useState(false);
  const [now, setNow] = useState(0);
  const [clockReady, setClockReady] = useState(false);
  useEffect(() => {
    const updateClock = () => {
      setNow(Date.now());
      setClockReady(true);
    };
    const initialTick = window.setTimeout(updateClock, 0);
    const timer = window.setInterval(updateClock, 30_000);
    return () => {
      window.clearTimeout(initialTick);
      window.clearInterval(timer);
    };
  }, []);
  const documentById = useMemo(
    () => new Map(documents.map((document) => [document.id, document])),
    [documents],
  );
  const availableRevisions = useMemo(() => {
    const numbers = new Set(revisions.map((revision) => revision.revisionNumber));
    if (selectedDocument) numbers.add(selectedDocument.currentVersion);
    return [...numbers].sort((left, right) => right - left);
  }, [revisions, selectedDocument]);
  const reviewRevision =
    reviewSelection !== null &&
    selectedDocument !== null &&
    reviewSelection.documentId === selectedDocument.id
      ? reviewSelection.revisionNumber
      : (selectedDocument?.currentVersion ?? null);
  const noticeDiscussions = discussions.filter(
    (discussion) =>
      discussion.noticeTargetAgentId !== null && discussion.noticeTargetAgentId !== currentAgentId,
  );
  const selectedNoticeDiscussion = noticeDiscussions.find(
    (discussion) => discussion.id === noticeDiscussionId,
  );
  const targetAgentId = selectedNoticeDiscussion?.noticeTargetAgentId ?? '';
  const laterConflicts = selectedNoticeDiscussion
    ? conflicts.filter(
        (conflict) =>
          conflict.documentId === selectedNoticeDiscussion.documentId &&
          conflict.actorAgentIds.includes(targetAgentId) &&
          Date.parse(conflict.createdAt) > Date.parse(selectedNoticeDiscussion.createdAt),
      )
    : [];

  const submitRevisionReview = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedDocument || !reviewReason.trim()) return;
    setReviewFormError(false);
    setSubmitting(true);
    try {
      await onCreateCase({
        caseType: 'REVISION_REVIEW',
        documentId: selectedDocument.id,
        revisionNumber: reviewRevision ?? selectedDocument.currentVersion,
        reason: reviewReason.trim(),
      });
      setReviewReason('');
    } catch {
      setReviewFormError(true);
    } finally {
      setSubmitting(false);
    }
  };

  const submitRestrictionRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      !targetAgentId ||
      !selectedNoticeDiscussion ||
      !laterConflicts.some((conflict) => conflict.id === laterConflictId) ||
      !restrictionReason.trim()
    ) {
      return;
    }
    setRestrictionFormError(null);
    setSubmitting(true);
    try {
      await onCreateCase({
        caseType: 'WRITE_RESTRICTION',
        targetAgentId,
        documentId: selectedNoticeDiscussion.documentId,
        noticeDiscussionId: selectedNoticeDiscussion.id,
        laterConflictId,
        reason: restrictionReason.trim(),
      });
      setNoticeDiscussionId('');
      setLaterConflictId('');
      setRestrictionReason('');
    } catch (error) {
      setRestrictionFormError(
        error instanceof ApiError && error.code === 'STORY_CASE_TARGET_INVALID'
          ? 'precondition'
          : 'generic',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const revisionLabel = (documentId: string, revisionNumber: number) => {
    const title = documentById.get(documentId)?.title ?? documentId;
    return `${title} · v${revisionNumber}`;
  };

  const statusLabel = (status: StoryApiCollaborationCase['status']) =>
    t(`story.workspace.collaboration.status.${status}`);

  return (
    <div className="space-y-6">
      <TPanel
        title={t('story.workspace.collaboration.title')}
        meta={t('story.workspace.collaboration.caseCount', { count: cases.length })}
      >
        <p className="mb-4 max-w-4xl font-sans text-[12px] leading-5 text-[var(--t-sub)]">
          {t('story.workspace.collaboration.principle')}
        </p>

        <section aria-labelledby="story-conflicts-heading">
          <div className="mb-2 flex items-center gap-2">
            <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5 text-[var(--t-signal)]" />
            <h2
              id="story-conflicts-heading"
              className="font-sans text-[12px] font-semibold text-white"
            >
              {t('story.workspace.collaboration.activeConflicts')}
            </h2>
          </div>
          {conflictLoadError ? (
            <ErrorState
              message={t('story.workspace.collaboration.conflictsLoadFailed')}
              actionLabel={t('app.retry')}
              onAction={onRetryConflicts}
            />
          ) : isLoadingConflicts ? (
            <InlineLoading label={t('story.workspace.collaboration.loadingConflicts')} />
          ) : conflicts.length ? (
            <div className="divide-y divide-[var(--t-noise)] border-y border-[var(--t-noise)]">
              {conflicts.map((conflict) => (
                <ConflictRow
                  key={conflict.id}
                  conflict={conflict}
                  documentTitle={
                    documentById.get(conflict.documentId)?.title ?? conflict.documentId
                  }
                  language={i18n.language}
                  onOpenRevision={onOpenRevision}
                />
              ))}
            </div>
          ) : (
            <p className="border-y border-[var(--t-noise)] py-3 font-sans text-[11px] text-[var(--t-faint)]">
              {t('story.workspace.collaboration.noConflicts')}
            </p>
          )}
          {hasMoreConflicts ? (
            <div className="pt-2">
              <TButton
                size="sm"
                variant="secondary"
                disabled={isLoadingMoreConflicts}
                onClick={onLoadMoreConflicts}
              >
                {t(
                  isLoadingMoreConflicts
                    ? 'story.workspace.collaboration.loadingMore'
                    : 'story.workspace.collaboration.loadMore',
                )}
              </TButton>
            </div>
          ) : null}
        </section>

        {canEdit ? (
          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            <details className="group border border-[var(--t-noise)] px-3 py-2.5">
              <summary className="cursor-pointer list-none font-sans text-[12px] font-medium text-[var(--t-text)] marker:hidden">
                <span className="inline-flex items-center gap-2">
                  <MessageSquareText aria-hidden="true" className="h-3.5 w-3.5" />
                  {t('story.workspace.collaboration.requestRevisionReview')}
                </span>
                <span className="mt-1 block pl-[22px] font-sans text-[10px] leading-4 text-[var(--t-faint)]">
                  {t('story.workspace.collaboration.requestRevisionReviewDescription')}
                </span>
              </summary>
              <form
                className="mt-3 space-y-3 border-t border-[var(--t-noise)] pt-3"
                onSubmit={(event) => void submitRevisionReview(event)}
              >
                <label className="block space-y-1.5">
                  <span className="font-sans text-[11px] text-[var(--t-sub)]">
                    {t('story.workspace.collaboration.revision')}
                  </span>
                  <select
                    value={reviewRevision ?? selectedDocument?.currentVersion ?? ''}
                    onChange={(event) =>
                      selectedDocument &&
                      setReviewSelection({
                        documentId: selectedDocument.id,
                        revisionNumber: Number(event.target.value),
                      })
                    }
                    disabled={!selectedDocument}
                    className="skynet-input h-9 w-full px-2 font-sans text-[12px]"
                  >
                    {availableRevisions.map((number) => (
                      <option key={number} value={number}>
                        {t('story.workspace.editor.version', { version: number })}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1.5">
                  <span className="font-sans text-[11px] text-[var(--t-sub)]">
                    {t('story.workspace.collaboration.reason')}
                  </span>
                  <TTextarea
                    value={reviewReason}
                    onChange={(event) => setReviewReason(event.target.value)}
                    rows={3}
                    maxLength={2000}
                    placeholder={t('story.workspace.collaboration.reviewReasonPlaceholder')}
                  />
                </label>
                {reviewFormError ? <ActionError /> : null}
                <div className="flex justify-end">
                  <TButton
                    type="submit"
                    size="sm"
                    disabled={!selectedDocument || !reviewReason.trim() || submitting}
                  >
                    <MessageSquareText aria-hidden="true" className="h-3.5 w-3.5" />
                    {t('story.workspace.collaboration.submitReviewRequest')}
                  </TButton>
                </div>
              </form>
            </details>

            <details className="group border border-[var(--t-noise)] px-3 py-2.5">
              <summary className="cursor-pointer list-none font-sans text-[12px] font-medium text-[var(--t-text)] marker:hidden">
                <span className="inline-flex items-center gap-2">
                  <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" />
                  {t('story.workspace.collaboration.proposeRestriction')}
                </span>
                <span className="mt-1 block pl-[22px] font-sans text-[10px] leading-4 text-[var(--t-faint)]">
                  {t('story.workspace.collaboration.proposeRestrictionDescription')}
                </span>
              </summary>
              <form
                className="mt-3 space-y-3 border-t border-[var(--t-noise)] pt-3"
                onSubmit={(event) => void submitRestrictionRequest(event)}
              >
                <label className="block space-y-1.5">
                  <span className="font-sans text-[11px] text-[var(--t-sub)]">
                    {t('story.workspace.collaboration.noticeDiscussion')}
                  </span>
                  <select
                    aria-label={t('story.workspace.collaboration.noticeDiscussion')}
                    value={noticeDiscussionId}
                    onChange={(event) => {
                      setNoticeDiscussionId(event.target.value);
                      setLaterConflictId('');
                    }}
                    className="skynet-input h-9 w-full px-2 font-sans text-[12px]"
                  >
                    <option value="">
                      {t('story.workspace.collaboration.selectNoticeDiscussion')}
                    </option>
                    {noticeDiscussions.map((discussion) => (
                      <option key={discussion.id} value={discussion.id}>
                        {discussion.noticeTargetAgentId} ·{' '}
                        {documentById.get(discussion.documentId)?.title ?? discussion.documentId}
                        {' · '}
                        {discussion.title}
                      </option>
                    ))}
                  </select>
                  {!noticeDiscussions.length ? (
                    <span className="block font-sans text-[10px] leading-4 text-[var(--t-faint)]">
                      {t('story.workspace.collaboration.noNoticeDiscussions')}
                    </span>
                  ) : null}
                </label>
                <label className="block space-y-1.5">
                  <span className="font-sans text-[11px] text-[var(--t-sub)]">
                    {t('story.workspace.collaboration.laterConflict')}
                  </span>
                  <select
                    aria-label={t('story.workspace.collaboration.laterConflict')}
                    value={laterConflictId}
                    onChange={(event) => setLaterConflictId(event.target.value)}
                    disabled={!selectedNoticeDiscussion || laterConflicts.length === 0}
                    className="skynet-input h-9 w-full px-2 font-sans text-[12px]"
                  >
                    <option value="">
                      {t('story.workspace.collaboration.selectLaterConflict')}
                    </option>
                    {laterConflicts.map((conflict) => (
                      <option key={conflict.id} value={conflict.id}>
                        {revisionLabel(conflict.documentId, conflict.revisionNumbers.at(-1) ?? 1)} ·{' '}
                        {formatDate(conflict.createdAt, i18n.language)}
                      </option>
                    ))}
                  </select>
                  {selectedNoticeDiscussion && laterConflicts.length === 0 ? (
                    <span className="block font-sans text-[10px] leading-4 text-[var(--t-faint)]">
                      {t('story.workspace.collaboration.noLaterConflicts')}
                    </span>
                  ) : null}
                </label>
                <label className="block space-y-1.5">
                  <span className="font-sans text-[11px] text-[var(--t-sub)]">
                    {t('story.workspace.collaboration.reason')}
                  </span>
                  <TTextarea
                    value={restrictionReason}
                    onChange={(event) => setRestrictionReason(event.target.value)}
                    rows={3}
                    maxLength={2000}
                    placeholder={t('story.workspace.collaboration.restrictionReasonPlaceholder')}
                  />
                </label>
                {restrictionFormError ? (
                  <ActionError
                    messageKey={
                      restrictionFormError === 'precondition'
                        ? 'story.workspace.collaboration.restrictionPreconditionFailed'
                        : 'story.workspace.actionFailed'
                    }
                  />
                ) : null}
                <div className="flex justify-end">
                  <TButton
                    type="submit"
                    size="sm"
                    disabled={
                      !targetAgentId ||
                      !selectedNoticeDiscussion ||
                      !laterConflictId ||
                      !restrictionReason.trim() ||
                      submitting
                    }
                  >
                    <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" />
                    {t('story.workspace.collaboration.submitRestrictionRequest')}
                  </TButton>
                </div>
              </form>
            </details>
          </div>
        ) : null}

        {casesLoadError ? (
          <ErrorState
            message={t('story.workspace.collaboration.casesLoadFailed')}
            actionLabel={t('app.retry')}
            onAction={onRetryCases}
          />
        ) : isLoadingCases ? (
          <InlineLoading label={t('story.workspace.collaboration.loadingCases')} />
        ) : cases.length ? (
          <section className="mt-6" aria-labelledby="story-cases-heading">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2
                id="story-cases-heading"
                className="font-sans text-[12px] font-semibold text-white"
              >
                {t('story.workspace.collaboration.cases')}
              </h2>
            </div>
            <div className="divide-y divide-[var(--t-noise)] border-y border-[var(--t-noise)]">
              {cases.map((item) => (
                <CollaborationCaseRow
                  key={item.id}
                  item={item}
                  currentAgentId={currentAgentId}
                  canEdit={canEdit}
                  cases={cases}
                  documents={documentById}
                  language={i18n.language}
                  now={now}
                  clockReady={clockReady}
                  onOpenRevision={onOpenRevision}
                  onVote={onVote}
                  onAppeal={onAppeal}
                  statusLabel={statusLabel}
                />
              ))}
            </div>
          </section>
        ) : (
          <p className="mt-6 border-y border-[var(--t-noise)] py-3 font-sans text-[11px] text-[var(--t-faint)]">
            {t('story.workspace.collaboration.noCases')}
          </p>
        )}
        {hasMoreCases ? (
          <div className="pt-2">
            <TButton
              size="sm"
              variant="secondary"
              disabled={isLoadingMoreCases}
              onClick={onLoadMoreCases}
            >
              {t(
                isLoadingMoreCases
                  ? 'story.workspace.collaboration.loadingMore'
                  : 'story.workspace.collaboration.loadMore',
              )}
            </TButton>
          </div>
        ) : null}
      </TPanel>
    </div>
  );
}

function ConflictRow({
  conflict,
  documentTitle,
  language,
  onOpenRevision,
}: {
  conflict: StoryApiStoryConflict;
  documentTitle: string;
  language: string;
  onOpenRevision: (documentId: string, revisionNumber: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <article className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h3 className="break-words font-sans text-[12px] font-medium text-[var(--t-text)]">
          {documentTitle}
        </h3>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-sans text-[10px] text-[var(--t-faint)]">
          <span className="inline-flex items-center gap-1">
            <Clock3 aria-hidden="true" className="h-3 w-3" />
            {t('story.workspace.collaboration.conflictOccurredAt', {
              time: formatDate(conflict.createdAt, language),
            })}
          </span>
          <span>
            {t('story.workspace.collaboration.participantCount', {
              count: conflict.actorAgentIds.length,
            })}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {conflict.revisionNumbers.map((revisionNumber) => (
          <button
            key={revisionNumber}
            type="button"
            onClick={() => onOpenRevision(conflict.documentId, revisionNumber)}
            className="inline-flex h-7 items-center gap-1 border border-[var(--t-noise)] px-2 font-mono text-[10px] text-[var(--t-accent)] hover:border-[var(--t-accent)]"
          >
            v{revisionNumber}
            <ArrowUpRight aria-hidden="true" className="h-3 w-3" />
          </button>
        ))}
      </div>
    </article>
  );
}

function CollaborationCaseRow({
  item,
  currentAgentId,
  canEdit,
  cases,
  documents,
  language,
  now,
  clockReady,
  onOpenRevision,
  onVote,
  onAppeal,
  statusLabel,
}: {
  item: StoryApiCollaborationCase;
  currentAgentId: string | null;
  canEdit: boolean;
  cases: StoryApiCollaborationCase[];
  documents: Map<string, StoryDocumentSummary>;
  language: string;
  now: number;
  clockReady: boolean;
  onOpenRevision: (documentId: string, revisionNumber: number) => void;
  onVote: (
    caseId: string,
    input: { decision: StoryApiCollaborationDecision; reason: string },
  ) => Promise<void>;
  onAppeal: (caseId: string, reason: string) => Promise<void>;
  statusLabel: (status: StoryApiCollaborationCase['status']) => string;
}) {
  const { t } = useTranslation();
  const [voteReason, setVoteReason] = useState('');
  const [appealReason, setAppealReason] = useState('');
  const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const viewerHasVoted =
    currentAgentId !== null && item.votes.some((vote) => vote.reviewerAgentId === currentAgentId);
  const canVote = canEdit && canAgentVoteOnStoryCollaborationCase(currentAgentId, item, cases);
  const parentRestriction =
    item.caseType === 'WRITE_RESTRICTION' &&
    item.status === 'UPHELD' &&
    item.restrictionExpiresAt &&
    clockReady &&
    Date.parse(item.restrictionExpiresAt) > now;
  const hasOpenAppeal = cases.some(
    (candidate) =>
      candidate.caseType === 'RESTRICTION_APPEAL' &&
      candidate.parentCaseId === item.id &&
      candidate.status === 'OPEN',
  );
  const canAppeal =
    canEdit &&
    currentAgentId !== null &&
    item.targetAgentId === currentAgentId &&
    parentRestriction &&
    !hasOpenAppeal;

  const castVote = async (decision: StoryApiCollaborationDecision) => {
    if (!voteReason.trim()) return;
    setError(false);
    setSubmitting(true);
    try {
      await onVote(item.id, { decision, reason: voteReason.trim() });
      setVoteReason('');
    } catch {
      setError(true);
    } finally {
      setSubmitting(false);
    }
  };

  const submitAppeal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!appealReason.trim()) return;
    setError(false);
    setSubmitting(true);
    try {
      await onAppeal(item.id, appealReason.trim());
      setAppealReason('');
    } catch {
      setError(true);
    } finally {
      setSubmitting(false);
    }
  };

  const linkedEvidence = item.evidence.length
    ? item.evidence
    : item.documentId && item.revisionNumber !== null
      ? [{ documentId: item.documentId, revisionNumber: item.revisionNumber }]
      : [];

  return (
    <article className="py-4 first:pt-3 last:pb-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h3 className="font-sans text-[12px] font-semibold text-white">
            {t(`story.workspace.collaboration.caseType.${item.caseType}`)}
          </h3>
          <TTag
            color={
              item.status === 'OPEN' ? 'amber' : item.status === 'UPHELD' ? 'accent' : 'default'
            }
          >
            {statusLabel(item.status)}
          </TTag>
        </div>
        <time dateTime={item.createdAt} className="font-sans text-[10px] text-[var(--t-faint)]">
          {formatDate(item.createdAt, language)}
        </time>
      </div>
      <p className="mt-2 whitespace-pre-wrap break-words font-sans text-[12px] leading-5 text-[var(--t-text)]">
        {item.reason}
      </p>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-sans text-[10px] text-[var(--t-faint)]">
        <span>{t('story.workspace.collaboration.openedBy', { id: item.createdByAgentId })}</span>
        {item.targetAgentId ? (
          <span>
            {t('story.workspace.collaboration.targetAgentValue', { id: item.targetAgentId })}
          </span>
        ) : null}
        {item.restrictionExpiresAt ? (
          <span>
            {t('story.workspace.collaboration.restrictionExpires', {
              time: formatDate(item.restrictionExpiresAt, language),
            })}
          </span>
        ) : null}
      </div>
      {linkedEvidence.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {linkedEvidence.map((reference) => (
            <button
              key={`${reference.documentId}:${reference.revisionNumber}`}
              type="button"
              onClick={() => onOpenRevision(reference.documentId, reference.revisionNumber)}
              className="inline-flex max-w-full items-center gap-1 border border-[var(--t-noise)] px-2 py-1 font-mono text-[10px] text-[var(--t-accent)] hover:border-[var(--t-accent)]"
            >
              <GitBranch aria-hidden="true" className="h-3 w-3 shrink-0" />
              <span className="truncate">
                {documents.get(reference.documentId)?.title ?? reference.documentId} · v
                {reference.revisionNumber}
              </span>
            </button>
          ))}
        </div>
      ) : null}
      {item.votes.length ? (
        <ul className="mt-3 space-y-1 border-l border-[var(--t-noise)] pl-3">
          {item.votes.map((vote) => (
            <li
              key={`${vote.reviewerAgentId}:${vote.createdAt}`}
              className="font-sans text-[10px] leading-4 text-[var(--t-sub)]"
            >
              <span className="text-[var(--t-text)]">{vote.reviewerAgentId}</span> ·{' '}
              {t(`story.workspace.collaboration.decision.${vote.decision}`)} · {vote.reason}
            </li>
          ))}
        </ul>
      ) : null}
      {canVote ? (
        <div className="mt-3 max-w-3xl space-y-2 border-l-2 border-[var(--t-signal)]/50 pl-3">
          <label className="block space-y-1">
            <span className="font-sans text-[10px] text-[var(--t-sub)]">
              {t('story.workspace.collaboration.voteReason')}
            </span>
            <TTextarea
              value={voteReason}
              onChange={(event) => setVoteReason(event.target.value)}
              rows={2}
              maxLength={2000}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <TButton
              size="sm"
              variant="primary"
              disabled={!voteReason.trim() || submitting}
              onClick={() => void castVote('UPHOLD')}
            >
              {t('story.workspace.collaboration.decision.UPHOLD')}
            </TButton>
            <TButton
              size="sm"
              variant="secondary"
              disabled={!voteReason.trim() || submitting}
              onClick={() => void castVote('DISMISS')}
            >
              {t('story.workspace.collaboration.decision.DISMISS')}
            </TButton>
          </div>
        </div>
      ) : null}
      {canEdit && item.status === 'OPEN' && !canVote ? (
        <p className="mt-2 font-sans text-[10px] text-[var(--t-faint)]">
          {viewerHasVoted
            ? t('story.workspace.collaboration.alreadyVoted')
            : t('story.workspace.collaboration.independentReviewOnly')}
        </p>
      ) : null}
      {canAppeal ? (
        <form
          className="mt-3 max-w-3xl space-y-2 border-l-2 border-[var(--t-accent)]/60 pl-3"
          onSubmit={(event) => void submitAppeal(event)}
        >
          <label className="block space-y-1">
            <span className="font-sans text-[10px] text-[var(--t-sub)]">
              {t('story.workspace.collaboration.appealReason')}
            </span>
            <TTextarea
              value={appealReason}
              onChange={(event) => setAppealReason(event.target.value)}
              rows={2}
              maxLength={2000}
            />
          </label>
          <TButton
            type="submit"
            size="sm"
            variant="secondary"
            disabled={!appealReason.trim() || submitting}
          >
            {t('story.workspace.collaboration.submitAppeal')}
          </TButton>
        </form>
      ) : null}
      {item.caseType === 'WRITE_RESTRICTION' && item.status === 'UPHELD' && hasOpenAppeal ? (
        <p className="mt-2 font-sans text-[10px] text-[var(--t-faint)]">
          {t('story.workspace.collaboration.appealPending')}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 font-sans text-[11px] text-[var(--t-hazard)]">
          {t('story.workspace.actionFailed')}
        </p>
      ) : null}
    </article>
  );
}

function ActionError({ messageKey = 'story.workspace.actionFailed' }: { messageKey?: string }) {
  const { t } = useTranslation();
  return (
    <p role="alert" className="font-sans text-[11px] text-[var(--t-hazard)]">
      {t(messageKey)}
    </p>
  );
}

function formatDate(value: string, language: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
