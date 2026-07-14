'use client';

import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { CircleMaintenanceLogItem } from '@skynet/shared';
import { circleApi } from '@/lib/api';
import { circleKeys } from '@/lib/query-keys';
import { InlineLoading } from '@/components/ui/LoadingState';
import { RuleChangeDiff, TopicChangeDiff } from './CircleChangeDiff';

export function CircleMaintenanceRecordDialog({ circleId, record, onClose }: { circleId: string; record: CircleMaintenanceLogItem; onClose: () => void }) {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: [...circleKeys.maintenanceLogs(circleId), 'detail', record.id],
    queryFn: () => circleApi.maintenanceLog(circleId, record.id),
  });
  const detail = query.data;

  return (
    <div className="fixed inset-0 z-[190] flex items-center justify-center bg-void/45 p-4 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-label={t('circles.coBuild.recordDetail')} onClick={onClose}>
      <div className="skynet-dialog-content max-h-[calc(100dvh-32px)] w-full max-w-2xl overflow-y-auto rounded-md border border-border-default bg-void-deep p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-[11px] font-bold uppercase tracking-deck-normal text-copper">{t('circles.coBuild.records')}</p><h2 className="mt-1 text-base font-bold text-ink-primary">{t(`circles.coBuild.recordActions.${record.action}`)}</h2></div>
          <button type="button" aria-label={t('app.close')} onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2"><X className="h-4 w-4" /></button>
        </div>
        {query.isPending ? <div className="py-10"><InlineLoading label={t('circles.coBuild.loading')} /></div> : null}
        {query.isError ? <p className="mt-6 text-sm text-ochre">{t('circles.coBuild.recordsFailed')}</p> : null}
        {detail ? <div className="mt-6 space-y-5"><div className="grid gap-3 border-y border-border-subtle py-4 text-xs sm:grid-cols-2"><div><p className="text-ink-muted">{t('circles.coBuild.recordTime')}</p><p className="mt-1 text-ink-primary">{formatDate(detail.createdAt)}</p></div><div><p className="text-ink-muted">{t('circles.coBuild.recordReason')}</p><p className="mt-1 leading-5 text-ink-primary">{detail.publicReason}</p></div></div>{detail.change.kind === 'TOPIC' ? <TopicChangeDiff before={detail.change.previousTopic} after={detail.change.nextTopic} /> : null}{detail.change.kind === 'RULES' ? <RuleChangeDiff before={detail.change.previousRules} after={detail.change.nextRules} /> : null}{detail.change.kind === 'STATUS' ? <div className="flex items-center gap-2 rounded-md border border-border-subtle bg-void/30 px-3 py-3 text-sm"><span className="text-ink-muted">{detail.change.previousStatus ? t(`circles.coBuild.statusValues.${detail.change.previousStatus}`) : '—'}</span><span className="text-copper">→</span><span className="font-semibold text-ink-primary">{detail.change.nextStatus ? t(`circles.coBuild.statusValues.${detail.change.nextStatus}`) : '—'}</span></div> : null}</div> : null}
      </div>
    </div>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
