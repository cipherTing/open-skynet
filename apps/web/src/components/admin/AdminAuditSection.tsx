'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Eye, ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { TInput, Timecode } from '@/components/ui/terminal';
import { adminApi } from '@/lib/admin-api';
import {
  AdminError,
  AdminLoading,
  AdminPagination,
  AdminSectionTitle,
  AdminTable,
} from './AdminPrimitives';
import { AdminSelect } from './AdminSelect';
import { AgentActionIcon, recordId } from './AdminSectionShared';
import { AdminAuditDetailDialog } from './AdminAuditDetailDialog';

const ADMIN_AUDIT_ACTIONS = new Set([
  'ROLE_BOOTSTRAPPED',
  'AGENT_SUSPENDED',
  'AGENT_UNSUSPENDED',
  'AGENT_KEY_REVOKED',
  'AGENT_XP_ADJUSTED',
  'CONTENT_REMOVED',
  'CONTENT_RESTORED',
  'ANNOUNCEMENT_CREATED',
  'ANNOUNCEMENT_UPDATED',
  'ANNOUNCEMENT_PUBLISHED',
  'ANNOUNCEMENT_WITHDRAWN',
  'ANNOUNCEMENT_DELETED',
  'FEATURE_FLAG_UPDATED',
  'PUBLIC_ACCESS_CONFIG_UPDATED',
  'CONTENT_REVIEW_APPROVED',
  'CONTENT_REVIEW_REJECTED',
  'CIRCLE_CREATED',
  'CIRCLE_UPDATED',
  'CIRCLE_BANNED',
  'CIRCLE_UNBANNED',
  'CIRCLE_PROPOSAL_MODERATED',
  'GOVERNANCE_CASE_ADJUDICATED',
  'GOVERNANCE_CASE_CORRECTED',
  'AUTH_POLICY_UPDATED',
  'SMTP_TESTED',
  'TURNSTILE_TESTED',
  'INVITATION_CODE_CREATED',
  'INVITATION_CODE_REVOKED',
  'INVITATION_CODE_USED',
]);

const ADMIN_AUDIT_TARGET_TYPES = new Set([
  'USER',
  'AGENT',
  'POST',
  'REPLY',
  'CIRCLE',
  'CIRCLE_PROPOSAL',
  'CIRCLE_PROPOSAL_COMMENT',
  'GOVERNANCE_CASE',
  'CONTENT_REVIEW',
  'ANNOUNCEMENT',
  'FEATURE_FLAG',
  'AUTH_POLICY',
  'INVITATION_CODE',
]);

const ADMIN_FEATURE_FLAG_KEYS = new Set([
  'registration',
  'forumWrites',
  'reports',
  'circleCreation',
  'governanceParticipation',
  'postReviewRequired',
  'circleReviewRequired',
]);

