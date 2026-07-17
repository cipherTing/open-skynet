'use client';

import { useState } from 'react';
import { FileText, MessageSquare, Scale } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type {
  GovernanceResultDetail,
  GovernanceResultFeedItem,
  GovernanceTargetSnapshot,
} from '@skynet/shared';
import { governanceApi } from '@/lib/api';
import { GovernanceTimeline } from './GovernanceTimeline';
import {
  formatGovernanceDuration,
  getGovernanceResultKey,
  isGovernanceAuthError,
} from './governance-format';
import {
  GovernanceAlertRail,
  GovernanceChapterTitle,
  GovernanceVoteCompare,
} from './GovernanceTerminal';
import { PostTags } from '@/components/forum/PostTags';
import { TPanel } from '@/components/ui/terminal/TPanel';
import { TerminalDialog } from '@/components/ui/TerminalDialog';

interface GovernanceResultDetailModalProps {
  result: GovernanceResultFeedItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusRef: React.RefObject<HTMLElement | null>;
}

function SnapshotText({ content, emphasized = false }: { content: string; emphasized?: boolean }) {
  const isLong = content.length > 420 || content.split('\n').length > 7;
  const [expanded, setExpanded] = useState(emphasized || !isLong);
  const { t } = useTranslation();
  return (
    <div>
      <p
        className={`whitespace-pre-wrap text-sm leading-7 text-text-secondary [overflow-wrap:anywhere] ${
          expanded ? '' : 'line-clamp-6'
        }`}
      >
        {content}
      </p>
      {isLong ? (
        <button
          type="button"
          className="mt-2 border border-border-accent bg-accent-muted px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.12em] text-accent transition-colors hover:bg-surface-hover"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
        >
          {expanded ? t('governance.detail.collapseContent') : t('governance.detail.expandContent')}
        </button>
      ) : null}
    </div>
  );
}

function SnapshotSourcePill({
  icon,
  label,
  tone = 'accent',
}: {
  icon: React.ReactNode;
  label: string;
  tone?: 'accent' | 'info';
}) {
  const toneClass =
    tone === 'info'
      ? 'border-info/30 bg-info/10 text-info'
      : 'border-border-accent bg-accent-muted text-accent';
  return (
    <span
      className={`inline-flex items-center gap-1.5 border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] ${toneClass}`}
    >
      {icon}
      {label}
    </span>
  );
}

function PostSnapshot({
  snapshot,
}: {
  snapshot: Extract<GovernanceTargetSnapshot, { kind: 'POST' }>;
}) {
  const { t } = useTranslation();
  return (
    <article className="border border-border-subtle bg-surface-3 p-4">
      <div className="flex items-center justify-between gap-3 font-mono text-[11px] tabular-nums text-text-tertiary">
        <SnapshotSourcePill
          icon={<FileText className="h-3.5 w-3.5" />}
          label={t('governance.card.sourcePost')}
        />
        <span>{new Date(snapshot.post.createdAt).toLocaleString()}</span>
      </div>
      <h3 className="mt-2.5 text-base font-bold text-text-primary">{snapshot.post.title}</h3>
      <div className="mb-3 mt-2 flex flex-wrap items-center gap-2">
        <PostTags tags={snapshot.post.tags} />
        <span className="font-mono text-[10px] text-text-tertiary">
          {t('governance.detail.contentVersion', { version: snapshot.post.contentVersion })}
        </span>
      </div>
      <SnapshotText content={snapshot.post.content} emphasized />
    </article>
  );
}

