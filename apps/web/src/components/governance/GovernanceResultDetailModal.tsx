'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { FileText, MessageSquare, Scale, X } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { GovernanceResultDetail, GovernanceResultFeedItem, GovernanceTargetSnapshot } from '@skynet/shared';
import { governanceApi } from '@/lib/api';
import { GovernanceTimeline } from './GovernanceTimeline';
import { formatGovernanceDuration, getGovernanceResultKey, isGovernanceAuthError } from './governance-format';

interface GovernanceResultDetailModalProps {
  result: GovernanceResultFeedItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusRef: React.RefObject<HTMLElement | null>;
}

function getFocusable(container: HTMLElement | null) {
  if (!container) return [];
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute('disabled') && !element.getAttribute('aria-hidden'));
}

function formatTally(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '');
}

function SnapshotText({ content, emphasized = false }: { content: string; emphasized?: boolean }) {
  const isLong = content.length > 420 || content.split('\n').length > 7;
  const [expanded, setExpanded] = useState(emphasized || !isLong);
  const { t } = useTranslation();
  return (
    <div>
      <p className={expanded ? 'governance-snapshot-text governance-snapshot-text--full' : 'governance-snapshot-text'}>
        {content}
      </p>
      {isLong ? (
        <button
          type="button"
          className="governance-snapshot-expand"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
        >
          {expanded ? t('governance.detail.collapseContent') : t('governance.detail.expandContent')}
        </button>
      ) : null}
    </div>
  );
}

function PostSnapshot({ snapshot }: { snapshot: Extract<GovernanceTargetSnapshot, { kind: 'POST' }> }) {
  const { t } = useTranslation();
  return (
    <article className="governance-snapshot-post-card">
      <div className="governance-snapshot-post-card__header">
        <span className="governance-snapshot-source-pill"><FileText className="h-3.5 w-3.5" />{t('governance.card.sourcePost')}</span>
        <span>{new Date(snapshot.post.createdAt).toLocaleString()}</span>
      </div>
      <h3>{snapshot.post.title}</h3>
      <SnapshotText content={snapshot.post.content} emphasized />
    </article>
  );
}

function ReplySnapshot({ snapshot }: { snapshot: Extract<GovernanceTargetSnapshot, { kind: 'REPLY' }> }) {
  const { t } = useTranslation();
  return (
    <div className="governance-reply-thread" aria-label={t('governance.detail.targetSnapshot')}>
      <article className="governance-thread-post">
        <div className="governance-snapshot-post-card__header">
          <span className="governance-snapshot-source-pill"><FileText className="h-3.5 w-3.5" />{t('governance.detail.threadPost')}</span>
        </div>
        <h3>{snapshot.post.title}</h3>
        <SnapshotText content={snapshot.post.content} />
      </article>

      <div className="governance-reply-branch">
        {snapshot.parentReply ? (
          <article className="governance-reply-node governance-reply-node--parent">
            <span className="governance-reply-node__connector" />
            <p className="governance-reply-node__label">{t('governance.detail.parentReply')}</p>
            <SnapshotText content={snapshot.parentReply.content} />
          </article>
        ) : null}

        <article className="governance-reply-node governance-reply-node--target">
          <span className="governance-reply-node__connector" />
          <div className="flex items-center gap-2">
            <span className="governance-snapshot-source-pill governance-snapshot-source-pill--target"><MessageSquare className="h-3.5 w-3.5" />{t('governance.detail.reportedReply')}</span>
          </div>
          <SnapshotText content={snapshot.reply.content} emphasized />
        </article>
      </div>
    </div>
  );
}

function ProposalSnapshot({ snapshot }: { snapshot: Extract<GovernanceTargetSnapshot, { kind: 'CIRCLE_PROPOSAL' }> }) {
  const { t } = useTranslation();
  const content = snapshot.proposal.topicSnapshot
    ?? snapshot.proposal.rulesSnapshot?.map((rule) => rule.text).join('\n')
    ?? snapshot.proposal.reason;
  return <article className="governance-snapshot-post-card"><div className="governance-snapshot-post-card__header"><span className="governance-snapshot-source-pill"><Scale className="h-3.5 w-3.5" />{t('governance.targetTypes.CIRCLE_PROPOSAL')}</span><span>{new Date(snapshot.proposal.createdAt).toLocaleString()}</span></div><h3>{t(`circles.coBuild.scopes.${snapshot.proposal.scope}`)}</h3><SnapshotText content={content} emphasized /></article>;
}

function ProposalCommentSnapshot({ snapshot }: { snapshot: Extract<GovernanceTargetSnapshot, { kind: 'CIRCLE_PROPOSAL_COMMENT' }> }) {
  const { t } = useTranslation();
  return <article className="governance-snapshot-post-card"><div className="governance-snapshot-post-card__header"><span className="governance-snapshot-source-pill"><MessageSquare className="h-3.5 w-3.5" />{t('governance.targetTypes.CIRCLE_PROPOSAL_COMMENT')}</span><span>{new Date(snapshot.comment.createdAt).toLocaleString()}</span></div><SnapshotText content={snapshot.comment.content} emphasized /></article>;
}

function SnapshotRenderer({ snapshot }: { snapshot: GovernanceTargetSnapshot }) {
  if (snapshot.kind === 'POST') return <PostSnapshot snapshot={snapshot} />;
  if (snapshot.kind === 'REPLY') return <ReplySnapshot snapshot={snapshot} />;
  if (snapshot.kind === 'CIRCLE_PROPOSAL') return <ProposalSnapshot snapshot={snapshot} />;
  return <ProposalCommentSnapshot snapshot={snapshot} />;
}

