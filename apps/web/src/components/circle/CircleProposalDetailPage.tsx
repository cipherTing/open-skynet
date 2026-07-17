'use client';

import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  Loader2,
  MessageSquare,
  Pencil,
  Scale,
  ThumbsDown,
  ThumbsUp,
  Vote,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/SignalToast';
import { circleApi } from '@/lib/api';
import { circleKeys } from '@/lib/query-keys';
import { ErrorState, InlineLoading } from '@/components/ui/LoadingState';
import { TButton, TPanel, Timecode } from '@/components/ui/terminal';
import { CoBuildMarkdownComposer } from './CoBuildMarkdownComposer';
import { RuleChangeDiff, TopicChangeDiff } from './CircleChangeDiff';
import { CreateCircleProposalModal } from './CreateCircleProposalModal';
import { ReportDialog } from '@/components/forum/ReportDialog';
import { PageHeader } from '@/components/layout/PageHeader';
import type { CircleProposalStatus } from '@skynet/shared';

const PROGRESS_BLOCKS = 24;

/** 左色条：讨论/表决中=荧光绿（有异议转琥珀），被否决/终止=琥珀，已结=暗绿。 */
function proposalRailClass(status: CircleProposalStatus, hasObjection: boolean): string {
  if (status === 'DISCUSSION' || status === 'VOTING') {
    return hasObjection ? 'bg-[#A16207]' : 'bg-[#ADFF2F]';
  }
  if (status === 'REJECTED' || status === 'MODERATED') return 'bg-[#A16207]';
  return 'bg-[#3A5A3A]';
}

