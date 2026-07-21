'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Timecode } from '@/components/ui/terminal/Timecode';
import { TerminalDialog } from '@/components/ui/TerminalDialog';
import { governanceApi } from '@/lib/api';
import { GovernanceVerdictStamp, type GovernanceVerdictTone } from './GovernanceTerminal';

function statusStampTone(status: string): GovernanceVerdictTone {
  if (status === 'OPEN') return 'pending';
  if (status === 'EMERGENCY') return 'emergency';
  if (status === 'RESOLVED_VIOLATION') return 'violation';
  return 'notViolation';
}

/**
 * 「审理中」状态印章：直角双层边框章 + steps 盖印震动。
 * 对外契约不变：caseId 必传；title 存在时渲染为行内摘要按钮，否则渲染为右上角悬浮印章。
 */
export function GovernanceCaseStamp({
  caseId,
  title,
  status,
  onRequireAuth,
}: {
  caseId: string;
  title?: string;
  status?: string;
  onRequireAuth?: () => void;
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
          className="flex w-full items-start justify-between gap-3 py-1 text-left text-xs transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:bg-[var(--t-panel)]"
          onClick={(event) => {
            event.stopPropagation();
            if (onRequireAuth) {
              onRequireAuth();
              return;
            }
            setOpen(true);
          }}
        >
          <span className="line-clamp-2 text-[var(--t-sub)]">{title}</span>
          {currentStatus ? (
            <GovernanceVerdictStamp
              tone={statusStampTone(currentStatus)}
              label={t(`governance.inReview.statuses.${currentStatus}`)}
              animate={false}
              className="shrink-0"
            />
          ) : (
            <GovernanceVerdictStamp
              tone="pending"
              label={t('governance.inReview.stamp')}
              animate={false}
              className="shrink-0"
            />
          )}
        </button>
      ) : (
        <button
          type="button"
          aria-label={t('governance.inReview.stamp')}
          className="absolute right-4 top-14 z-10"
          onClick={(event) => {
            event.stopPropagation();
            if (onRequireAuth) {
              onRequireAuth();
              return;
            }
            setOpen(true);
          }}
        >
          <GovernanceVerdictStamp tone="pending" label={t('governance.inReview.stamp')} />
        </button>
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
          <p className="text-xs leading-5 text-[var(--t-sub)]">
            {t('governance.inReview.description')}
          </p>
          {query.isPending ? (
            <p className="mt-6 font-mono text-sm text-[var(--t-sub)]">
              {t('governance.inReview.loading')}
            </p>
          ) : query.isError ? (
            <p className="mt-6 font-mono text-sm text-[var(--t-hazard)]/80">
              {t('governance.inReview.loadFailed')}
            </p>
          ) : query.data ? (
            <div className="mt-5 border-t border-[var(--t-noise)] pt-4">
              <div>
                <p className="text-sm font-semibold text-white">{query.data.targetSummary.title}</p>
                <p className="mt-1 text-sm leading-6 text-[var(--t-sub)]">
                  {query.data.targetSummary.excerpt}
                </p>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-px border border-[var(--t-noise)] bg-[var(--t-noise)]">
                <div className="bg-black p-3">
                  <dt className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-faint)]">
                    {t('governance.inReview.status')}
                  </dt>
                  <dd className="mt-2">
                    <GovernanceVerdictStamp
                      tone={statusStampTone(query.data.status)}
                      label={t(`governance.inReview.statuses.${query.data.status}`)}
                      animate={false}
                    />
                  </dd>
                </div>
                <div className="bg-black p-3">
                  <dt className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-faint)]">
                    {t('governance.inReview.trigger')}
                  </dt>
                  <dd className="mt-2 font-mono text-sm font-bold tabular-nums text-white/85">
                    {query.data.triggerScore}/{query.data.triggerThreshold}
                  </dd>
                </div>
                <div className="bg-black p-3">
                  <dt className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-faint)]">
                    {t('governance.inReview.openedAt')}
                  </dt>
                  <dd className="mt-2">
                    <Timecode date={query.data.openedAt} withDate className="text-white/70" />
                  </dd>
                </div>
                <div className="bg-black p-3">
                  <dt className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-faint)]">
                    {t('governance.inReview.deadline')}
                  </dt>
                  <dd className="mt-2">
                    <Timecode
                      date={query.data.deadlineAt}
                      withDate
                      className="text-[var(--t-accent)]"
                    />
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
