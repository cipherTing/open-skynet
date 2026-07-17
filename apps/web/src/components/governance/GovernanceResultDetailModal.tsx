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
  GovernanceVerdictStamp,
  GovernanceVoteCompare,
} from './GovernanceTerminal';
import { PostTags } from '@/components/forum/PostTags';
import { TButton } from '@/components/ui/terminal/TButton';
import { TPanel } from '@/components/ui/terminal/TPanel';
import { TTag } from '@/components/ui/terminal/TTag';
import { Timecode } from '@/components/ui/terminal/Timecode';
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
        className={`whitespace-pre-wrap text-sm leading-7 text-[#EDF3ED]/75 [overflow-wrap:anywhere] ${
          expanded ? '' : 'line-clamp-6'
        }`}
      >
        {content}
      </p>
      {isLong ? (
        <TButton
          variant="secondary"
          size="sm"
          className="mt-2"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
        >
          {expanded ? t('governance.detail.collapseContent') : t('governance.detail.expandContent')}
        </TButton>
      ) : null}
    </div>
  );
}

/** 快照档案页：1px 暗绿边框 + 近黑面板，禁止底色卡片堆叠。 */
const SNAPSHOT_FRAME_CLASS = 'border border-[#1A2E1A] bg-[#040704] p-4';

function SnapshotHeader({
  icon,
  label,
  tone = 'accent',
  at,
}: {
  icon: React.ReactNode;
  label: string;
  tone?: 'accent' | 'default';
  at?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <TTag color={tone}>
        {icon}
        {label}
      </TTag>
      {at ? <Timecode date={at} withDate /> : null}
    </div>
  );
}

