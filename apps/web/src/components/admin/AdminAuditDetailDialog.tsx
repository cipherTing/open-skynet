'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { adminApi, type AdminJsonValue } from '@/lib/admin-api';
import { TerminalDialog } from '@/components/ui/TerminalDialog';
import { AdminError, AdminLoading, formatAdminTime } from './AdminPrimitives';

function JsonValue({ value }: { value: AdminJsonValue }) {
  if (value === null) return <span className="text-[#3A5A3A]">—</span>;
  if (Array.isArray(value)) {
    return (
      <ol className="space-y-1">
        {value.map((item, index) => (
          <li key={index}>
            <JsonValue value={item} />
          </li>
        ))}
      </ol>
    );
  }
  if (typeof value === 'object') {
    return (
      <dl className="space-y-2">
        {Object.entries(value).map(([key, item]) => (
          <div key={key} className="grid gap-1 sm:grid-cols-[140px_1fr]">
            <dt className="font-mono text-[11px] text-[#3A5A3A]">{key}</dt>
            <dd className="min-w-0 break-words text-xs text-white/60">
              <JsonValue value={item} />
            </dd>
          </div>
        ))}
      </dl>
    );
  }
  return <span>{String(value)}</span>;
}

export function AdminAuditDetailDialog({
  logId,
  onClose,
}: {
  logId: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: ['admin', 'audit', 'detail', logId],
    queryFn: () => adminApi.auditLogDetail(logId!),
    enabled: Boolean(logId),
  });
  const detail = query.data;
  return (
    <TerminalDialog
      open={Boolean(logId)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t('adminDialogs.auditTitle')}
      code="ADMIN.AUDIT"
      size="lg"
      contentClassName="t-corner"
    >
      <p className="text-xs text-[#3A5A3A]">{t('admin.audit.detailDescription')}</p>
      <p aria-hidden className="mt-1 truncate font-mono text-[9px] uppercase tracking-[0.2em] text-[#1A2E1A]">
        FILE #AUDIT-{logId}
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
        <div className="mt-6 space-y-6">
          <dl className="grid gap-4 border-y border-[#1A2E1A] py-4 sm:grid-cols-2">
            <div>
              <dt className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#3A5A3A]">
                {t('admin.audit.actor')}
              </dt>
              <dd className="mt-1 text-sm text-[#EDF3ED]">{detail.actor.label}</dd>
            </div>
            <div>
              <dt className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#3A5A3A]">
                {t('admin.audit.time')}
              </dt>
              <dd className="mt-1 text-sm text-[#EDF3ED]">
                {formatAdminTime(detail.createdAt)}
              </dd>
            </div>
            <div>
              <dt className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#3A5A3A]">
                {t('admin.audit.action')}
              </dt>
              <dd className="mt-1 text-sm text-[#EDF3ED]">
                {t(`admin.audit.actions.${detail.action}`, { defaultValue: detail.action })}
              </dd>
            </div>
            <div>
              <dt className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#3A5A3A]">
                {t('admin.audit.target')}
              </dt>
              <dd className="mt-1 text-sm text-[#EDF3ED]">{detail.target.label}</dd>
              <dd className="mt-1 font-mono text-[10px] text-[#3A5A3A]">{detail.target.id}</dd>
            </div>
          </dl>
          <section>
            <h3 className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.15em] text-[#EDF3ED]">
              <span aria-hidden className="text-[#ADFF2F]">
                {'//'}
              </span>
              {t('admin.audit.reason')}
            </h3>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white/60">
              {detail.reason ?? t('admin.audit.noReason')}
            </p>
          </section>
          <section>
            <h3 className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.15em] text-[#EDF3ED]">
              <span aria-hidden className="text-[#ADFF2F]">
                {'//'}
              </span>
              {t('admin.audit.changes')}
            </h3>
            <div className="mt-3 border-l-2 border-[#ADFF2F]/45 pl-4">
              <JsonValue value={detail.changes} />
            </div>
          </section>
        </div>
      )}
    </TerminalDialog>
  );
}
