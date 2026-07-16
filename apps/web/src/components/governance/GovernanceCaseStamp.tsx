'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useQuery } from '@tanstack/react-query';
import { Scale, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { governanceApi } from '@/lib/api';

function formatCaseTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
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
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        {title ? (
          <button
            type="button"
            className="flex w-full items-start justify-between gap-3 rounded py-1 text-left text-xs transition-colors hover:bg-rose-500/5"
            onClick={(event) => event.stopPropagation()}
          >
            <span className="line-clamp-2 text-ink-secondary">{title}</span>
            <span className="shrink-0 text-rose-500">
              {currentStatus
                ? t(`governance.inReview.statuses.${currentStatus}`)
                : t('governance.inReview.stamp')}
            </span>
          </button>
        ) : (
          <button
            type="button"
            onClick={(event) => event.stopPropagation()}
            className="absolute right-4 top-14 z-10 rotate-[-8deg] border-2 border-rose-600/75 px-2.5 py-1 font-mono text-[11px] font-black tracking-deck-normal text-rose-600 shadow-[inset_0_0_0_1px_rgba(225,29,72,0.2)] transition-transform hover:rotate-[-4deg] dark:border-rose-400/80 dark:text-rose-300"
          >
            {t('governance.inReview.stamp')}
          </button>
        )}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[190] bg-void/45 backdrop-blur-[2px]" />
        <Dialog.Content
          onClick={(event) => event.stopPropagation()}
          className="skynet-dialog-content fixed left-1/2 top-1/2 z-[200] w-[min(calc(100vw-32px),560px)] -translate-x-1/2 -translate-y-1/2 rounded-md border border-border-default bg-void-deep p-5 shadow-2xl"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="flex items-center gap-2 text-base font-bold text-ink-primary">
                <Scale className="h-4 w-4 text-rose-500" />
                {t('governance.inReview.title')}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-xs leading-5 text-ink-muted">
                {t('governance.inReview.description')}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label={t('app.close')}
                className="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2 hover:text-ink-primary"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>
          {query.isPending ? (
            <p className="mt-6 text-sm text-ink-muted">{t('governance.inReview.loading')}</p>
          ) : query.isError ? (
            <p className="mt-6 text-sm text-ochre">{t('governance.inReview.loadFailed')}</p>
          ) : query.data ? (
            <div className="mt-5 space-y-4 border-t border-border-subtle pt-4">
              <div>
                <p className="text-sm font-bold text-ink-primary">
                  {query.data.targetSummary.title}
                </p>
                <p className="mt-1 text-sm leading-6 text-ink-secondary">
                  {query.data.targetSummary.excerpt}
                </p>
              </div>
              <dl className="grid grid-cols-2 gap-x-5 gap-y-3 text-xs">
                <div>
                  <dt className="text-ink-muted">{t('governance.inReview.status')}</dt>
                  <dd className="mt-1 font-medium text-rose-500">
                    {t(`governance.inReview.statuses.${query.data.status}`)}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-muted">{t('governance.inReview.trigger')}</dt>
                  <dd className="mt-1 font-mono text-ink-secondary">
                    {query.data.triggerScore}/{query.data.triggerThreshold}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-muted">{t('governance.inReview.openedAt')}</dt>
                  <dd className="mt-1 text-ink-secondary">{formatCaseTime(query.data.openedAt)}</dd>
                </div>
                <div>
                  <dt className="text-ink-muted">{t('governance.inReview.deadline')}</dt>
                  <dd className="mt-1 text-ink-secondary">
                    {formatCaseTime(query.data.deadlineAt)}
                  </dd>
                </div>
              </dl>
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
