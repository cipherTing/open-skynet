'use client';

import { useQuery } from '@tanstack/react-query';
import { Gavel, RotateCcw, ShieldCheck } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import { useTranslation } from 'react-i18next';
import { adminApi } from '@/lib/admin-api';
import { TerminalDialog } from '@/components/ui/TerminalDialog';
import { AdminError, AdminLoading, formatAdminTime } from './AdminPrimitives';
import { PostTags } from '@/components/forum/PostTags';

function MarkdownBlock({ children }: { children: string }) {
  return (
    <div className="prose prose-sm max-w-none text-white/60">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
        {children}
      </ReactMarkdown>
    </div>
  );
}

export function AdminGovernanceCaseDialog({
  caseId,
  onClose,
  onDecide,
  onCorrect,
}: {
  caseId: string | null;
  onClose: () => void;
  onDecide: (decision: 'VIOLATION' | 'NOT_VIOLATION') => void;
  onCorrect: () => void;
}) {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: ['admin', 'governance', 'detail', caseId],
    queryFn: () => adminApi.governanceCaseDetail(caseId!),
    enabled: Boolean(caseId),
  });
  const detail = query.data;
  const open = detail?.status === 'OPEN' || detail?.status === 'EMERGENCY';
  const canCorrect =
    detail?.status === 'RESOLVED_VIOLATION' &&
    (detail.targetType === 'POST' || detail.targetType === 'REPLY') &&
    detail.corrections.length === 0;

  return (
    <TerminalDialog
      open={Boolean(caseId)}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
      title={t('adminDialogs.caseTitle')}
      code="ADMIN.CASE"
      size="xl"
      contentClassName="t-corner"
      footer={
        detail ? (
          <>
            {open ? (
              <>
                <button
                  type="button"
                  onClick={() => onDecide('VIOLATION')}
                  className="t-btn t-btn--danger"
                >
                  <Gavel className="h-3.5 w-3.5" />
                  {t('admin.governance.ruleViolation')}
                </button>
                <button
                  type="button"
                  onClick={() => onDecide('NOT_VIOLATION')}
                  className="t-btn t-btn--primary"
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {t('admin.governance.ruleNotViolation')}
                </button>
              </>
            ) : null}
            {canCorrect ? (
              <button type="button" onClick={onCorrect} className="t-btn t-btn--ghost">
                <RotateCcw className="h-3.5 w-3.5" />
                {t('admin.governance.correctAndRestore')}
              </button>
            ) : null}
          </>
        ) : undefined
      }
    >
      <p className="text-xs text-[var(--t-sub)]">{t('admin.governance.detailDescription')}</p>
      <p aria-hidden className="mt-1 truncate font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--t-faint)]">
        FILE #CASE-{caseId}
      </p>
      {query.isPending ? (
        <div className="py-16">
          <AdminLoading />
        </div>
      ) : query.isError || !detail ? (
        <div className="py-10">
          <AdminError retry={() => void query.refetch()} />
        </div>
      ) : (
        <div className="mt-6 space-y-7">
          <section className="grid gap-4 border-y border-[var(--t-noise)] py-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-faint)]">
                {t('admin.governance.status')}
              </div>
              <div className="mt-1 text-sm font-bold text-[var(--t-text)]">
                {t(`admin.governance.statuses.${detail.status}`)}
              </div>
            </div>
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-faint)]">
                {t('admin.governance.reportCount')}
              </div>
              <div className="mt-1 text-sm font-bold text-[var(--t-text)]">
                {detail.reports.length}
              </div>
            </div>
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-faint)]">
                {t('admin.governance.voteCount')}
              </div>
              <div className="mt-1 text-sm font-bold text-[var(--t-text)]">
                {detail.tally.participantCount}
              </div>
            </div>
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-faint)]">
                {t('admin.governance.currentDeadline')}
              </div>
              <div className="mt-1 text-sm font-bold text-[var(--t-text)]">
                {formatAdminTime(detail.deadlineAt)}
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-sm font-bold text-[var(--t-text)]">{detail.targetSummary.title}</h3>
            <p className="mt-1 text-xs text-[var(--t-sub)]">
              {t(`admin.governance.targetTypes.${detail.targetType}`)}
            </p>
            <div className="mt-4 border-l-2 border-[var(--t-faint)] pl-4">
              {detail.targetSnapshot.kind === 'POST' ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <PostTags tags={detail.targetSnapshot.post.tags} />
                    <span className="text-[10px] text-[var(--t-sub)]">
                      {t('admin.governance.contentVersion', {
                        version: detail.targetSnapshot.post.contentVersion,
                      })}
                    </span>
                  </div>
                  <MarkdownBlock>{detail.targetSnapshot.post.content}</MarkdownBlock>
                </div>
              ) : detail.targetSnapshot.kind === 'REPLY' ? (
                <div className="space-y-5">
                  <div>
                    <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-faint)]">
                      {t('admin.governance.originalPost')}
                    </div>
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <PostTags tags={detail.targetSnapshot.post.tags} />
                      <span className="text-[10px] text-[var(--t-sub)]">
                        {t('admin.governance.contentVersion', {
                          version: detail.targetSnapshot.post.contentVersion,
                        })}
                      </span>
                    </div>
                    <MarkdownBlock>{detail.targetSnapshot.post.content}</MarkdownBlock>
                  </div>
                  {detail.targetSnapshot.parentReply ? (
                    <div>
                      <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-faint)]">
                        {t('admin.governance.parentReply')}
                      </div>
                      <div className="mb-2 text-[10px] text-[var(--t-sub)]">
                        {t('admin.governance.contentVersion', {
                          version: detail.targetSnapshot.parentReply.contentVersion,
                        })}
                      </div>
                      <MarkdownBlock>{detail.targetSnapshot.parentReply.content}</MarkdownBlock>
                    </div>
                  ) : null}
                  <div>
                    <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-accent)]">
                      {t('admin.governance.reportedReply')}
                    </div>
                    <div className="mb-2 text-[10px] text-[var(--t-sub)]">
                      {t('admin.governance.contentVersion', {
                        version: detail.targetSnapshot.reply.contentVersion,
                      })}
                    </div>
                    <MarkdownBlock>{detail.targetSnapshot.reply.content}</MarkdownBlock>
                  </div>
                </div>
              ) : detail.targetSnapshot.kind === 'CIRCLE_PROPOSAL' ? (
                <div className="space-y-3">
                  <MarkdownBlock>{detail.targetSnapshot.proposal.reason}</MarkdownBlock>
                  {detail.targetSnapshot.proposal.topicSnapshot ? (
                    <p className="whitespace-pre-wrap text-sm text-white/60">
                      {detail.targetSnapshot.proposal.topicSnapshot}
                    </p>
                  ) : null}
                  {detail.targetSnapshot.proposal.rulesSnapshot?.map((rule, index) => (
                    <p key={rule.id} className="text-sm text-white/60">
                      {index + 1}. {rule.text}
                    </p>
                  ))}
                </div>
              ) : (
                <MarkdownBlock>{detail.targetSnapshot.comment.content}</MarkdownBlock>
              )}
            </div>
          </section>

          <section className="grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.15em] text-[var(--t-text)]">
                <span aria-hidden className="text-[var(--t-accent)]">
                  {'//'}
                </span>
                {t('admin.governance.reportBasis')}
              </h3>
              <div className="mt-3 divide-y divide-[var(--t-noise)] border-y border-[var(--t-noise)]">
                {detail.reports.map((report, index) => (
                  <div key={report.id} className="py-3">
                    <div className="text-xs font-bold text-white/60">
                      {t('admin.governance.anonymousReport', { number: index + 1 })} ·{' '}
                      {t(`report.reasons.${report.reason}`)}
                    </div>
                    {report.evidence ? (
                      <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-[var(--t-sub)]">
                        {report.evidence}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.15em] text-[var(--t-text)]">
                <span aria-hidden className="text-[var(--t-accent)]">
                  {'//'}
                </span>
                {t('admin.governance.voteSummary')}
              </h3>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="border-l-2 border-[var(--t-hazard)] pl-3">
                  <div className="text-xs text-[var(--t-sub)]">
                    {t('admin.governance.violationVotes')}
                  </div>
                  <div className="mt-1 text-lg font-bold text-[var(--t-hazard)]">{detail.tally.violation}</div>
                </div>
                <div className="border-l-2 border-[var(--t-accent)] pl-3">
                  <div className="text-xs text-[var(--t-sub)]">
                    {t('admin.governance.notViolationVotes')}
                  </div>
                  <div className="mt-1 text-lg font-bold text-[var(--t-accent)]">
                    {detail.tally.notViolation}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section>
            <h3 className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.15em] text-[var(--t-text)]">
              <span aria-hidden className="text-[var(--t-accent)]">
                {'//'}
              </span>
              {t('admin.governance.timeline')}
            </h3>
            <ol className="mt-3 space-y-2 border-l border-[var(--t-noise)] pl-4 text-xs text-white/60">
              <li>
                {t('admin.governance.openedTimeline', { time: formatAdminTime(detail.openedAt) })}
              </li>
              <li>
                {t('admin.governance.firstReviewTimeline', {
                  time: formatAdminTime(detail.firstReviewAt),
                })}
              </li>
              <li>
                {t('admin.governance.normalDeadlineTimeline', {
                  time: formatAdminTime(detail.normalDeadlineAt),
                })}
              </li>
              <li>
                {t('admin.governance.emergencyDeadlineTimeline', {
                  time: formatAdminTime(detail.emergencyDeadlineAt),
                })}
              </li>
              {detail.resolvedAt ? (
                <li>
                  {t('admin.governance.resolvedTimeline', {
                    time: formatAdminTime(detail.resolvedAt),
                  })}
                </li>
              ) : null}
            </ol>
          </section>

          {detail.resolvedAt ? (
            <section className="border-l-2 border-[var(--t-accent)] pl-4">
              <h3 className="text-sm font-bold text-[var(--t-text)]">
                {detail.resolutionSource === 'ADMIN'
                  ? t('admin.governance.adminDecision')
                  : t('admin.governance.communityDecision')}
              </h3>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white/60">
                {detail.resolutionReason ?? t('admin.governance.noPublicReason')}
              </p>
            </section>
          ) : null}

          {detail.corrections.map((correction) => (
            <section key={correction.id} className="border-l-2 border-[var(--t-accent)] pl-4">
              <h3 className="text-sm font-bold text-[var(--t-accent)]">
                {t('admin.governance.correctionRecorded')}
              </h3>
              <p className="mt-2 text-sm text-white/60">{correction.publicReason}</p>
              <p className="mt-1 text-xs text-[var(--t-sub)]">
                {formatAdminTime(correction.createdAt)}
              </p>
            </section>
          ))}
        </div>
      )}
    </TerminalDialog>
  );
}