function ReplySnapshot({
  snapshot,
}: {
  snapshot: Extract<GovernanceTargetSnapshot, { kind: 'REPLY' }>;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-3" aria-label={t('governance.detail.targetSnapshot')}>
      <article className="border border-border-subtle bg-surface-3 p-4">
        <div className="flex items-center justify-between gap-3 font-mono text-[11px] text-text-tertiary">
          <SnapshotSourcePill
            icon={<FileText className="h-3.5 w-3.5" />}
            label={t('governance.detail.threadPost')}
          />
        </div>
        <h3 className="mt-2.5 text-base font-bold text-text-primary">{snapshot.post.title}</h3>
        <div className="mb-3 mt-2 flex flex-wrap items-center gap-2">
          <PostTags tags={snapshot.post.tags} />
          <span className="font-mono text-[10px] text-text-tertiary">
            {t('governance.detail.contentVersion', { version: snapshot.post.contentVersion })}
          </span>
        </div>
        <SnapshotText content={snapshot.post.content} />
      </article>

      <div className="ml-5 grid gap-3 border-l border-accent-dim/40 pl-4">
        {snapshot.parentReply ? (
          <article className="relative border border-border-subtle bg-surface-3 p-4">
            <span className="absolute -left-4 top-6 w-4 border-t border-accent-dim/40" />
            <p className="mb-2 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-text-tertiary">
              {t('governance.detail.parentReply')}
            </p>
            <p className="mb-2 font-mono text-[10px] text-text-tertiary">
              {t('governance.detail.contentVersion', {
                version: snapshot.parentReply.contentVersion,
              })}
            </p>
            <SnapshotText content={snapshot.parentReply.content} />
          </article>
        ) : null}

        <article className="relative border border-info/40 bg-info/10 p-4">
          <span className="absolute -left-4 top-6 w-4 border-t border-accent-dim/40" />
          <div className="flex items-center gap-2">
            <SnapshotSourcePill
              icon={<MessageSquare className="h-3.5 w-3.5" />}
              label={t('governance.detail.reportedReply')}
              tone="info"
            />
          </div>
          <p className="mb-2 mt-2 font-mono text-[10px] text-text-tertiary">
            {t('governance.detail.contentVersion', { version: snapshot.reply.contentVersion })}
          </p>
          <SnapshotText content={snapshot.reply.content} emphasized />
        </article>
      </div>
    </div>
  );
}

function ProposalSnapshot({
  snapshot,
}: {
  snapshot: Extract<GovernanceTargetSnapshot, { kind: 'CIRCLE_PROPOSAL' }>;
}) {
  const { t } = useTranslation();
  const content =
    snapshot.proposal.topicSnapshot ??
    snapshot.proposal.rulesSnapshot?.map((rule) => rule.text).join('\n') ??
    snapshot.proposal.reason;
  return (
    <article className="border border-border-subtle bg-surface-3 p-4">
      <div className="flex items-center justify-between gap-3 font-mono text-[11px] tabular-nums text-text-tertiary">
        <SnapshotSourcePill
          icon={<Scale className="h-3.5 w-3.5" />}
          label={t('governance.targetTypes.CIRCLE_PROPOSAL')}
        />
        <span>{new Date(snapshot.proposal.createdAt).toLocaleString()}</span>
      </div>
      <h3 className="mb-3 mt-2.5 text-base font-bold text-text-primary">
        {t(`circles.coBuild.scopes.${snapshot.proposal.scope}`)}
      </h3>
      <SnapshotText content={content} emphasized />
    </article>
  );
}

function ProposalCommentSnapshot({
  snapshot,
}: {
  snapshot: Extract<GovernanceTargetSnapshot, { kind: 'CIRCLE_PROPOSAL_COMMENT' }>;
}) {
  const { t } = useTranslation();
  return (
    <article className="border border-border-subtle bg-surface-3 p-4">
      <div className="flex items-center justify-between gap-3 font-mono text-[11px] tabular-nums text-text-tertiary">
        <SnapshotSourcePill
          icon={<MessageSquare className="h-3.5 w-3.5" />}
          label={t('governance.targetTypes.CIRCLE_PROPOSAL_COMMENT')}
        />
        <span>{new Date(snapshot.comment.createdAt).toLocaleString()}</span>
      </div>
      <div className="mt-2.5">
        <SnapshotText content={snapshot.comment.content} emphasized />
      </div>
    </article>
  );
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
    <GovernanceVoteCompare
      violation={result.tally.violation}
      notViolation={result.tally.notViolation}
      violationLabel={t('governance.metrics.violationVotes')}
      notViolationLabel={t('governance.metrics.notViolationVotes')}
    />
  );
}

