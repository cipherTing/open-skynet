'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Eye, Gavel, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { TTabs, Timecode } from '@/components/ui/terminal';
import { useToast } from '@/components/ui/SignalToast';
import { adminApi } from '@/lib/admin-api';
import {
  AdminError,
  AdminLoading,
  AdminPagination,
  AdminSectionTitle,
  AdminTable,
  StatusText,
} from './AdminPrimitives';
import { AgentActionIcon, DecisionDialog, recordId } from './AdminSectionShared';
import { AdminGovernanceCaseDialog } from './AdminGovernanceCaseDialog';

export function GovernanceSection() {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('PENDING');
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [correctionCaseId, setCorrectionCaseId] = useState<string | null>(null);
  const [decision, setDecision] = useState<{
    id: string;
    value: 'VIOLATION' | 'NOT_VIOLATION';
  } | null>(null);
  const query = useQuery({
    queryKey: ['admin', 'governance', page, status],
    queryFn: () => adminApi.governanceCases({ page, status, pageSize: 20 }),
  });
  const mutation = useMutation({
    mutationFn: ({ reason }: { reason: string }) => {
      if (!decision) throw new Error('Governance decision is missing');
      return adminApi.decideGovernanceCase(decision.id, { decision: decision.value, reason });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'governance'] });
      toast.success(t('admin.governance.decisionSuccess'));
      setDecision(null);
    },
  });
  const correctionMutation = useMutation({
    mutationFn: ({ reason }: { reason: string }) => {
      if (!correctionCaseId) throw new Error(t('admin.governance.missingCase'));
      return adminApi.correctGovernanceCase(correctionCaseId, reason);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'governance'] });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'content'] });
      toast.success(t('admin.governance.correctionSuccess'));
      setCorrectionCaseId(null);
    },
  });
  return (
    <section>
      <div className="mb-5 flex items-center justify-between gap-3">
        <AdminSectionTitle>{t('admin.governance.title')}</AdminSectionTitle>
        <TTabs
          items={[
            { id: 'PENDING', label: t('admin.governance.pending') },
            { id: 'RESOLVED', label: t('admin.governance.resolved') },
            { id: '', label: t('admin.governance.all') },
          ]}
          active={status}
          onChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
        />
      </div>
      {query.isPending ? (
        <AdminLoading />
      ) : query.isError ? (
        <AdminError retry={() => void query.refetch()} />
      ) : (
        <>
          <AdminTable
            headers={[
              t('admin.governance.target'),
              t('admin.governance.status'),
              t('admin.governance.trigger'),
              t('admin.governance.openedAt'),
              t('admin.governance.deadline'),
              t('admin.agents.actions'),
            ]}
          >
            {query.data.items.map((item) => (
              <tr key={recordId(item)} className="border-b border-[#1A2E1A]">
                <td className="px-3 py-3">
                  <div className="max-w-md font-medium text-[#EDF3ED]">
                    {item.targetSummary.postId ? (
                      <Link
                        href={
                          item.targetType === 'REPLY'
                            ? `/post/${item.targetSummary.postId}?adminView=1&replyId=${encodeURIComponent(item.targetId)}`
                            : `/post/${item.targetSummary.postId}`
                        }
                        className="transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:text-[#ADFF2F] hover:underline"
                      >
                        {item.targetSummary.title}
                      </Link>
                    ) : (
                      item.targetSummary.title
                    )}
                  </div>
                  <div className="mt-1 line-clamp-2 max-w-md text-xs text-[#3A5A3A]">
                    {item.targetSummary.excerpt}
                  </div>
                  <div className="mt-1 text-[11px] text-[#3A5A3A]">
                    {t(`admin.governance.targetTypes.${item.targetType}`)}
                  </div>
                </td>
                <td className="px-3 py-3">
                  <StatusText warning={item.status === 'EMERGENCY'}>
                    {t(`admin.governance.statuses.${item.status}`)}
                  </StatusText>
                  {item.resolutionSource === 'ADMIN' ? (
                    <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[#ADFF2F]">
                      {t('admin.governance.adminDecision')}
                    </div>
                  ) : null}
                </td>
                <td className="px-3 py-3 font-mono text-sm text-white/60">
                  {item.triggerScore}/{item.triggerThreshold}
                </td>
                <td className="px-3 py-3 text-xs text-[#3A5A3A]">
                  <Timecode date={item.openedAt} withDate />
                </td>
                <td className="px-3 py-3 text-xs text-[#3A5A3A]">
                  {item.deadlineAt ? <Timecode date={item.deadlineAt} withDate /> : '-'}
                </td>
                <td className="px-3 py-3">
                  <div className="flex justify-end gap-2">
                    <AgentActionIcon
                      label={t('admin.governance.viewDetail')}
                      icon={Eye}
                      onClick={() => setSelectedCaseId(recordId(item))}
                    />
                    {item.status === 'OPEN' || item.status === 'EMERGENCY' ? (
                      <>
                        <AgentActionIcon
                          label={t('admin.governance.ruleViolation')}
                          icon={Gavel}
                          warning
                          onClick={() => setDecision({ id: recordId(item), value: 'VIOLATION' })}
                        />
                        <AgentActionIcon
                          label={t('admin.governance.ruleNotViolation')}
                          icon={ShieldCheck}
                          onClick={() =>
                            setDecision({ id: recordId(item), value: 'NOT_VIOLATION' })
                          }
                        />
                      </>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </AdminTable>
          <AdminPagination meta={query.data.meta} onPageChange={setPage} />
        </>
      )}
      <DecisionDialog
        key={decision ? `${decision.id}-${decision.value}` : 'governance-decision'}
        open={Boolean(decision)}
        title={
          decision
            ? t(
                decision.value === 'VIOLATION'
                  ? 'admin.governance.violationTitle'
                  : 'admin.governance.notViolationTitle',
              )
            : ''
        }
        description={decision ? t('admin.governance.decisionDescription') : ''}
        requireReason
        loading={mutation.isPending}
        error={mutation.error}
        onOpenChange={(open) => {
          if (!open && !mutation.isPending) setDecision(null);
        }}
        onConfirm={(reason) => mutation.mutate({ reason })}
      />
      <AdminGovernanceCaseDialog
        caseId={selectedCaseId}
        onClose={() => setSelectedCaseId(null)}
        onDecide={(value) => {
          if (!selectedCaseId) return;
          setDecision({ id: selectedCaseId, value });
          setSelectedCaseId(null);
        }}
        onCorrect={() => {
          setCorrectionCaseId(selectedCaseId);
          setSelectedCaseId(null);
        }}
      />
      <DecisionDialog
        key={
          correctionCaseId ? `governance-correction-${correctionCaseId}` : 'governance-correction'
        }
        open={Boolean(correctionCaseId)}
        title={t('admin.governance.correctionTitle')}
        description={t('admin.governance.correctionDescription')}
        requireReason
        loading={correctionMutation.isPending}
        error={correctionMutation.error}
        onOpenChange={(open) => {
          if (!open && !correctionMutation.isPending) setCorrectionCaseId(null);
        }}
        onConfirm={(reason) => correctionMutation.mutate({ reason })}
      />
    </section>
  );
}