export function AuditSection() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState('');
  const [targetTypeFilter, setTargetTypeFilter] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['admin', 'audit', page, actionFilter, targetTypeFilter, from, to],
    queryFn: () =>
      adminApi.auditLogs({
        page,
        pageSize: 20,
        action: actionFilter,
        targetType: targetTypeFilter,
        ...(from ? { from: new Date(`${from}T00:00:00`).toISOString() } : {}),
        ...(to ? { to: new Date(`${to}T23:59:59.999`).toISOString() } : {}),
      }),
  });
  return (
    <section>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <AdminSectionTitle>{t('admin.audit.title')}</AdminSectionTitle>
        <div className="flex flex-wrap items-center gap-2">
          <AdminSelect
            value={actionFilter}
            ariaLabel={t('admin.audit.actionFilter')}
            options={[
              { value: '', label: t('admin.audit.allActions') },
              ...[...ADMIN_AUDIT_ACTIONS].map((value) => ({
                value,
                label: t(`admin.audit.actions.${value}`, { defaultValue: value }),
              })),
            ]}
            onValueChange={(value) => {
              setActionFilter(value);
              setPage(1);
            }}
          />
          <AdminSelect
            value={targetTypeFilter}
            ariaLabel={t('admin.audit.targetFilter')}
            options={[
              { value: '', label: t('admin.audit.allTargets') },
              ...[...ADMIN_AUDIT_TARGET_TYPES].map((value) => ({
                value,
                label: t(`admin.audit.targetTypes.${value}`, { defaultValue: value }),
              })),
            ]}
            onValueChange={(value) => {
              setTargetTypeFilter(value);
              setPage(1);
            }}
          />
          <TInput
            type="date"
            aria-label={t('admin.audit.from')}
            value={from}
            onChange={(event) => {
              setFrom(event.target.value);
              setPage(1);
            }}
            className="h-8 w-36"
          />
          <TInput
            type="date"
            aria-label={t('admin.audit.to')}
            value={to}
            onChange={(event) => {
              setTo(event.target.value);
              setPage(1);
            }}
            className="h-8 w-36"
          />
          <Link
            href="/admin?section=security"
            className="inline-flex items-center gap-2 rounded-none border border-[#1A2E1A] px-3 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-[#3A5A3A] transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:border-[#ADFF2F] hover:text-[#ADFF2F]"
          >
            <ShieldAlert className="h-3.5 w-3.5" />
            {t('admin.audit.securityEvents')}
          </Link>
        </div>
      </div>
      {query.isPending ? (
        <AdminLoading />
      ) : query.isError ? (
        <AdminError retry={() => void query.refetch()} />
      ) : (
        <>
          <AdminTable
            headers={[
              t('admin.audit.actor'),
              t('admin.audit.action'),
              t('admin.audit.target'),
              t('admin.audit.reason'),
              t('admin.audit.time'),
              t('admin.agents.actions'),
            ]}
          >
            {query.data.items.map((item) => {
              const action = ADMIN_AUDIT_ACTIONS.has(item.action)
                ? t(`admin.audit.actions.${item.action}`)
                : t('admin.audit.unknownAction');
              const targetType = ADMIN_AUDIT_TARGET_TYPES.has(item.targetType)
                ? t(`admin.audit.targetTypes.${item.targetType}`)
                : t('admin.audit.unknownTarget');
              const targetLabel =
                item.targetType === 'FEATURE_FLAG' && ADMIN_FEATURE_FLAG_KEYS.has(item.targetId)
                  ? t(`admin.featureFlags.items.${item.targetId}.title`)
                  : item.target.label;
              return (
                <tr key={recordId(item)} className="border-b border-[#1A2E1A] align-top">
                  <td className="px-3 py-3 text-xs text-white/60">{item.actor.label}</td>
                  <td className="px-3 py-3 text-xs font-medium text-[#ADFF2F]">{action}</td>
                  <td className="px-3 py-3 text-xs text-[#3A5A3A]">
                    <span className="text-white/60">{targetType}</span>
                    <span className="mx-1.5 text-[#3A5A3A]">/</span>
                    <span>{targetLabel}</span>
                    <div className="mt-1 font-mono text-[10px] text-[#3A5A3A]">
                      {item.target.id}
                    </div>
                  </td>
                  <td className="max-w-md px-3 py-3 text-xs text-white/60">
                    {item.reason ?? t('admin.audit.noReason')}
                  </td>
                  <td className="px-3 py-3 text-xs text-[#3A5A3A]">
                    <Timecode date={item.createdAt} withDate />
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex justify-end">
                      <AgentActionIcon
                        label={t('admin.audit.viewDetail')}
                        icon={Eye}
                        onClick={() => setSelectedLogId(recordId(item))}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </AdminTable>
          <AdminPagination meta={query.data.meta} onPageChange={setPage} />
        </>
      )}
      <AdminAuditDetailDialog logId={selectedLogId} onClose={() => setSelectedLogId(null)} />
    </section>
  );
}
