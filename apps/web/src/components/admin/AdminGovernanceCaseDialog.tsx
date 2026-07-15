'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useQuery } from '@tanstack/react-query';
import { Gavel, RotateCcw, ShieldCheck, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import { useTranslation } from 'react-i18next';
import { adminApi } from '@/lib/admin-api';
import { AdminError, AdminLoading, formatAdminTime } from './AdminPrimitives';
import { PostTags } from '@/components/forum/PostTags';

function MarkdownBlock({ children }: { children: string }) {
  return (
    <div className="prose prose-sm max-w-none text-ink-secondary">
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
  const canCorrect = detail?.status === 'RESOLVED_VIOLATION'
    && (detail.targetType === 'POST' || detail.targetType === 'REPLY')
    && detail.corrections.length === 0;

  return (
    <Dialog.Root
      open={Boolean(caseId)}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[190] bg-void/45 backdrop-blur-[2px]" />
        <Dialog.Content className="skynet-dialog-content fixed left-1/2 top-1/2 z-[200] max-h-[calc(100dvh-32px)] w-[min(calc(100vw-32px),900px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-md border border-border-default bg-void-deep p-5 shadow-2xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-base font-bold text-ink-primary">
                {t('admin.governance.detailTitle')}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-ink-muted">
                {t('admin.governance.detailDescription')}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button type="button" aria-label={t('app.close')} className="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2">
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          {query.isPending ? (
            <div className="py-16"><AdminLoading /></div>
          ) : query.isError || !detail ? (
            <div className="py-10"><AdminError retry={() => void query.refetch()} /></div>
          ) : (
            <div className="mt-6 space-y-7">
              <section className="grid gap-4 border-y border-border-subtle py-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <div className="text-[10px] font-bold text-ink-muted">{t('admin.governance.status')}</div>
                  <div className="mt-1 text-sm font-bold text-ink-primary">{t(`admin.governance.statuses.${detail.status}`)}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-ink-muted">{t('admin.governance.reportCount')}</div>
                  <div className="mt-1 text-sm font-bold text-ink-primary">{detail.reports.length}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-ink-muted">{t('admin.governance.voteCount')}</div>
                  <div className="mt-1 text-sm font-bold text-ink-primary">{detail.tally.participantCount}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-ink-muted">{t('admin.governance.currentDeadline')}</div>
                  <div className="mt-1 text-sm font-bold text-ink-primary">{formatAdminTime(detail.deadlineAt)}</div>
                </div>
              </section>

              <section>
                <h3 className="text-sm font-bold text-ink-primary">{detail.targetSummary.title}</h3>
                <p className="mt-1 text-xs text-ink-muted">{t(`admin.governance.targetTypes.${detail.targetType}`)}</p>
                <div className="mt-4 border-l-2 border-steel/35 pl-4">
                  {detail.targetSnapshot.kind === 'POST' ? (
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <PostTags tags={detail.targetSnapshot.post.tags} />
                        <span className="text-[10px] text-ink-muted">
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
                        <div className="mb-2 text-[10px] font-bold text-steel">{t('admin.governance.originalPost')}</div>
                        <div className="mb-3 flex flex-wrap items-center gap-2">
                          <PostTags tags={detail.targetSnapshot.post.tags} />
                          <span className="text-[10px] text-ink-muted">
                            {t('admin.governance.contentVersion', {
                              version: detail.targetSnapshot.post.contentVersion,
                            })}
                          </span>
                        </div>
                        <MarkdownBlock>{detail.targetSnapshot.post.content}</MarkdownBlock>
                      </div>
                      {detail.targetSnapshot.parentReply ? (
                        <div>
                        <div className="mb-2 text-[10px] font-bold text-steel">{t('admin.governance.parentReply')}</div>
                          <div className="mb-2 text-[10px] text-ink-muted">
                            {t('admin.governance.contentVersion', {
                              version: detail.targetSnapshot.parentReply.contentVersion,
                            })}
                          </div>
                          <MarkdownBlock>{detail.targetSnapshot.parentReply.content}</MarkdownBlock>
                        </div>
                      ) : null}
                      <div>
                        <div className="mb-2 text-[10px] font-bold text-copper">{t('admin.governance.reportedReply')}</div>
                        <div className="mb-2 text-[10px] text-ink-muted">
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
                        <p className="whitespace-pre-wrap text-sm text-ink-secondary">{detail.targetSnapshot.proposal.topicSnapshot}</p>
                      ) : null}
                      {detail.targetSnapshot.proposal.rulesSnapshot?.map((rule, index) => (
                        <p key={rule.id} className="text-sm text-ink-secondary">{index + 1}. {rule.text}</p>
                      ))}
                    </div>
                  ) : (
                    <MarkdownBlock>{detail.targetSnapshot.comment.content}</MarkdownBlock>
                  )}
                </div>
              </section>

              <section className="grid gap-6 md:grid-cols-2">
                <div>
                  <h3 className="text-sm font-bold text-ink-primary">{t('admin.governance.reportBasis')}</h3>
                  <div className="mt-3 divide-y divide-border-subtle border-y border-border-subtle">
                    {detail.reports.map((report, index) => (
                      <div key={report.id} className="py-3">
                        <div className="text-xs font-bold text-ink-secondary">
                          {t('admin.governance.anonymousReport', { number: index + 1 })} · {t(`report.reasons.${report.reason}`)}
                        </div>
                        {report.evidence ? <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-ink-muted">{report.evidence}</p> : null}
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-ink-primary">{t('admin.governance.voteSummary')}</h3>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div className="border-l-2 border-ochre/45 pl-3">
                      <div className="text-xs text-ink-muted">{t('admin.governance.violationVotes')}</div>
                      <div className="mt-1 text-lg font-bold text-ochre">{detail.tally.violation}</div>
                    </div>
                    <div className="border-l-2 border-moss/45 pl-3">
                      <div className="text-xs text-ink-muted">{t('admin.governance.notViolationVotes')}</div>
                      <div className="mt-1 text-lg font-bold text-moss">{detail.tally.notViolation}</div>
                    </div>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-sm font-bold text-ink-primary">{t('admin.governance.timeline')}</h3>
                <ol className="mt-3 space-y-2 border-l border-border-subtle pl-4 text-xs text-ink-secondary">
                  <li>{t('admin.governance.openedTimeline', { time: formatAdminTime(detail.openedAt) })}</li>
                  <li>{t('admin.governance.firstReviewTimeline', { time: formatAdminTime(detail.firstReviewAt) })}</li>
                  <li>{t('admin.governance.normalDeadlineTimeline', { time: formatAdminTime(detail.normalDeadlineAt) })}</li>
                  <li>{t('admin.governance.emergencyDeadlineTimeline', { time: formatAdminTime(detail.emergencyDeadlineAt) })}</li>
                  {detail.resolvedAt ? <li>{t('admin.governance.resolvedTimeline', { time: formatAdminTime(detail.resolvedAt) })}</li> : null}
                </ol>
              </section>

              {detail.resolvedAt ? (
                <section className="border-l-2 border-copper/50 pl-4">
                  <h3 className="text-sm font-bold text-ink-primary">
                    {detail.resolutionSource === 'ADMIN' ? t('admin.governance.adminDecision') : t('admin.governance.communityDecision')}
                  </h3>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink-secondary">
                    {detail.resolutionReason ?? t('admin.governance.noPublicReason')}
                  </p>
                </section>
              ) : null}

              {detail.corrections.map((correction) => (
                <section key={correction.id} className="border-l-2 border-moss/50 pl-4">
                  <h3 className="text-sm font-bold text-moss">{t('admin.governance.correctionRecorded')}</h3>
                  <p className="mt-2 text-sm text-ink-secondary">{correction.publicReason}</p>
                  <p className="mt-1 text-xs text-ink-muted">{formatAdminTime(correction.createdAt)}</p>
                </section>
              ))}
            </div>
          )}

          {detail ? (
            <div className="mt-7 flex flex-wrap justify-end gap-2 border-t border-border-subtle pt-4">
              {open ? (
                <>
                  <button type="button" onClick={() => onDecide('VIOLATION')} className="inline-flex items-center gap-2 rounded-md border border-ochre/30 px-3 py-2 text-xs font-bold text-ochre">
                    <Gavel className="h-3.5 w-3.5" />{t('admin.governance.ruleViolation')}
                  </button>
                  <button type="button" onClick={() => onDecide('NOT_VIOLATION')} className="inline-flex items-center gap-2 rounded-md border border-moss/30 px-3 py-2 text-xs font-bold text-moss">
                    <ShieldCheck className="h-3.5 w-3.5" />{t('admin.governance.ruleNotViolation')}
                  </button>
                </>
              ) : null}
              {canCorrect ? (
                <button type="button" onClick={onCorrect} className="inline-flex items-center gap-2 rounded-md border border-copper/30 px-3 py-2 text-xs font-bold text-copper">
                  <RotateCcw className="h-3.5 w-3.5" />{t('admin.governance.correctAndRestore')}
                </button>
              ) : null}
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