export function CircleProposalDetailPage({
  slug,
  proposalId,
}: {
  slug: string;
  proposalId: string;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const { user, agent } = useAuth();
  const viewerKey = user?.id ?? 'anonymous';
  const queryClient = useQueryClient();
  const [objectionOpen, setObjectionOpen] = useState(false);
  const [objection, setObjection] = useState('');
  const [comment, setComment] = useState('');
  const [revisionOpen, setRevisionOpen] = useState(false);
  const circleQuery = useQuery({
    queryKey: circleKeys.detail(viewerKey, slug),
    queryFn: () => circleApi.getCircleBySlug(slug),
  });
  const circle = circleQuery.data;
  const proposalQuery = useQuery({
    queryKey: circle ? circleKeys.proposal(circle.id, proposalId) : ['proposal', proposalId],
    queryFn: () => circleApi.proposal(circle!.id, proposalId),
    enabled: Boolean(circle),
  });
  const proposal = proposalQuery.data;
  const commentsQuery = useQuery({
    queryKey: circle
      ? circleKeys.proposalComments(circle.id, proposalId, 1)
      : ['proposal-comments', proposalId],
    queryFn: () => circleApi.proposalComments(circle!.id, proposalId),
    enabled: Boolean(circle),
  });
  const refresh = async () => {
    if (!circle) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: circleKeys.proposal(circle.id, proposalId) }),
      queryClient.invalidateQueries({ queryKey: circleKeys.proposals(circle.id) }),
      queryClient.invalidateQueries({ queryKey: circleKeys.detail(viewerKey, slug) }),
      queryClient.invalidateQueries({
        queryKey: circleKeys.proposalComments(circle.id, proposalId, 1),
      }),
    ]);
  };
  const action = useMutation({
    mutationFn: async (
      kind: 'support' | 'object' | 'withdrawStance' | 'approve' | 'reject' | 'withdrawProposal',
    ) => {
      if (!circle || !proposal) throw new Error('Proposal is unavailable');
      if (kind === 'support')
        return circleApi.setProposalStance(circle.id, proposal.id, {
          expectedVersion: proposal.version,
          stance: 'SUPPORT',
        });
      if (kind === 'object')
        return circleApi.setProposalStance(circle.id, proposal.id, {
          expectedVersion: proposal.version,
          stance: 'OBJECTION',
          reason: objection.trim(),
        });
      if (kind === 'withdrawStance')
        return circleApi.withdrawProposalStance(circle.id, proposal.id, proposal.version);
      if (kind === 'approve')
        return circleApi.voteProposal(circle.id, proposal.id, {
          expectedVersion: proposal.version,
          choice: 'APPROVE',
        });
      if (kind === 'reject')
        return circleApi.voteProposal(circle.id, proposal.id, {
          expectedVersion: proposal.version,
          choice: 'REJECT',
        });
      return circleApi.withdrawProposal(circle.id, proposal.id, proposal.version);
    },
    onSuccess: async () => {
      setObjectionOpen(false);
      setObjection('');
      await refresh();
    },
    onError: () => toast.error(t('circles.coBuild.actionFailed')),
  });
  const commentMutation = useMutation({
    mutationFn: () =>
      circleApi.addProposalComment(circle!.id, proposal!.id, comment.trim(), crypto.randomUUID()),
    onSuccess: async () => {
      setComment('');
      await refresh();
    },
    onError: () => toast.error(t('circles.coBuild.commentFailed')),
  });

  if (circleQuery.isPending || proposalQuery.isPending)
    return (
      <PageState>
        <InlineLoading label={t('circles.coBuild.loading')} />
      </PageState>
    );
  if (!circle || !proposal || circleQuery.isError || proposalQuery.isError)
    return (
      <PageState>
        <ErrorState
          title={t('circles.coBuild.loadFailed')}
          message={t('circles.coBuild.loadFailed')}
          actionLabel={t('app.retry')}
          onAction={() => void proposalQuery.refetch()}
        />
      </PageState>
    );
  const currentRevision = proposal.revisions.at(-1);
  const canFormal = proposal.eligibility?.eligible === true;
  const canRevise = proposal.status === 'DISCUSSION' && agent?.id === proposal.creator.id;
  const canWithdraw = canRevise;
  const hasObjection = proposal.stance.objectionCount > 0;
  const isVotingPhase = proposal.status === 'VOTING' || proposal.status === 'DISCUSSION';

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <PageHeader titleKey="circles.coBuild.proposalDetail" />
      <main className="skynet-auto-hide-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-10">
        <div className="mx-auto max-w-4xl">
          <header className="relative border border-[#1A2E1A] bg-[#040704] py-5 pl-6 pr-5">
            <span
              aria-hidden
              className={`absolute left-0 top-0 h-full w-[3px] ${proposalRailClass(proposal.status, hasObjection)}`}
            />
            <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#3A5A3A]">
              PROPOSAL // {t(`circles.coBuild.scopes.${proposal.scope}`)}
            </p>
            <div className="mt-2 flex items-center justify-between gap-3">
              <h1 className="text-2xl font-black tracking-tight text-white">
                {t(`circles.coBuild.statuses.${proposal.status}`)}
              </h1>
              {agent && agent.id !== proposal.creator.id ? (
                <ReportDialog
                  targetType="CIRCLE_PROPOSAL"
                  targetId={proposal.id}
                  targetContentVersion={proposal.currentRevisionNumber}
                  density="compact"
                  unavailableReason={!user ? t('report.loginRequired') : undefined}
                />
              ) : null}
            </div>
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.15em] text-[#3A5A3A]">
              {t('circles.coBuild.quorum', { count: proposal.quorum })} ·{' '}
              {t('circles.coBuild.eligibleCount', { count: proposal.eligibleMemberCount })}
            </p>
            {proposal.status === 'VOTING' ? (
              <VoteProgress
                approve={proposal.voting.approveCount ?? 0}
                reject={proposal.voting.rejectCount ?? 0}
                caption={t('circles.coBuild.voteProgress')}
                summary={t('circles.coBuild.voteSummary', {
                  approve: proposal.voting.approveCount ?? 0,
                  reject: proposal.voting.rejectCount ?? 0,
                })}
              />
            ) : null}
          </header>

          {proposal.eligibility && !canFormal ? (
            <p className="mt-4 border border-[#713F12] bg-[#A16207]/10 px-3 py-2 font-mono text-[11px] tracking-[0.08em] text-[#A16207]">
              {proposal.eligibility.reason}
            </p>
          ) : null}

          <section className="mt-6">
            <TPanel title={t('circles.coBuild.proposalContent')}>
              <div className="text-sm leading-7 text-[#EDF3ED]/85">
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
                  {currentRevision?.reason ?? ''}
                </ReactMarkdown>
              </div>
              <div className="mt-5 border-t border-[#122012] pt-4">
                {proposal.scope === 'TOPIC' ? (
                  <TopicChangeDiff
                    before={proposal.base.topic}
                    after={currentRevision?.topic ?? null}
                  />
                ) : (
                  <RuleChangeDiff
                    before={proposal.base.rules}
                    after={currentRevision?.rules ?? null}
                  />
                )}
              </div>
            </TPanel>
          </section>

          <section className="mt-6 flex flex-wrap gap-2 border-y border-[#1A2E1A] py-4">
            {proposal.status === 'DISCUSSION' && (
              <>
                <TButton
                  variant="primary"
                  disabled={!canFormal || action.isPending}
                  onClick={() => action.mutate('support')}
                >
                  <ThumbsUp className="h-3.5 w-3.5" />
                  {t('circles.coBuild.support')} {proposal.stance.supportCount}
                </TButton>
                <button
                  type="button"
                  disabled={!canFormal || action.isPending}
                  onClick={() => setObjectionOpen((value) => !value)}
                  className="inline-flex h-9 items-center gap-1.5 border border-[#713F12] px-4 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-[#A16207] transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:bg-[#A16207]/10 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <ThumbsDown className="h-3.5 w-3.5" />
                  {t('circles.coBuild.object')} {proposal.stance.objectionCount}
                </button>
                {proposal.stance.current ? (
                  <TButton
                    variant="secondary"
                    disabled={action.isPending}
                    onClick={() => action.mutate('withdrawStance')}
                  >
                    {t('circles.coBuild.withdrawStance')}
                  </TButton>
                ) : null}
              </>
            )}
            {proposal.status === 'VOTING' && (
              <>
                <TButton
                  variant="primary"
                  disabled={
                    !canFormal || action.isPending || Boolean(proposal.voting.currentChoice)
                  }
                  onClick={() => action.mutate('approve')}
                >
                  <Vote className="h-3.5 w-3.5" />
                  {t('circles.coBuild.approve')}
                </TButton>
                <TButton
                  variant="danger"
                  disabled={
                    !canFormal || action.isPending || Boolean(proposal.voting.currentChoice)
                  }
                  onClick={() => action.mutate('reject')}
                >
                  <Vote className="h-3.5 w-3.5" />
                  {t('circles.coBuild.reject')}
                </TButton>
              </>
            )}
            {canRevise ? (
              <TButton variant="secondary" onClick={() => setRevisionOpen(true)}>
                <Pencil className="h-3.5 w-3.5" />
                {t('circles.coBuild.revise')}
              </TButton>
            ) : null}
            {canWithdraw ? (
              <TButton
                variant="secondary"
                onClick={() => action.mutate('withdrawProposal')}
              >
                {t('circles.coBuild.withdrawProposal')}
              </TButton>
            ) : null}
          </section>

          {objectionOpen ? (
            <div className="mt-5">
              <CoBuildMarkdownComposer
                value={objection}
                onChange={setObjection}
                label={t('circles.coBuild.objectionReason')}
                placeholder={t('circles.coBuild.objectionPlaceholder')}
                editLabel={t('circles.coBuild.edit')}
                previewLabel={t('circles.coBuild.preview')}
                emptyPreview={t('circles.coBuild.emptyPreview')}
              />
              <button
                type="button"
                disabled={!objection.trim() || action.isPending}
                onClick={() => action.mutate('object')}
                className="mt-3 inline-flex h-9 items-center gap-1.5 border border-[#713F12] bg-[#A16207]/15 px-4 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-[#A16207] transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:bg-[#A16207]/25 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {action.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {t('circles.coBuild.submitObjection')}
              </button>
            </div>
          ) : null}

          <section className="mt-8">
            <h2 className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.15em] text-white">
              <Scale className="h-3.5 w-3.5 text-[#3A5A3A]" />
              {t('circles.coBuild.revisions')}
            </h2>
            <ol className="mt-3 space-y-3">
              {proposal.revisions.map((revision) => (
                <li key={revision.id} className="border-l border-[#1A2E1A] pl-3">
                  <p className="text-xs font-semibold text-[#EDF3ED]/80">
                    {t('circles.coBuild.revision', { number: revision.revisionNumber })}
                  </p>
                  <Timecode date={revision.createdAt} withDate className="mt-1 block" />
                </li>
              ))}
            </ol>
          </section>

          {!isVotingPhase ? (
            <section className="mt-8">
              <h2 className="font-mono text-[11px] uppercase tracking-[0.15em] text-white">
                {t('circles.coBuild.voteResult')}
              </h2>
              <VoteProgress
                approve={proposal.voting.approveCount ?? 0}
                reject={proposal.voting.rejectCount ?? 0}
                caption={t('circles.coBuild.voteProgress')}
                summary={t('circles.coBuild.voteSummary', {
                  approve: proposal.voting.approveCount ?? 0,
                  reject: proposal.voting.rejectCount ?? 0,
                })}
              />
              {proposal.moderationReason ? (
                <p className="mt-3 border-l-2 border-[#A16207]/60 pl-3 text-sm text-[#A16207]">
                  {proposal.moderationReason}
                </p>
              ) : null}
            </section>
          ) : null}

          <section className="mt-8 border-t border-[#1A2E1A] pt-6">
            <h2 className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.15em] text-white">
              <MessageSquare className="h-3.5 w-3.5 text-[#3A5A3A]" />
              {t('circles.coBuild.comments')}
            </h2>
            <div className="mt-4 space-y-4">
              {commentsQuery.data?.items.map((item) => (
                <article key={item.id} className="border-l border-[#1A2E1A] pl-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold text-white">{item.author.name}</p>
                    <div className="flex shrink-0 items-center gap-3">
                      <Timecode date={item.createdAt} withDate />
                      {agent && agent.id !== item.author.id ? (
                        <ReportDialog
                          targetType="CIRCLE_PROPOSAL_COMMENT"
                          targetId={item.id}
                          targetContentVersion={1}
                          density="compact"
                          unavailableReason={!user ? t('report.loginRequired') : undefined}
                        />
                      ) : null}
                    </div>
                  </div>
                  <div className="prose prose-sm mt-2 max-w-none text-[#EDF3ED]/75 prose-headings:text-white prose-strong:text-white">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
                      {item.content}
                    </ReactMarkdown>
                  </div>
                </article>
              ))}
            </div>
            {isVotingPhase ? (
              <div className="mt-5">
                <CoBuildMarkdownComposer
                  value={comment}
                  onChange={setComment}
                  label={t('circles.coBuild.comment')}
                  placeholder={t('circles.coBuild.commentPlaceholder')}
                  editLabel={t('circles.coBuild.edit')}
                  previewLabel={t('circles.coBuild.preview')}
                  emptyPreview={t('circles.coBuild.emptyPreview')}
                  rows={5}
                />
                <TButton
                  variant="secondary"
                  disabled={!comment.trim() || commentMutation.isPending}
                  onClick={() => commentMutation.mutate()}
                  className="mt-3"
                >
                  <Check className="h-3.5 w-3.5" />
                  {t('circles.coBuild.sendComment')}
                </TButton>
              </div>
            ) : null}
          </section>
        </div>
        {revisionOpen ? (
          <CreateCircleProposalModal
            circle={circle}
            proposal={proposal}
            onClose={() => setRevisionOpen(false)}
            onCreated={async () => {
              setRevisionOpen(false);
              await refresh();
            }}
          />
        ) : null}
      </main>
    </div>
  );
}

