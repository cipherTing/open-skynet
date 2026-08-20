'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { CircleMaintenanceLogItem } from '@skynet/shared';
import { circleApi } from '@/lib/api';
import { circleKeys } from '@/lib/query-keys';
import { InlineLoading } from '@/components/ui/LoadingState';
import { TerminalDialog } from '@/components/ui/TerminalDialog';
import { ExactTime } from '@/components/ui/terminal';
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
      description={t('circles.coBuild.recordReason')}
      code="CIRCLE.MAINT"
      size="md"
    >
      <p className="font-sans text-[12px] font-medium tracking-normal text-[var(--t-faint)]">
        {t(`circles.coBuild.recordActions.${record.action}`)}
      </p>
      {query.isPending ? (
        <div className="py-10">
          <InlineLoading label={t('circles.coBuild.loading')} />
        </div>
      ) : null}
      {query.isError ? (
        <p className="mt-6 font-sans text-[13px] leading-5 text-[var(--t-hazard)]/80">
          {t('circles.coBuild.recordsFailed')}
        </p>
      ) : null}
      {detail ? (
        <div className="mt-5 space-y-5">
          <div className="grid gap-3 border-y border-[var(--t-noise)] py-4 text-xs sm:grid-cols-2">
            <div>
              <p className="font-sans text-[12px] font-medium tracking-normal text-[var(--t-faint)]">
                {t('circles.coBuild.recordTime')}
              </p>
              <ExactTime date={detail.createdAt} className="mt-1 block text-xs text-[var(--t-text)]" />
            </div>
            <div>
              <p className="font-sans text-[12px] font-medium tracking-normal text-[var(--t-faint)]">
                {t('circles.coBuild.recordReason')}
              </p>
              <p className="mt-1 leading-5 text-[var(--t-text)]/85">{detail.publicReason}</p>
            </div>
          </div>
          {detail.change.kind === 'TOPIC' ? (
            <TopicChangeDiff before={detail.change.previousTopic} after={detail.change.nextTopic} />
          ) : null}
          {detail.change.kind === 'RULES' ? (
            <RuleChangeDiff before={detail.change.previousRules} after={detail.change.nextRules} />
          ) : null}
          {detail.change.kind === 'STATUS' ? (
            <div className="flex items-center gap-2 border border-[var(--t-noise)] bg-black px-3 py-3 font-sans text-sm tracking-normal">
              <span className="text-[var(--t-sub)]">
                {detail.change.previousStatus
                  ? t(`circles.coBuild.statusValues.${detail.change.previousStatus}`)
                  : '—'}
              </span>
              <span className="text-[var(--t-accent)]">→</span>
              <span className="font-semibold text-[var(--t-text)]">
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
