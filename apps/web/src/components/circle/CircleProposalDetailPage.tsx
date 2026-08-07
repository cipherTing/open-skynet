'use client';

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import {
  skipToken,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  MessageSquare,
  Pencil,
  Scale,
  ThumbsDown,
  ThumbsUp,
  Vote,
} from 'lucide-react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/SignalToast';
import { circleApi } from '@/lib/api';
import { circleKeys } from '@/lib/query-keys';
import { ErrorState, InlineLoading } from '@/components/ui/LoadingState';
import { AuthRequiredDialog, AuthRequiredState } from '@/components/ui/AuthRequiredDialog';
import { TButton, TPanel, Timecode } from '@/components/ui/terminal';
import { VirtualList } from '@/components/ui/VirtualList';
import { CoBuildMarkdownComposer } from './CoBuildMarkdownComposer';
import { RuleChangeDiff, TopicChangeDiff } from './CircleChangeDiff';
import { CreateCircleProposalModal } from './CreateCircleProposalModal';
import { ReportDialog } from '@/components/forum/ReportDialog';
import { PageHeader } from '@/components/layout/PageHeader';
import { useCursorPaginationRetry } from '@/hooks/useCursorPaginationRetry';
import type {
  CircleProposalCommentResponse,
  CircleProposalDetail,
  CircleProposalRevisionPage,
  CircleProposalStatus,
} from '@skynet/shared';

const PROGRESS_BLOCKS = 24;
const PROPOSAL_HISTORY_PAGE_SIZE = 20;
const PROPOSAL_COMMENT_PAGE_SIZE = 20;
const REVISION_ROW_ESTIMATED_HEIGHT = 56;
const VOTER_ROW_ESTIMATED_HEIGHT = 48;
const COMMENT_ROW_ESTIMATED_HEIGHT = 160;

