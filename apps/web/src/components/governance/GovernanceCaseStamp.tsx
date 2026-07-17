'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TButton } from '@/components/ui/terminal/TButton';
import { TTag } from '@/components/ui/terminal/TTag';
import { Timecode } from '@/components/ui/terminal/Timecode';
import { TerminalDialog } from '@/components/ui/TerminalDialog';
import { governanceApi } from '@/lib/api';

function statusTagColor(status: string): 'accent' | 'amber' | 'red' | 'default' {
  if (status === 'OPEN') return 'accent';
  if (status === 'EMERGENCY') return 'amber';
  if (status === 'RESOLVED_VIOLATION') return 'red';
  return 'default';
}

export function GovernanceCaseStamp({
  caseId,
  title,
  status,
}: {
  caseId: string;
  title?: string;
  status?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: ['governance', 'case-summary', caseId],
    queryFn: () => governanceApi.caseSummary(caseId),
    enabled: open,
  });
  const currentStatus = query.data?.status ?? status;

  return (
    <>
      {title ? (
        <button
          type="button"
          className="flex w-full items-start justify-between gap-3 py-1 text-left text-xs transition-colors hover:bg-surface-2"
          onClick={(event) => {
            event.stopPropagation();
            setOpen(true);
          }}
        >
          <span className="line-clamp-2 text-text-secondary">{title}</span>
          {currentStatus ? (
            <TTag color={statusTagColor(currentStatus)} className="shrink-0">
              {t(`governance.inReview.statuses.${currentStatus}`)}
            </TTag>
          ) : (
            <TTag color="amber" className="shrink-0">
              {t('governance.inReview.stamp')}
            </TTag>
          )}
        </button>
      ) : (
        <TButton
          variant="danger"
          size="sm"
          onClick={(event) => {
            event.stopPropagation();
            setOpen(true);
          }}
          className="absolute right-4 top-14 z-10"
        >
          {t('governance.inReview.stamp')}
        </TButton>
      )}

      {/* Portal 事件沿 React 树冒泡，需阻断外层卡片点击 */}
      <span onClick={(event) => event.stopPropagation()}>
        <TerminalDialog
          open={open}
          onOpenChange={setOpen}
          title={t('governance.inReview.title')}
          code="GOV.CASE"
          size="md"
        >
          <p className="text-xs leading-5 text-text-tertiary">
            {t('governance.inReview.description')}
          </p>
          {query.isPending ? (
            <p className="mt-6 text-sm text-text-tertiary">{t('governance.inReview.loading')}</p>
          ) : query.isError ? (
            <p className="mt-6 text-sm text-danger">{t('governance.inReview.loadFailed')}</p>
          ) : query.data ? (
            <div className="mt-5 space-y-4 border-t border-border-subtle pt-4">
              <div>
                <p className="text-sm font-semibold text-text-primary">
                  {query.data.targetSummary.title}
                </p>
                <p className="mt-1 text-sm leading-6 text-text-secondary">
                  {query.data.targetSummary.excerpt}
                </p>
              </div>
              <dl className="grid grid-cols-2 gap-x-5 gap-y-3 text-xs">
                <div>
                  <dt className="font-mono text-[11px] tracking-[0.12em] text-text-tertiary">
                    {t('governance.inReview.status')}
                  </dt>
                  <dd className="mt-1">
                    <TTag color={statusTagColor(query.data.status)}>
                      {t(`governance.inReview.statuses.${query.data.status}`)}
                    </TTag>
                  </dd>
                </div>
                <div>
                  <dt className="font-mono text-[11px] tracking-[0.12em] text-text-tertiary">
                    {t('governance.inReview.trigger')}
                  </dt>
                  <dd className="mt-1 font-mono tabular-nums text-text-secondary">
                    {query.data.triggerScore}/{query.data.triggerThreshold}
                  </dd>
                </div>
                <div>
                  <dt className="font-mono text-[11px] tracking-[0.12em] text-text-tertiary">
                    {t('governance.inReview.openedAt')}
                  </dt>
                  <dd className="mt-1">
                    <Timecode date={query.data.openedAt} withDate className="text-text-secondary" />
                  </dd>
                </div>
                <div>
                  <dt className="font-mono text-[11px] tracking-[0.12em] text-text-tertiary">
                    {t('governance.inReview.deadline')}
                  </dt>
                  <dd className="mt-1">
                    <Timecode date={query.data.deadlineAt} withDate className="text-[#ADFF2F]" />
                  </dd>
                </div>
              </dl>
            </div>
          ) : null}
        </TerminalDialog>
      </span>
    </>
  );
}
