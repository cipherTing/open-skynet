'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { adminApi, type AdminJsonValue } from '@/lib/admin-api';
import { AdminError, AdminLoading, formatAdminTime } from './AdminPrimitives';

function JsonValue({ value }: { value: AdminJsonValue }) {
  if (value === null) return <span className="text-ink-muted">—</span>;
  if (Array.isArray(value)) {
    return (
      <ol className="space-y-1">
        {value.map((item, index) => <li key={index}><JsonValue value={item} /></li>)}
      </ol>
    );
  }
  if (typeof value === 'object') {
    return (
      <dl className="space-y-2">
        {Object.entries(value).map(([key, item]) => (
          <div key={key} className="grid gap-1 sm:grid-cols-[140px_1fr]">
            <dt className="font-mono text-[11px] text-ink-muted">{key}</dt>
            <dd className="min-w-0 break-words text-xs text-ink-secondary"><JsonValue value={item} /></dd>
          </div>
        ))}
      </dl>
    );
  }
  return <span>{String(value)}</span>;
}

export function AdminAuditDetailDialog({ logId, onClose }: { logId: string | null; onClose: () => void }) {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: ['admin', 'audit', 'detail', logId],
    queryFn: () => adminApi.auditLogDetail(logId!),
    enabled: Boolean(logId),
  });
  const detail = query.data;
  return (
    <Dialog.Root open={Boolean(logId)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[190] bg-void/45 backdrop-blur-[2px]" />
        <Dialog.Content className="skynet-dialog-content fixed left-1/2 top-1/2 z-[200] max-h-[calc(100dvh-32px)] w-[min(calc(100vw-32px),720px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-md border border-border-default bg-void-deep p-5 shadow-2xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-base font-bold text-ink-primary">{t('admin.audit.detailTitle')}</Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-ink-muted">{t('admin.audit.detailDescription')}</Dialog.Description>
            </div>
            <Dialog.Close asChild><button type="button" aria-label={t('app.close')} className="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2"><X className="h-4 w-4" /></button></Dialog.Close>
          </div>
          {query.isPending ? (
            <div className="py-16"><AdminLoading /></div>
          ) : query.isError || !detail ? (
            <div className="py-10"><AdminError retry={() => void query.refetch()} /></div>
          ) : (
            <div className="mt-6 space-y-6">
              <dl className="grid gap-4 border-y border-border-subtle py-4 sm:grid-cols-2">
                <div><dt className="text-[10px] font-bold text-ink-muted">{t('admin.audit.actor')}</dt><dd className="mt-1 text-sm text-ink-primary">{detail.actor.label}</dd></div>
                <div><dt className="text-[10px] font-bold text-ink-muted">{t('admin.audit.time')}</dt><dd className="mt-1 text-sm text-ink-primary">{formatAdminTime(detail.createdAt)}</dd></div>
                <div><dt className="text-[10px] font-bold text-ink-muted">{t('admin.audit.action')}</dt><dd className="mt-1 text-sm text-ink-primary">{t(`admin.audit.actions.${detail.action}`, { defaultValue: detail.action })}</dd></div>
                <div><dt className="text-[10px] font-bold text-ink-muted">{t('admin.audit.target')}</dt><dd className="mt-1 text-sm text-ink-primary">{detail.target.label}</dd><dd className="mt-1 font-mono text-[10px] text-ink-muted">{detail.target.id}</dd></div>
              </dl>
              <section>
                <h3 className="text-sm font-bold text-ink-primary">{t('admin.audit.reason')}</h3>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink-secondary">{detail.reason ?? t('admin.audit.noReason')}</p>
              </section>
              <section>
                <h3 className="text-sm font-bold text-ink-primary">{t('admin.audit.changes')}</h3>
                <div className="mt-3 border-l-2 border-copper/45 pl-4"><JsonValue value={detail.changes} /></div>
              </section>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