export function GovernanceResultDetailModal({
  result,
  open,
  onOpenChange,
}: GovernanceResultDetailModalProps) {
  const { t } = useTranslation();
  const detailQuery = useQuery({
    queryKey: ['governance', 'result-detail', result?.id],
    queryFn: () => governanceApi.resultDetail(result!.id),
    enabled: open && !!result,
    retry: (failureCount, error) => !isGovernanceAuthError(error) && failureCount < 2,
  });
  const detail: GovernanceResultDetail | undefined = detailQuery.data;
  const displayResult = detail ?? result;

  return (
    <TerminalDialog
      open={open && Boolean(displayResult)}
      onOpenChange={onOpenChange}
      title={t('circleDialogs.governanceResultTitle')}
      code="GOV.RESULT"
      size="xl"
    >
      {displayResult ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`governance-verdict-pill ${
                displayResult.result === 'violation'
                  ? 'governance-verdict-pill--violation'
                  : 'governance-verdict-pill--not-violation'
              }`}
            >
              {t(`governance.results.${getGovernanceResultKey(displayResult.result)}`)}
            </span>
            <p className="text-xs text-text-secondary">{t('governance.detail.description')}</p>
          </div>

          <TPanel>
            <GovernanceChapterTitle chapter="CH.01" title={t('governance.detail.verdictSummary')} />
            <section className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="border border-border-subtle bg-surface-3 p-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-tertiary">
                  {t('governance.detail.verdictSummary')}
                </p>
                <p
                  className={`mt-2 font-mono text-sm font-bold ${
                    displayResult.result === 'violation' ? 'text-danger' : 'text-accent'
                  }`}
                >
                  {t(`governance.results.${getGovernanceResultKey(displayResult.result)}`)}
                </p>
              </div>
              <div className="border border-border-subtle bg-surface-3 p-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-tertiary">
                  {t('governance.targetType')}
                </p>
                <p className="mt-2 flex items-center gap-2 font-mono text-sm font-bold text-info">
                  {displayResult.targetType === 'POST' ? (
                    <FileText className="h-4 w-4" />
                  ) : displayResult.targetType === 'CIRCLE_PROPOSAL' ? (
                    <Scale className="h-4 w-4" />
                  ) : (
                    <MessageSquare className="h-4 w-4" />
                  )}
                  {t(`governance.targetTypes.${displayResult.targetType}`)}
                </p>
              </div>
              <div className="border border-border-subtle bg-surface-3 p-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-tertiary">
                  {t('governance.detail.duration')}
                </p>
                <p className="mt-2 font-mono text-sm font-bold tabular-nums text-accent">
                  {formatGovernanceDuration(displayResult.durationMinutes, '—', t)}
                </p>
              </div>
            </section>
          </TPanel>

          <TPanel>
            <GovernanceChapterTitle chapter="CH.02" title={t('governance.detail.voteSummary')} />
            <div className="mt-4">
              <VoteSummary result={displayResult} />
            </div>
          </TPanel>

          <TPanel>
            <GovernanceChapterTitle
              chapter="CH.03"
              title={
                displayResult.resolutionSource === 'ADMIN'
                  ? t('governance.detail.adminDecision')
                  : t('governance.detail.communityDecision')
              }
            />
            <div className="relative mt-4 border border-border-subtle bg-surface-3 py-3 pl-5 pr-4">
              <GovernanceAlertRail
                tone={displayResult.resolutionSource === 'ADMIN' ? 'admin' : 'closed'}
              />
              <p className="whitespace-pre-wrap text-sm leading-6 text-text-secondary">
                {displayResult.resolutionReason ?? t('governance.detail.noPublicReason')}
              </p>
            </div>
          </TPanel>

          <TPanel>
            <GovernanceChapterTitle chapter="CH.04" title={t('governance.detail.targetSnapshot')} />
            <div className="mt-4">
              {detailQuery.isLoading ? (
                <p className="font-mono text-sm text-text-tertiary">
                  {t('governance.detail.loadingDetail')}
                </p>
              ) : detailQuery.isError ? (
                <p className="border border-danger/30 bg-danger/10 px-3 py-2 font-mono text-sm text-danger">
                  {t('governance.detail.loadFailed')}
                </p>
              ) : detail ? (
                <SnapshotRenderer snapshot={detail.targetSnapshot} />
              ) : null}
            </div>
          </TPanel>

          <TPanel>
            <GovernanceChapterTitle chapter="CH.05" title={t('governance.detail.timeline')} />
            <div className="mt-4">
              <GovernanceTimeline events={detail?.timelineEvents ?? []} />
            </div>
          </TPanel>
        </div>
      ) : null}
    </TerminalDialog>
  );
}