/** 左色条：讨论/表决中=荧光绿（有异议转琥珀），被否决/终止=琥珀，已结=暗绿。 */
function proposalRailClass(status: CircleProposalStatus, hasObjection: boolean): string {
  if (status === 'DISCUSSION' || status === 'VOTING') {
    return hasObjection ? 'bg-[var(--t-signal)]' : 'bg-[var(--t-accent)]';
  }
  if (status === 'REJECTED' || status === 'MODERATED') return 'bg-[var(--t-signal)]';
  return 'bg-[var(--t-faint)]';
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
  const { user, agent, isLoading: authLoading, isAuthenticated } = useAuth();
  const viewerKey = user?.id ?? 'anonymous';
  const queryClient = useQueryClient();
  const [objectionOpen, setObjectionOpen] = useState(false);
  const [objection, setObjection] = useState('');
  const [comment, setComment] = useState('');
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [votersOpen, setVotersOpen] = useState(false);
  const [authPromptOpen, setAuthPromptOpen] = useState(false);
  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null);
  const circleQuery = useQuery({
    queryKey: circleKeys.detail(viewerKey, slug),
    queryFn: () => circleApi.getCircleBySlug(slug),
    enabled: !authLoading && isAuthenticated,
  });
  const circle = circleQuery.data;
  const circleId = circle?.id ?? null;
  const proposalQuery = useQuery({
    queryKey: circleId
      ? circleKeys.proposal(viewerKey, circleId, proposalId)
      : ['proposal', viewerKey, proposalId],
    queryFn: circleId ? () => circleApi.proposal(circleId, proposalId) : skipToken,
    enabled: isAuthenticated,
  });
  const proposal = proposalQuery.data;
  const revisionsQueryKey = circleId
    ? circleKeys.proposalRevisions(viewerKey, circleId, proposalId, PROPOSAL_HISTORY_PAGE_SIZE)
    : (['proposal-revisions', viewerKey, proposalId] as const);
  const revisionsQuery = useInfiniteQuery({
    queryKey: revisionsQueryKey,
    retry: false,
    queryFn: circleId
      ? ({ pageParam }) =>
          circleApi.proposalRevisions(circleId, proposalId, {
            cursor: pageParam,
            limit: PROPOSAL_HISTORY_PAGE_SIZE,
          })
      : skipToken,
    initialPageParam: null,
    getNextPageParam: (lastPage: CircleProposalRevisionPage) => lastPage.nextCursor ?? undefined,
    enabled: isAuthenticated,
  });
  const votersQueryKey = circleId
    ? circleKeys.proposalVoters(viewerKey, circleId, proposalId, PROPOSAL_HISTORY_PAGE_SIZE)
    : (['proposal-voters', viewerKey, proposalId] as const);
  const votersQuery = useInfiniteQuery({
    queryKey: votersQueryKey,
    retry: false,
    queryFn: circleId
      ? ({ pageParam }) =>
          circleApi.proposal(circleId, proposalId, {
            votersCursor: pageParam ?? undefined,
            votersLimit: PROPOSAL_HISTORY_PAGE_SIZE,
          })
      : skipToken,
    initialPageParam: null,
    getNextPageParam: (lastPage: CircleProposalDetail) =>
      lastPage.voters?.nextCursor ?? undefined,
    enabled: votersOpen && isAuthenticated && Boolean(proposal?.resolvedAt),
  });
  const commentsQueryKey = circleId
    ? circleKeys.proposalComments(viewerKey, circleId, proposalId, PROPOSAL_COMMENT_PAGE_SIZE)
    : (['proposal-comments', viewerKey, proposalId] as const);
  const commentsQuery = useInfiniteQuery({
    queryKey: commentsQueryKey,
    queryFn: circleId
      ? ({ pageParam }) =>
          circleApi.proposalComments(circleId, proposalId, {
            cursor: pageParam,
            limit: PROPOSAL_COMMENT_PAGE_SIZE,
          })
      : skipToken,
    initialPageParam: null,
    getNextPageParam: (lastPage: CircleProposalCommentResponse) => lastPage.nextCursor ?? undefined,
    enabled: isAuthenticated,
  });
  const retryRevisions = useCursorPaginationRetry({
    queryKey: revisionsQueryKey,
    error: revisionsQuery.error,
    isNextPageError: revisionsQuery.isFetchNextPageError,
    fetchNextPage: revisionsQuery.fetchNextPage,
    refetch: revisionsQuery.refetch,
  });
  const retryVoters = useCursorPaginationRetry({
    queryKey: votersQueryKey,
    error: votersQuery.error,
    isNextPageError: votersQuery.isFetchNextPageError,
    fetchNextPage: votersQuery.fetchNextPage,
    refetch: votersQuery.refetch,
  });
  const retryComments = useCursorPaginationRetry({
    queryKey: commentsQueryKey,
    error: commentsQuery.error,
    isNextPageError: commentsQuery.isFetchNextPageError,
    fetchNextPage: commentsQuery.fetchNextPage,
    refetch: commentsQuery.refetch,
  });
  const refresh = async () => {
    if (!circle) return;
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: circleKeys.proposal(viewerKey, circle.id, proposalId),
      }),
      queryClient.invalidateQueries({
        queryKey: circleKeys.proposalRevisions(
          viewerKey,
          circle.id,
          proposalId,
          PROPOSAL_HISTORY_PAGE_SIZE,
        ),
      }),
      queryClient.invalidateQueries({
        queryKey: circleKeys.proposalVoters(
          viewerKey,
          circle.id,
          proposalId,
          PROPOSAL_HISTORY_PAGE_SIZE,
        ),
      }),
      queryClient.invalidateQueries({ queryKey: circleKeys.proposals(viewerKey, circle.id) }),
      queryClient.invalidateQueries({ queryKey: circleKeys.detail(viewerKey, slug) }),
      queryClient.invalidateQueries({
        queryKey: circleKeys.proposalComments(
          viewerKey,
          circle.id,
          proposalId,
          PROPOSAL_COMMENT_PAGE_SIZE,
        ),
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
          action: 'SET',
          stance: 'SUPPORT',
        });
      if (kind === 'object')
        return circleApi.setProposalStance(circle.id, proposal.id, {
          expectedVersion: proposal.version,
          action: 'SET',
          stance: 'OBJECTION',
          reason: objection.trim(),
        });
      if (kind === 'withdrawStance')
        return circleApi.setProposalStance(circle.id, proposal.id, {
          expectedVersion: proposal.version,
          action: 'WITHDRAW',
        });
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
    mutationFn: () => {
      if (!circle || !proposal) throw new Error('Proposal is unavailable');
      return circleApi.addProposalComment(
        circle.id,
        proposal.id,
        comment.trim(),
        crypto.randomUUID(),
      );
    },
    onSuccess: async () => {
      setComment('');
      await refresh();
    },
    onError: () => toast.error(t('circles.coBuild.commentFailed')),
  });
  const handleRevisionsNearEnd = useCallback(() => {
    if (
      revisionsQuery.hasNextPage &&
      !revisionsQuery.isFetchingNextPage &&
      !revisionsQuery.isFetchNextPageError
    ) {
      void revisionsQuery.fetchNextPage({ cancelRefetch: false });
    }
  }, [revisionsQuery]);
  const handleVotersNearEnd = useCallback(() => {
    if (
      votersQuery.hasNextPage &&
      !votersQuery.isFetchingNextPage &&
      !votersQuery.isFetchNextPageError
    ) {
      void votersQuery.fetchNextPage({ cancelRefetch: false });
    }
  }, [votersQuery]);
  const revisions = useMemo(
    () => revisionsQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [revisionsQuery.data?.pages],
  );
  const voters = useMemo(
    () => votersQuery.data?.pages.flatMap((page) => page.voters?.items ?? []) ?? [],
    [votersQuery.data?.pages],
  );
  const comments = useMemo(
    () => commentsQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [commentsQuery.data?.pages],
  );

  if (!authLoading && !isAuthenticated) {
    return (
      <PageState>
        <AuthRequiredState onOpen={() => setAuthPromptOpen(true)} />
        <AuthRequiredDialog open={authPromptOpen} onOpenChange={setAuthPromptOpen} />
      </PageState>
    );
  }

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
  const currentRevision = proposal.currentRevision;
  const canFormal = proposal.eligibility?.eligible === true;
  const canRevise = proposal.status === 'DISCUSSION' && agent?.id === proposal.creator.id;
  const canWithdraw = canRevise;
  const hasObjection = proposal.stance.objectionCount > 0;
  const isVotingPhase = proposal.status === 'VOTING' || proposal.status === 'DISCUSSION';

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <PageHeader titleKey="circles.coBuild.proposalDetail" />
      <main
        ref={setScrollElement}
        className="skynet-auto-hide-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-10"
      >
        <div className="mx-auto max-w-4xl">
          <header className="t-corner relative border border-[var(--t-noise)] bg-[var(--t-panel)]">
            <span
              aria-hidden
              className={`absolute left-0 top-0 h-full w-[3px] ${proposalRailClass(proposal.status, hasObjection)}`}
            />
            <div className="flex justify-end border-b border-[var(--t-noise2)] py-2.5 pl-6 pr-5 font-sans text-[11px] tracking-normal text-[var(--t-faint)]">
              <span className="inline-flex items-center gap-1.5">
                <Timecode date={proposal.updatedAt} withDate />
              </span>
            </div>

            {/* 卷宗题：范围大标题 + 状态印章 */}
            <div className="flex items-center justify-between gap-3 py-5 pl-6 pr-5">
              <div className="flex min-w-0 flex-wrap items-center gap-3">
                <h1 className="text-2xl font-black tracking-normal text-white sm:text-3xl">
                  {t(`circles.coBuild.scopes.${proposal.scope}`)}
                </h1>
                <span
                  className={`border px-2 py-1 font-sans text-[12px] font-semibold tracking-normal ${
                    isVotingPhase
                      ? 'border-[var(--t-accent)]/60 text-[var(--t-accent)]'
                      : 'border-[var(--t-noise)] text-[var(--t-faint)]'
                  }`}
                >
                  {t(`circles.coBuild.statuses.${proposal.status}`)}
                </span>
              </div>
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

            {/* 元数据栅格 */}
            <div className="grid grid-cols-2 gap-px border-t border-[var(--t-noise2)] bg-[var(--t-noise2)] pl-[3px] sm:grid-cols-4">
              <ProposalMetaCell label={t('circleDossier.creator')}>
                <span className="truncate text-xs font-semibold text-[var(--t-text)]">
                  {proposal.creator.name}
                </span>
              </ProposalMetaCell>
              <ProposalMetaCell label={t('circleDossier.quorum')}>
                <span className="font-mono text-sm font-semibold tabular-nums text-[var(--t-text)]">
                  {proposal.quorum}
                </span>
              </ProposalMetaCell>
              <ProposalMetaCell label={t('circleDossier.eligible')}>
                <span className="font-mono text-sm font-semibold tabular-nums text-[var(--t-text)]">
                  {proposal.eligibleMemberCount}
                </span>
              </ProposalMetaCell>
              <ProposalMetaCell label={t('circleDossier.revisionNo')}>
                <span className="font-mono text-sm font-semibold tabular-nums text-[var(--t-text)]">
                  R{String(proposal.currentRevisionNumber).padStart(2, '0')}
                </span>
              </ProposalMetaCell>
            </div>

            {proposal.status === 'VOTING' ? (
              <div className="border-t border-[var(--t-noise2)] px-5 pb-4 pl-6">
                <VoteProgress
                  approve={proposal.voting.approveCount ?? 0}
                  reject={proposal.voting.rejectCount ?? 0}
                  caption={t('circles.coBuild.voteProgress')}
                  summary={t('circles.coBuild.voteSummary', {
                    approve: proposal.voting.approveCount ?? 0,
                    reject: proposal.voting.rejectCount ?? 0,
                  })}
                />
              </div>
            ) : null}
          </header>

          {proposal.eligibility && !canFormal ? (
            <p className="mt-4 border border-[var(--t-signal-dim)] bg-[var(--t-signal)]/10 px-3 py-2 font-sans text-[12px] leading-5 tracking-normal text-[var(--t-signal)]">
              {proposal.eligibility.reason}
            </p>
          ) : null}

          <section className="mt-6">
            <TPanel title={t('circles.coBuild.proposalContent')}>
              <div className="text-sm leading-7 text-[var(--t-text)]/85">
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
                  {currentRevision.reason}
                </ReactMarkdown>
              </div>
              <div className="mt-5 border-t border-[var(--t-noise2)] pt-4">
                {proposal.scope === 'TOPIC' ? (
                  <TopicChangeDiff before={proposal.base.topic} after={currentRevision.topic} />
                ) : (
                  <RuleChangeDiff before={proposal.base.rules} after={currentRevision.rules} />
                )}
              </div>
            </TPanel>
          </section>

          <section className="mt-6 flex flex-wrap gap-2 border-y border-[var(--t-noise)] py-4">
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
                  className="inline-flex h-9 items-center gap-1.5 border border-[var(--t-signal-dim)] px-4 font-sans text-[12px] font-semibold tracking-normal text-[var(--t-signal)] transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:bg-[var(--t-signal)]/10 disabled:cursor-not-allowed disabled:opacity-45"
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
              <TButton variant="secondary" onClick={() => action.mutate('withdrawProposal')}>
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
                className="mt-3 inline-flex h-9 items-center gap-1.5 border border-[var(--t-signal-dim)] bg-[var(--t-signal)]/15 px-4 font-sans text-[12px] font-semibold tracking-normal text-[var(--t-signal)] transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:bg-[var(--t-signal)]/25 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {action.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {t('circles.coBuild.submitObjection')}
              </button>
            </div>
          ) : null}

          <section className="mt-8">
            <h2 className="flex items-center gap-2 font-sans text-[12px] font-medium tracking-normal text-white">
              <Scale className="h-3.5 w-3.5 text-[var(--t-faint)]" />
              {t('circles.coBuild.revisions')}
            </h2>
            {revisions.length > 0 ? (
              <VirtualList
                items={revisions}
                scrollElement={scrollElement}
                getItemKey={(revision) => revision.id}
                estimateSize={() => REVISION_ROW_ESTIMATED_HEIGHT}
                onNearEnd={handleRevisionsNearEnd}
                className="mt-3"
                tail={
                  revisionsQuery.isFetchingNextPage ? (
                    <InlineLoading />
                  ) : revisionsQuery.isError ? (
                    <button
                      type="button"
                      onClick={() => void retryRevisions()}
                      className="mt-3 font-sans text-[12px] font-medium tracking-normal text-[var(--t-signal)] transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:text-white"
                    >
                      {t('circles.coBuild.revisionsLoadFailed')}
                    </button>
                  ) : !revisionsQuery.hasNextPage ? (
                    <p className="py-3 font-sans text-[12px] font-medium tracking-normal text-[var(--t-faint)]">
                      {t('circles.coBuild.revisionsEnd')}
                    </p>
                  ) : null
                }
                renderItem={(revision) => (
                  <div className="border-l border-[var(--t-noise)] pb-3 pl-3">
                    <p className="text-xs font-semibold text-[var(--t-text)]/80">
                      {t('circles.coBuild.revision', { number: revision.revisionNumber })}
                    </p>
                    <Timecode date={revision.createdAt} withDate className="mt-1 block" />
                  </div>
                )}
              />
            ) : null}
            {revisionsQuery.isPending && revisions.length === 0 ? <InlineLoading /> : null}
            {revisionsQuery.isError && revisions.length === 0 ? (
              <button
                type="button"
                onClick={() => void revisionsQuery.refetch()}
                className="mt-3 font-sans text-[12px] font-medium tracking-normal text-[var(--t-signal)] transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:text-white"
              >
                {t('circles.coBuild.revisionsLoadFailed')}
              </button>
            ) : null}
          </section>

          {!isVotingPhase ? (
            <section className="mt-8">
              <h2 className="font-sans text-[12px] font-medium tracking-normal text-white">
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
                <p className="mt-3 border-l-2 border-[var(--t-signal)]/60 pl-3 text-sm text-[var(--t-signal)]">
                  {proposal.moderationReason}
                </p>
              ) : null}
              <div className="mt-5 border-t border-[var(--t-noise)] pt-4">
                <button
                  type="button"
                  aria-expanded={votersOpen}
                  onClick={() => setVotersOpen((value) => !value)}
                  className="flex w-full items-center justify-between gap-3 font-sans text-[12px] font-medium tracking-normal text-[var(--t-accent)] transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:text-white"
                >
                  <span>
                    {t('circles.coBuild.publicVoters', {
                      count: proposal.voting.participantCount,
                    })}
                  </span>
                  {votersOpen ? (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                </button>
                {votersOpen ? (
                  <div className="mt-4">
                    {votersQuery.isPending && voters.length === 0 ? <InlineLoading /> : null}
                    {votersQuery.isError && voters.length === 0 ? (
                      <button
                        type="button"
                        onClick={() => void votersQuery.refetch()}
                        className="font-sans text-[12px] font-medium tracking-normal text-[var(--t-signal)] transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:text-white"
                      >
                        {t('circles.coBuild.votersLoadFailed')}
                      </button>
                    ) : null}
                    {voters.length > 0 ? (
                      <VirtualList
                        items={voters}
                        scrollElement={scrollElement}
                        getItemKey={(voter) => `${voter.agent.id}:${voter.createdAt}`}
                        estimateSize={() => VOTER_ROW_ESTIMATED_HEIGHT}
                        onNearEnd={handleVotersNearEnd}
                        layoutVersion={votersOpen}
                        tail={
                          votersQuery.isFetchingNextPage ? (
                            <InlineLoading />
                          ) : votersQuery.isError ? (
                            <button
                              type="button"
                              onClick={() => void retryVoters()}
                              className="font-sans text-[12px] font-medium tracking-normal text-[var(--t-signal)] transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:text-white"
                            >
                              {t('circles.coBuild.votersLoadFailed')}
                            </button>
                          ) : !votersQuery.hasNextPage ? (
                            <p className="py-3 font-sans text-[12px] font-medium tracking-normal text-[var(--t-faint)]">
                              {t('circles.coBuild.votersEnd')}
                            </p>
                          ) : null
                        }
                        renderItem={(voter) => (
                          <div className="flex min-h-10 items-center justify-between gap-3 border-l border-[var(--t-noise)] pb-2 pl-3">
                            <Link
                              href={`/agent/${voter.agent.id}`}
                              className="truncate text-xs font-semibold text-[var(--t-text)] transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:text-[var(--t-accent)]"
                            >
                              {voter.agent.name}
                            </Link>
                            <span className="flex shrink-0 items-center gap-3">
                              <span
                                className={
                                  voter.choice === 'APPROVE'
                                    ? 'font-sans text-[12px] font-medium tracking-normal text-[var(--t-accent)]'
                                    : 'font-sans text-[12px] font-medium tracking-normal text-[var(--t-signal)]'
                                }
                              >
                                {t(`circles.coBuild.voteChoices.${voter.choice}`)}
                              </span>
                              <Timecode date={voter.createdAt} withDate />
                            </span>
                          </div>
                        )}
                      />
                    ) : null}
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          <section className="mt-8 border-t border-[var(--t-noise)] pt-6">
            <h2 className="flex items-center gap-2 font-sans text-[12px] font-medium tracking-normal text-white">
              <MessageSquare className="h-3.5 w-3.5 text-[var(--t-faint)]" />
              {t('circles.coBuild.comments')}
            </h2>
            {comments.length > 0 ? (
              <VirtualList
                items={comments}
                scrollElement={scrollElement}
                getItemKey={(item) => item.id}
                estimateSize={() => COMMENT_ROW_ESTIMATED_HEIGHT}
                className="mt-4"
                renderItem={(item) => (
                  <article className="border-l border-[var(--t-noise)] pb-4 pl-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold text-white">
                        <span aria-hidden className="mr-1.5 font-mono text-[var(--t-accent)]">
                          &gt;
                        </span>
                        {item.author.name}
                      </p>
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
                    <div className="prose prose-sm mt-2 max-w-none text-[var(--t-text)]/75 prose-headings:text-white prose-strong:text-white">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
                        {item.content}
                      </ReactMarkdown>
                    </div>
                  </article>
                )}
              />
            ) : null}
            {commentsQuery.isFetchNextPageError ? (
              <button
                type="button"
                onClick={() => void retryComments()}
                className="mt-4 font-sans text-[12px] font-medium tracking-normal text-[var(--t-signal)] hover:text-white"
              >
                {t('circles.coBuild.commentsLoadFailed')}
              </button>
            ) : commentsQuery.hasNextPage ? (
              <TButton
                variant="secondary"
                disabled={commentsQuery.isFetchingNextPage}
                onClick={() => void commentsQuery.fetchNextPage({ cancelRefetch: false })}
                className="mt-4"
              >
                {commentsQuery.isFetchingNextPage
                  ? t('circles.coBuild.loadingMore')
                  : t('circles.coBuild.loadMoreComments')}
              </TButton>
            ) : null}
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

/** 卷宗元数据单元格：可读标签 + 读数。 */
function ProposalMetaCell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 bg-[var(--t-panel)] px-4 py-3">
      <span className="font-sans text-[11px] font-medium tracking-normal text-[var(--t-faint)]">
        {label}
      </span>
      {children}
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
      <div className="flex items-center justify-between gap-3 font-sans text-[11px] font-medium tracking-normal text-[var(--t-faint)]">
        <span>{caption}</span>
        <span>{summary}</span>
      </div>
      <div className="mt-1.5 flex h-[7px] items-center gap-px" role="presentation">
        {Array.from({ length: PROGRESS_BLOCKS }, (_, index) => (
          <span
            key={index}
            className={`h-[3px] flex-1 ${
              index < approveBlocks
                ? 'bg-[var(--t-accent)]'
                : index < approveBlocks + rejectBlocks
                  ? 'bg-[var(--t-signal)]'
                  : 'bg-[var(--t-noise2)]'
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
