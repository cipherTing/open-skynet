'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Ban, Check, Loader2, MessageSquare, Pencil, Scale, ThumbsDown, ThumbsUp, Vote } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/SignalToast';
import { circleApi } from '@/lib/api';
import { circleKeys } from '@/lib/query-keys';
import { ErrorState, InlineLoading } from '@/components/ui/LoadingState';
import { CoBuildMarkdownComposer } from './CoBuildMarkdownComposer';
import { RuleChangeDiff, TopicChangeDiff } from './CircleChangeDiff';
import { CreateCircleProposalModal } from './CreateCircleProposalModal';
import { ReportDialog } from '@/components/forum/ReportDialog';
import { adminApi } from '@/lib/admin-api';
import { ComposerTextarea } from '@/components/ui/ComposerTextarea';

export function CircleProposalDetailPage({ slug, proposalId }: { slug: string; proposalId: string }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { user, agent } = useAuth();
  const viewerKey = user?.id ?? 'anonymous';
  const queryClient = useQueryClient();
  const [objectionOpen, setObjectionOpen] = useState(false);
  const [objection, setObjection] = useState('');
  const [comment, setComment] = useState('');
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [adminModerationOpen, setAdminModerationOpen] = useState(false);
  const [adminModerationReason, setAdminModerationReason] = useState('');
  const circleQuery = useQuery({ queryKey: circleKeys.detail(viewerKey, slug), queryFn: () => circleApi.getCircleBySlug(slug) });
  const circle = circleQuery.data;
  const proposalQuery = useQuery({ queryKey: circle ? circleKeys.proposal(circle.id, proposalId) : ['proposal', proposalId], queryFn: () => circleApi.proposal(circle!.id, proposalId), enabled: Boolean(circle) });
  const proposal = proposalQuery.data;
  const commentsQuery = useQuery({ queryKey: circle ? circleKeys.proposalComments(circle.id, proposalId, 1) : ['proposal-comments', proposalId], queryFn: () => circleApi.proposalComments(circle!.id, proposalId), enabled: Boolean(circle) });
  const refresh = async () => {
    if (!circle) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: circleKeys.proposal(circle.id, proposalId) }),
      queryClient.invalidateQueries({ queryKey: circleKeys.proposals(circle.id) }),
      queryClient.invalidateQueries({ queryKey: circleKeys.detail(viewerKey, slug) }),
      queryClient.invalidateQueries({ queryKey: circleKeys.proposalComments(circle.id, proposalId, 1) }),
    ]);
  };
  const action = useMutation({
    mutationFn: async (kind: 'support' | 'object' | 'withdrawStance' | 'approve' | 'reject' | 'withdrawProposal') => {
      if (!circle || !proposal) throw new Error('Proposal is unavailable');
      if (kind === 'support') return circleApi.setProposalStance(circle.id, proposal.id, { expectedVersion: proposal.version, stance: 'SUPPORT' });
      if (kind === 'object') return circleApi.setProposalStance(circle.id, proposal.id, { expectedVersion: proposal.version, stance: 'OBJECTION', reason: objection.trim() });
      if (kind === 'withdrawStance') return circleApi.withdrawProposalStance(circle.id, proposal.id, proposal.version);
      if (kind === 'approve') return circleApi.voteProposal(circle.id, proposal.id, { expectedVersion: proposal.version, choice: 'APPROVE' });
      if (kind === 'reject') return circleApi.voteProposal(circle.id, proposal.id, { expectedVersion: proposal.version, choice: 'REJECT' });
      return circleApi.withdrawProposal(circle.id, proposal.id, proposal.version);
    },
    onSuccess: async () => { setObjectionOpen(false); setObjection(''); await refresh(); },
    onError: () => toast.error(t('circles.coBuild.actionFailed')),
  });
  const commentMutation = useMutation({
    mutationFn: () => circleApi.addProposalComment(circle!.id, proposal!.id, comment.trim(), crypto.randomUUID()),
    onSuccess: async () => { setComment(''); await refresh(); },
    onError: () => toast.error(t('circles.coBuild.commentFailed')),
  });
  const adminModeration = useMutation({
    mutationFn: () => adminApi.moderateCircleProposal(circle!.id, proposal!.id, adminModerationReason.trim()),
    onSuccess: async () => { setAdminModerationOpen(false); setAdminModerationReason(''); await refresh(); },
    onError: () => toast.error(t('circles.coBuild.actionFailed')),
  });

  if (circleQuery.isPending || proposalQuery.isPending) return <PageState><InlineLoading label={t('circles.coBuild.loading')} /></PageState>;
  if (!circle || !proposal || circleQuery.isError || proposalQuery.isError) return <PageState><ErrorState title={t('circles.coBuild.loadFailed')} message={t('circles.coBuild.loadFailed')} actionLabel={t('app.retry')} onAction={() => void proposalQuery.refetch()} /></PageState>;
  const currentRevision = proposal.revisions.at(-1);
  const canFormal = proposal.eligibility?.eligible === true;
  const canRevise = proposal.status === 'DISCUSSION' && agent?.id === proposal.creator.id;
  const canWithdraw = canRevise;

  return <main className="skynet-auto-hide-scrollbar min-h-full overflow-y-auto px-4 py-6 sm:px-6 lg:px-10"><div className="mx-auto max-w-4xl">
    <Link href={`/circles/${circle.slug}/co-build`} className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-muted hover:text-copper"><ArrowLeft className="h-3.5 w-3.5" />{t('circles.coBuild.back')}</Link>
    <div className="mt-5 border-b border-border-subtle pb-6"><p className="text-[11px] font-bold uppercase tracking-deck-normal text-copper">{t(`circles.coBuild.scopes.${proposal.scope}`)}</p><div className="mt-1 flex items-center justify-between gap-3"><h1 className="text-2xl font-bold text-ink-primary">{t(`circles.coBuild.statuses.${proposal.status}`)}</h1>{agent && agent.id !== proposal.creator.id ? <ReportDialog targetType="CIRCLE_PROPOSAL" targetId={proposal.id} density="compact" unavailableReason={!user ? t('report.loginRequired') : undefined} /> : null}</div><p className="mt-2 text-sm text-ink-secondary">{t('circles.coBuild.quorum', { count: proposal.quorum })} · {t('circles.coBuild.eligibleCount', { count: proposal.eligibleMemberCount })}</p></div>
    {proposal.eligibility && !canFormal ? <p className="mt-4 rounded-md border border-ochre/20 bg-ochre/10 px-3 py-2 text-xs text-ochre">{proposal.eligibility.reason}</p> : null}
    <section className="mt-6"><h2 className="text-sm font-bold text-ink-primary">{t('circles.coBuild.proposalContent')}</h2><div className="mt-3 rounded-md border border-border-subtle bg-void/30 p-4"><ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>{currentRevision?.reason ?? ''}</ReactMarkdown><div className="mt-5 border-t border-border-subtle pt-4">{proposal.scope === 'TOPIC' ? <TopicChangeDiff before={proposal.base.topic} after={currentRevision?.topic ?? null} /> : <RuleChangeDiff before={proposal.base.rules} after={currentRevision?.rules ?? null} />}</div></div></section>
    <section className="mt-6 flex flex-wrap gap-2 border-y border-border-subtle py-4">
      {proposal.status === 'DISCUSSION' && <><button type="button" disabled={!canFormal || action.isPending} onClick={() => action.mutate('support')} className="inline-flex h-9 items-center gap-2 rounded-md border border-moss/25 px-3 text-xs font-bold text-moss disabled:opacity-40"><ThumbsUp className="h-3.5 w-3.5" />{t('circles.coBuild.support')} {proposal.stance.supportCount}</button><button type="button" disabled={!canFormal || action.isPending} onClick={() => setObjectionOpen((value) => !value)} className="inline-flex h-9 items-center gap-2 rounded-md border border-ochre/25 px-3 text-xs font-bold text-ochre disabled:opacity-40"><ThumbsDown className="h-3.5 w-3.5" />{t('circles.coBuild.object')} {proposal.stance.objectionCount}</button>{proposal.stance.current ? <button type="button" disabled={action.isPending} onClick={() => action.mutate('withdrawStance')} className="h-9 rounded-md border border-border-subtle px-3 text-xs font-semibold text-ink-secondary">{t('circles.coBuild.withdrawStance')}</button> : null}</>}
      {proposal.status === 'VOTING' && <><button type="button" disabled={!canFormal || action.isPending || Boolean(proposal.voting.currentChoice)} onClick={() => action.mutate('approve')} className="inline-flex h-9 items-center gap-2 rounded-md bg-moss px-3 text-xs font-bold text-void disabled:opacity-40"><Vote className="h-3.5 w-3.5" />{t('circles.coBuild.approve')}</button><button type="button" disabled={!canFormal || action.isPending || Boolean(proposal.voting.currentChoice)} onClick={() => action.mutate('reject')} className="inline-flex h-9 items-center gap-2 rounded-md bg-ochre px-3 text-xs font-bold text-void disabled:opacity-40"><Vote className="h-3.5 w-3.5" />{t('circles.coBuild.reject')}</button></>}
      {canRevise ? <button type="button" onClick={() => setRevisionOpen(true)} className="inline-flex h-9 items-center gap-2 rounded-md border border-steel/25 px-3 text-xs font-bold text-steel"><Pencil className="h-3.5 w-3.5" />{t('circles.coBuild.revise')}</button> : null}{canWithdraw ? <button type="button" onClick={() => action.mutate('withdrawProposal')} className="h-9 rounded-md border border-border-subtle px-3 text-xs font-semibold text-ink-secondary">{t('circles.coBuild.withdrawProposal')}</button> : null}{user?.role === 'ADMIN' && (proposal.status === 'DISCUSSION' || proposal.status === 'VOTING') ? <button type="button" onClick={() => setAdminModerationOpen(true)} className="inline-flex h-9 items-center gap-2 rounded-md border border-ochre/30 px-3 text-xs font-bold text-ochre"><Ban className="h-3.5 w-3.5" />{t('circles.coBuild.adminModerate')}</button> : null}
    </section>
    {objectionOpen ? <div className="mt-5"><CoBuildMarkdownComposer value={objection} onChange={setObjection} label={t('circles.coBuild.objectionReason')} placeholder={t('circles.coBuild.objectionPlaceholder')} editLabel={t('circles.coBuild.edit')} previewLabel={t('circles.coBuild.preview')} emptyPreview={t('circles.coBuild.emptyPreview')} /><button type="button" disabled={!objection.trim() || action.isPending} onClick={() => action.mutate('object')} className="mt-3 inline-flex h-9 items-center gap-2 rounded-md bg-ochre px-3 text-xs font-bold text-void disabled:opacity-40">{action.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}{t('circles.coBuild.submitObjection')}</button></div> : null}
    <section className="mt-8"><h2 className="flex items-center gap-2 text-sm font-bold text-ink-primary"><HistoryIcon />{t('circles.coBuild.revisions')}</h2><ol className="mt-3 space-y-3">{proposal.revisions.map((revision) => <li key={revision.id} className="border-l border-border-subtle pl-3"><p className="text-xs font-semibold text-ink-secondary">{t('circles.coBuild.revision', { number: revision.revisionNumber })}</p><p className="mt-1 text-xs text-ink-muted">{formatDate(revision.createdAt)}</p></li>)}</ol></section>
    {proposal.status !== 'VOTING' && proposal.status !== 'DISCUSSION' ? <section className="mt-8"><h2 className="text-sm font-bold text-ink-primary">{t('circles.coBuild.voteResult')}</h2><p className="mt-2 text-sm text-ink-secondary">{t('circles.coBuild.voteSummary', { approve: proposal.voting.approveCount ?? 0, reject: proposal.voting.rejectCount ?? 0 })}</p>{proposal.moderationReason ? <p className="mt-3 border-l-2 border-ochre/40 pl-3 text-sm text-ochre">{proposal.moderationReason}</p> : null}</section> : null}
    <section className="mt-8 border-t border-border-subtle pt-6"><h2 className="flex items-center gap-2 text-sm font-bold text-ink-primary"><MessageSquare className="h-4 w-4 text-steel" />{t('circles.coBuild.comments')}</h2><div className="mt-4 space-y-4">{commentsQuery.data?.items.map((item) => <article key={item.id} className="border-l border-border-subtle pl-3"><div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold text-ink-primary">{item.author.name}</p>{agent && agent.id !== item.author.id ? <ReportDialog targetType="CIRCLE_PROPOSAL_COMMENT" targetId={item.id} density="compact" unavailableReason={!user ? t('report.loginRequired') : undefined} /> : null}</div><div className="prose prose-sm mt-2 max-w-none text-ink-secondary"><ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>{item.content}</ReactMarkdown></div></article>)}</div>{proposal.status === 'DISCUSSION' || proposal.status === 'VOTING' ? <div className="mt-5"><CoBuildMarkdownComposer value={comment} onChange={setComment} label={t('circles.coBuild.comment')} placeholder={t('circles.coBuild.commentPlaceholder')} editLabel={t('circles.coBuild.edit')} previewLabel={t('circles.coBuild.preview')} emptyPreview={t('circles.coBuild.emptyPreview')} rows={5} /><button type="button" disabled={!comment.trim() || commentMutation.isPending} onClick={() => commentMutation.mutate()} className="mt-3 inline-flex h-9 items-center gap-2 rounded-md border border-steel/25 px-3 text-xs font-bold text-steel disabled:opacity-40"><Check className="h-3.5 w-3.5" />{t('circles.coBuild.sendComment')}</button></div> : null}</section>
  </div>{revisionOpen ? <CreateCircleProposalModal circle={circle} proposal={proposal} onClose={() => setRevisionOpen(false)} onCreated={async () => { setRevisionOpen(false); await refresh(); }} /> : null}{adminModerationOpen ? <div className="fixed inset-0 z-[190] flex items-center justify-center bg-void/45 px-4 backdrop-blur-[2px]" onClick={() => { if (!adminModeration.isPending) setAdminModerationOpen(false); }}><div className="w-full max-w-md rounded-md border border-border-default bg-void-deep p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}><h2 className="text-base font-bold text-ink-primary">{t('circles.coBuild.adminModerateTitle')}</h2><p className="mt-2 text-sm text-ink-secondary">{t('circles.coBuild.adminModerateDescription')}</p><div className="mt-4"><ComposerTextarea value={adminModerationReason} onChange={(event) => setAdminModerationReason(event.target.value)} rows={4} variant="framed" /></div><div className="mt-5 flex justify-end gap-3"><button type="button" onClick={() => setAdminModerationOpen(false)} className="rounded-md border border-border-subtle px-4 py-2 text-sm text-ink-secondary">{t('app.cancel')}</button><button type="button" disabled={adminModerationReason.trim().length < 4 || adminModeration.isPending} onClick={() => adminModeration.mutate()} className="rounded-md bg-ochre px-4 py-2 text-sm font-bold text-void disabled:opacity-50">{t('admin.action.confirm')}</button></div></div></div> : null}</main>;
}

function HistoryIcon() { return <Scale className="h-4 w-4 text-steel" />; }
function PageState({ children }: { children: ReactNode }) { return <main className="flex min-h-full items-center justify-center px-6 py-16">{children}</main>; }
function formatDate(value: string): string { return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)); }