function VoteSummary({ result }: { result: GovernanceResultFeedItem }) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="governance-detail-vote governance-detail-vote--violation">
        <p>{t('governance.metrics.violationVotes')}</p>
        <strong>{formatTally(result.tally.violation)}</strong>
      </div>
      <div className="governance-detail-vote governance-detail-vote--not-violation">
        <p>{t('governance.metrics.notViolationVotes')}</p>
        <strong>{formatTally(result.tally.notViolation)}</strong>
      </div>
    </div>
  );
}

export function GovernanceResultDetailModal({ result, open, onOpenChange, returnFocusRef }: GovernanceResultDetailModalProps) {
  const { t } = useTranslation();
  const prefersReducedMotion = useReducedMotion();
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const detailQuery = useQuery({
    queryKey: ['governance', 'result-detail', result?.id],
    queryFn: () => governanceApi.resultDetail(result!.id),
    enabled: open && !!result,
    retry: (failureCount, error) => !isGovernanceAuthError(error) && failureCount < 2,
  });
  const detail: GovernanceResultDetail | undefined = detailQuery.data;
  const displayResult = detail ?? result;

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const returnFocusElement = returnFocusRef.current;
    document.body.style.overflow = 'hidden';
    window.setTimeout(() => closeButtonRef.current?.focus(), 0);

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onOpenChange(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = getFocusable(dialogRef.current);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement;
      if (dialogRef.current && activeElement && !dialogRef.current.contains(activeElement)) {
        event.preventDefault();
        if (event.shiftKey) last.focus();
        else first.focus();
        return;
      }
      if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      returnFocusElement?.focus();
    };
  }, [open, onOpenChange, returnFocusRef]);

  return (
    <AnimatePresence>
      {open && displayResult && (
        <motion.div
          className="governance-detail-backdrop fixed inset-0 flex items-center justify-center bg-void/45 px-4 py-6 backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => onOpenChange(false)}
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            className="governance-detail-panel max-h-[90vh] w-full max-w-5xl overflow-y-auto p-0"
            initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 16 }}
            transition={{ duration: prefersReducedMotion ? 0.01 : 0.18 }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sticky top-0 z-10 border-b border-copper/10 bg-void-deep/95 px-6 py-4 backdrop-blur">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="deck-label">{t('governance.detail.title')}</p>
                  <h2 id={titleId} className="mt-1 text-xl font-bold text-ink-primary">
                    {t(`governance.results.${getGovernanceResultKey(displayResult.result)}`)}
                  </h2>
                  <p id={descriptionId} className="mt-1 text-xs text-ink-secondary">
                    {t('governance.detail.description')}
                  </p>
                </div>
                <button
                  ref={closeButtonRef}
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="rounded-full border border-copper/20 p-2 text-ink-secondary transition hover:border-copper/40 hover:text-copper"
                  aria-label={t('governance.detail.close')}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="space-y-5 p-6">
              <section className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-copper/10 bg-copper/5 p-3">
                  <p className="deck-label">{t('governance.detail.verdictSummary')}</p>
                  <p className="mt-2 text-base font-bold text-copper">{t(`governance.results.${getGovernanceResultKey(displayResult.result)}`)}</p>
                </div>
                <div className="rounded-xl border border-steel/10 bg-steel/5 p-3">
                  <p className="deck-label">{t('governance.targetType')}</p>
                  <p className="mt-2 flex items-center gap-2 text-base font-bold text-steel">
                    {displayResult.targetType === 'POST' ? <FileText className="h-4 w-4" /> : displayResult.targetType === 'CIRCLE_PROPOSAL' ? <Scale className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
                    {t(`governance.targetTypes.${displayResult.targetType}`)}
                  </p>
                </div>
                <div className="rounded-xl border border-moss/10 bg-moss/5 p-3">
                  <p className="deck-label">{t('governance.detail.duration')}</p>
                  <p className="mt-2 font-mono text-base font-bold text-moss">{formatGovernanceDuration(displayResult.durationMinutes, '—', t)}</p>
                </div>
              </section>

              <section className="rounded-2xl border border-ink-muted/10 bg-void/35 p-4">
                <p className="deck-label mb-3">{t('governance.detail.voteSummary')}</p>
                <VoteSummary result={displayResult} />
              </section>

              <section className="border-l-2 border-copper/45 pl-4">
                <p className="deck-label">{displayResult.resolutionSource === 'ADMIN' ? t('governance.detail.adminDecision') : t('governance.detail.communityDecision')}</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink-secondary">{displayResult.resolutionReason ?? t('governance.detail.noPublicReason')}</p>
              </section>

              <section className="rounded-2xl border border-ink-muted/10 bg-void/35 p-4">
                <p className="deck-label mb-3">{t('governance.detail.targetSnapshot')}</p>
                {detailQuery.isLoading ? (
                  <p className="text-sm text-ink-muted">{t('governance.detail.loadingDetail')}</p>
                ) : detailQuery.isError ? (
                  <p className="rounded-lg border border-ochre/20 bg-ochre/5 px-3 py-2 text-sm text-ochre">{t('governance.detail.loadFailed')}</p>
                ) : detail ? (
                  <SnapshotRenderer snapshot={detail.targetSnapshot} />
                ) : null}
              </section>

              <section className="rounded-2xl border border-ink-muted/10 bg-void/35 p-4">
                <p className="deck-label mb-3">{t('governance.detail.timeline')}</p>
                <GovernanceTimeline events={detail?.timelineEvents ?? []} />
              </section>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
