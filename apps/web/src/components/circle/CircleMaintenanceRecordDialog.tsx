'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { CircleMaintenanceLogItem } from '@skynet/shared';
import { circleApi } from '@/lib/api';
import { circleKeys } from '@/lib/query-keys';
import { InlineLoading } from '@/components/ui/LoadingState';
import { TerminalDialog } from '@/components/ui/TerminalDialog';
import { RuleChangeDiff, TopicChangeDiff } from './CircleChangeDiff';

export function CircleMaintenanceRecordDialog({
  circleId,
  record,
  onClose,
}: {
  circleId: string;
  record: CircleMaintenanceLogItem;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: [...circleKeys.maintenanceLogs(circleId), 'detail', record.id],
    queryFn: () => circleApi.maintenanceLog(circleId, record.id),
  });
  const detail = query.data;

  return (
    <TerminalDialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={t('circles.coBuild.recordDetail')}
      code="CIRCLE.MAINT"
      size="md"
    >
      <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#3A5A3A]">
        {t(`circles.coBuild.recordActions.${record.action}`)}
      </p>
      {query.isPending ? (
        <div className="py-10">
          <InlineLoading label={t('circles.coBuild.loading')} />
        </div>
      ) : null}
      {query.isError ? (
        <p className="mt-6 font-mono text-sm text-[#EF4444]/80">{t('circles.coBuild.recordsFailed')}</p>
      ) : null}
      {detail ? (
        <div className="mt-5 space-y-5">
          <div className="grid gap-3 border-y border-[#1A2E1A] py-4 text-xs sm:grid-cols-2">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#3A5A3A]">
                {t('circles.coBuild.recordTime')}
              </p>
              <p className="mt-1 font-mono text-xs tabular-nums text-[#EDF3ED]">
                {formatDate(detail.createdAt)}
              </p>
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#3A5A3A]">
                {t('circles.coBuild.recordReason')}
              </p>
              <p className="mt-1 leading-5 text-[#EDF3ED]/85">{detail.publicReason}</p>
            </div>
          </div>
          {detail.change.kind === 'TOPIC' ? (
            <TopicChangeDiff before={detail.change.previousTopic} after={detail.change.nextTopic} />
          ) : null}
          {detail.change.kind === 'RULES' ? (
            <RuleChangeDiff before={detail.change.previousRules} after={detail.change.nextRules} />
          ) : null}
          {detail.change.kind === 'STATUS' ? (
            <div className="flex items-center gap-2 border border-[#1A2E1A] bg-black px-3 py-3 font-mono text-sm">
              <span className="text-[#3A5A3A]">
                {detail.change.previousStatus
                  ? t(`circles.coBuild.statusValues.${detail.change.previousStatus}`)
                  : '—'}
              </span>
              <span className="text-[#ADFF2F]">→</span>
              <span className="font-semibold text-[#EDF3ED]">
                {detail.change.nextStatus
                  ? t(`circles.coBuild.statusValues.${detail.change.nextStatus}`)
                  : '—'}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}
    </TerminalDialog>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}