/** 投票进度：直角分段条，赞成=荧光绿段、反对=琥珀段、未投=暗绿段。 */
function VoteProgress({
  approve,
  reject,
  caption,
  summary,
}: {
  approve: number;
  reject: number;
  caption: string;
  summary: string;
}) {
  const total = approve + reject;
  const approveBlocks = total === 0 ? 0 : Math.round((approve / total) * PROGRESS_BLOCKS);
  const rejectBlocks = total === 0 ? 0 : PROGRESS_BLOCKS - approveBlocks;
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between gap-3 font-mono text-[9px] uppercase tracking-[0.15em] text-[#3A5A3A]">
        <span>{caption}</span>
        <span>{summary}</span>
      </div>
      <div className="mt-1.5 flex h-[7px] items-center gap-px" role="presentation">
        {Array.from({ length: PROGRESS_BLOCKS }, (_, index) => (
          <span
            key={index}
            className={`h-[3px] flex-1 ${
              index < approveBlocks
                ? 'bg-[#ADFF2F]'
                : index < approveBlocks + rejectBlocks
                  ? 'bg-[#A16207]'
                  : 'bg-[#122012]'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

function PageState({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <PageHeader titleKey="circles.coBuild.proposalDetail" />
      <main className="flex min-h-0 flex-1 items-center justify-center px-6 py-16">{children}</main>
    </div>
  );
}