function PostSnapshot({
  snapshot,
}: {
  snapshot: Extract<GovernanceTargetSnapshot, { kind: 'POST' }>;
}) {
  const { t } = useTranslation();
  return (
    <article className={SNAPSHOT_FRAME_CLASS}>
      <SnapshotHeader
        icon={<FileText className="h-3 w-3" />}
        label={t('governance.card.sourcePost')}
        at={snapshot.post.createdAt}
      />
      <h3 className="mt-2.5 text-base font-bold text-white">{snapshot.post.title}</h3>
      <div className="mb-3 mt-2 flex flex-wrap items-center gap-2">
        <PostTags tags={snapshot.post.tags} />
        <span className="font-mono text-[10px] tracking-[0.12em] text-[#3A5A3A]">
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
      <article className={SNAPSHOT_FRAME_CLASS}>
        <SnapshotHeader
          icon={<FileText className="h-3 w-3" />}
          label={t('governance.detail.threadPost')}
        />
        <h3 className="mt-2.5 text-base font-bold text-white">{snapshot.post.title}</h3>
        <div className="mb-3 mt-2 flex flex-wrap items-center gap-2">
          <PostTags tags={snapshot.post.tags} />
          <span className="font-mono text-[10px] tracking-[0.12em] text-[#3A5A3A]">
            {t('governance.detail.contentVersion', { version: snapshot.post.contentVersion })}
          </span>
        </div>
        <SnapshotText content={snapshot.post.content} />
      </article>

      <div className="ml-5 grid gap-3 border-l border-[#3A5A3A]/50 pl-4">
        {snapshot.parentReply ? (
          <article className={`relative ${SNAPSHOT_FRAME_CLASS}`}>
            <span aria-hidden className="absolute -left-4 top-6 w-4 border-t border-[#3A5A3A]/50" />
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.15em] text-[#3A5A3A]">
              {t('governance.detail.parentReply')}
            </p>
            <p className="mb-2 font-mono text-[10px] tracking-[0.12em] text-[#3A5A3A]">
              {t('governance.detail.contentVersion', {
                version: snapshot.parentReply.contentVersion,
              })}
            </p>
            <SnapshotText content={snapshot.parentReply.content} />
          </article>
        ) : null}

        <article className="relative border border-[#ADFF2F]/40 bg-[#040704] py-3 pl-5 pr-4">
          <GovernanceAlertRail tone="pending" />
          <span aria-hidden className="absolute -left-4 top-6 w-4 border-t border-[#3A5A3A]/50" />
          <div className="flex items-center gap-2">
            <TTag color="accent">
              <MessageSquare className="h-3 w-3" />
              {t('governance.detail.reportedReply')}
            </TTag>
          </div>
          <p className="mb-2 mt-2 font-mono text-[10px] tracking-[0.12em] text-[#3A5A3A]">
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
    <article className={SNAPSHOT_FRAME_CLASS}>
      <SnapshotHeader
        icon={<Scale className="h-3 w-3" />}
        label={t('governance.targetTypes.CIRCLE_PROPOSAL')}
        at={snapshot.proposal.createdAt}
      />
      <h3 className="mb-3 mt-2.5 text-base font-bold text-white">
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
    <article className={SNAPSHOT_FRAME_CLASS}>
      <SnapshotHeader
        icon={<MessageSquare className="h-3 w-3" />}
        label={t('governance.targetTypes.CIRCLE_PROPOSAL_COMMENT')}
        at={snapshot.comment.createdAt}
      />
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

/** 裁决摘要单元格：gap-px 发丝网格的一格，等宽 10px 标签 + 加粗读数。 */
function VerdictCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-black p-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#3A5A3A]">{label}</p>
      <div className="mt-2">{children}</div>
    </div>
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
            <GovernanceVerdictStamp
              tone={displayResult.result === 'violation' ? 'violation' : 'notViolation'}
              label={t(`governance.results.${getGovernanceResultKey(displayResult.result)}`)}
            />
            <p className="text-xs text-[#3A5A3A]">{t('governance.detail.description')}</p>
          </div>

          <TPanel>
            <GovernanceChapterTitle chapter="CH.01" title={t('governance.detail.verdictSummary')} />
            <section className="mt-4 grid gap-px border border-[#1A2E1A] bg-[#1A2E1A] sm:grid-cols-3">
              <VerdictCell label={t('governance.detail.verdictSummary')}>
                <p
                  className={`font-mono text-sm font-bold ${
                    displayResult.result === 'violation' ? 'text-[#EF4444]' : 'text-[#ADFF2F]'
                  }`}
                >
                  {t(`governance.results.${getGovernanceResultKey(displayResult.result)}`)}
                </p>
              </VerdictCell>
              <VerdictCell label={t('governance.targetType')}>
                <p className="flex items-center gap-2 font-mono text-sm font-bold text-white/85">
                  {displayResult.targetType === 'POST' ? (
                    <FileText className="h-4 w-4" />
                  ) : displayResult.targetType === 'CIRCLE_PROPOSAL' ? (
                    <Scale className="h-4 w-4" />
                  ) : (
                    <MessageSquare className="h-4 w-4" />
                  )}
                  {t(`governance.targetTypes.${displayResult.targetType}`)}
                </p>
              </VerdictCell>
              <VerdictCell label={t('governance.detail.duration')}>
                <p className="font-mono text-sm font-bold tabular-nums text-[#ADFF2F]">
                  {formatGovernanceDuration(displayResult.durationMinutes, '—', t)}
                </p>
              </VerdictCell>
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
            <div className="relative mt-4 border border-[#1A2E1A] bg-[#040704] py-3 pl-5 pr-4">
              <GovernanceAlertRail
                tone={displayResult.resolutionSource === 'ADMIN' ? 'admin' : 'closed'}
              />
              <p className="whitespace-pre-wrap text-sm leading-6 text-[#EDF3ED]/75">
                {displayResult.resolutionReason ?? t('governance.detail.noPublicReason')}
              </p>
            </div>
          </TPanel>

          <TPanel>
            <GovernanceChapterTitle chapter="CH.04" title={t('governance.detail.targetSnapshot')} />
            <div className="mt-4">
              {detailQuery.isLoading ? (
                <p className="font-mono text-sm text-[#3A5A3A]">
                  {t('governance.detail.loadingDetail')}
                </p>
              ) : detailQuery.isError ? (
                <p className="border border-[#7F1D1D] px-3 py-2 font-mono text-sm text-[#EF4444]/80">
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
