'use client';

import { Gavel, Radar, ShieldCheck } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { emitGlitch } from '@/components/home/terminal/glitch-bus';
import { TelemetryValue } from '@/components/home/terminal/TelemetryValue';
import { TButton } from '@/components/ui/terminal/TButton';
import { TEmpty } from '@/components/ui/terminal/TEmpty';
import { TPanel } from '@/components/ui/terminal/TPanel';
import { TSkeleton } from '@/components/ui/terminal/TSkeleton';
import { TTag } from '@/components/ui/terminal/TTag';
import { Timecode } from '@/components/ui/terminal/Timecode';
import { useToast } from '@/components/ui/SignalToast';
import { governanceApi, type GovernanceDecision } from '@/lib/api';
import { isGovernanceAuthError } from './governance-format';
import { GovernanceAlertRail, GovernanceChapterTitle } from './GovernanceTerminal';

function formatInteger(value: number): string {
  return String(Math.round(value));
}

export function GovernanceCaseConsole() {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading: isAuthLoading, isUnavailable: isAuthUnavailable } = useAuth();
  const enabled = isAuthenticated && !isAuthLoading && !isAuthUnavailable;

  const currentQuery = useQuery({
    queryKey: ['governance', 'console', 'current'],
    queryFn: () => governanceApi.current(),
    enabled,
    retry: (failureCount, error) => !isGovernanceAuthError(error) && failureCount < 2,
  });
  const assigned = currentQuery.data ?? null;

  const dispatchMutation = useMutation({
    mutationFn: () => governanceApi.dispatch(),
    onSuccess: (data) => {
      queryClient.setQueryData(['governance', 'console', 'current'], data);
    },
    onError: () => {
      toast.error(t('governance.console.dispatchFailed'));
    },
  });

  const decisionMutation = useMutation({
    mutationFn: ({ caseId, decision }: { caseId: string; decision: GovernanceDecision }) =>
      governanceApi.submitDecision(caseId, decision),
    onSuccess: () => {
      toast.success(t('governance.console.decisionSuccess'));
      emitGlitch();
      void queryClient.invalidateQueries({ queryKey: ['governance'] });
    },
    onError: () => {
      toast.error(t('governance.console.decisionFailed'));
    },
  });

  const busy = dispatchMutation.isPending || decisionMutation.isPending;
  const isEmergency = assigned?.case.status === 'EMERGENCY';
  const deadlineAt = assigned
    ? isEmergency
      ? assigned.case.emergencyDeadlineAt
      : assigned.case.normalDeadlineAt
    : null;

  const castVote = (decision: GovernanceDecision) => {
    if (!assigned || busy) return;
    decisionMutation.mutate({ caseId: assigned.case.id, decision });
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-8">
      <header>
        <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#3A5A3A]">
          SKYNET // GOVERNANCE
        </p>
        <h1 className="mt-2 text-xl font-bold text-white">{t('governance.console.pageTitle')}</h1>
        <p className="mt-1 text-xs text-text-tertiary">{t('governance.console.pageSubtitle')}</p>
      </header>

      {isAuthLoading ? (
        <TPanel>
          <TSkeleton rows={4} />
        </TPanel>
      ) : isAuthUnavailable ? (
        <TEmpty message={t('governance.syncFailed')} />
      ) : !isAuthenticated ? (
        <TEmpty message={t('governance.loginRequiredDescription')} />
      ) : (
        <>
          <TPanel
            meta={
              assigned ? (
                <Timecode date={assigned.case.openedAt} withDate className="text-[#3A5A3A]" />
              ) : undefined
            }
            actions={
              <TButton
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() => dispatchMutation.mutate()}
              >
                <Radar className="h-3.5 w-3.5" />
                {dispatchMutation.isPending
                  ? t('governance.console.dispatching')
                  : t('governance.console.dispatch')}
              </TButton>
            }
          >
            <GovernanceChapterTitle chapter="CH.01" title={t('governance.console.chapterCase')} />
            {currentQuery.isLoading ? (
              <TSkeleton rows={3} className="mt-4" />
            ) : currentQuery.isError ? (
              <p className="mt-4 border border-[#7F1D1D] bg-[#7F1D1D]/20 px-3 py-2 font-mono text-xs text-[#EF4444]/80">
                {t('governance.syncFailed')}
              </p>
            ) : assigned ? (
              <article className="relative mt-4 border border-[#1A2E1A] bg-[#040704] py-4 pl-5 pr-4">
                <GovernanceAlertRail tone="pending" />
                <div className="flex flex-wrap items-center gap-2">
                  <TTag color="accent">{t(`governance.targetTypes.${assigned.case.targetType}`)}</TTag>
                  <TTag color={isEmergency ? 'amber' : 'default'}>
                    {isEmergency
                      ? t('governance.console.statusEmergency')
                      : t('governance.console.statusOpen')}
                  </TTag>
                  {deadlineAt ? (
                    <span className="ml-auto flex items-center gap-1.5 font-mono text-[10px] tracking-[0.15em] text-[#3A5A3A]">
                      {t('governance.console.deadline')}
                      <Timecode date={deadlineAt} withDate className="text-[#ADFF2F]" />
                    </span>
                  ) : null}
                </div>
                {assigned.case.target.title ? (
                  <h2 className="mt-3 text-sm font-bold text-white">{assigned.case.target.title}</h2>
                ) : null}
                <p className="mt-2 line-clamp-5 whitespace-pre-wrap text-xs leading-5 text-text-secondary [overflow-wrap:anywhere]">
                  {assigned.case.target.content}
                </p>
              </article>
            ) : (
              <TEmpty className="mt-4" message={t('governance.console.emptyCase')} />
            )}
          </TPanel>

          <TPanel>
            <GovernanceChapterTitle chapter="CH.02" title={t('governance.console.chapterVote')} />
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <TButton
                variant="danger"
                disabled={!assigned || busy}
                onClick={() => castVote('VIOLATION')}
              >
                <Gavel className="h-3.5 w-3.5" />
                {decisionMutation.isPending
                  ? t('governance.console.voting')
                  : t('governance.console.voteViolation')}
              </TButton>
              <TButton
                variant="primary"
                disabled={!assigned || busy}
                onClick={() => castVote('NOT_VIOLATION')}
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                {decisionMutation.isPending
                  ? t('governance.console.voting')
                  : t('governance.console.voteNotViolation')}
              </TButton>
            </div>
          </TPanel>

          <TPanel
            meta={
              assigned ? (
                <span className="tabular-nums">
                  {t('governance.console.quotaUsed', {
                    used: assigned.quota.quotaUsed,
                    total: assigned.quota.quotaTotal,
                  })}
                </span>
              ) : undefined
            }
          >
            <GovernanceChapterTitle chapter="CH.03" title={t('governance.console.chapterQuota')} />
            <div className="mt-4 flex items-baseline gap-3">
              {assigned ? (
                <>
                  <TelemetryValue
                    value={assigned.quota.quotaRemaining}
                    format={formatInteger}
                    className="font-mono text-2xl font-bold text-[#ADFF2F]"
                  />
                  <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#3A5A3A]">
                    {t('governance.console.quotaRemaining')}
                  </span>
                </>
              ) : (
                <span className="font-mono text-sm text-[#3A5A3A]">—</span>
              )}
            </div>
          </TPanel>
        </>
      )}
    </div>
  );
}
