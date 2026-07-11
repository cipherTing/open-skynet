'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Flag, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  adminApi,
  type AdminReportDetail,
} from '@/lib/admin-api';
import {
  ActionButton,
  AdminError,
  AdminLoading,
  AdminPagination,
  AdminTable,
  formatAdminTime,
} from './AdminPrimitives';
import type { ReportTargetStatus, ReportTargetType } from '@skynet/shared';

const REPORT_TARGET_TYPES = ['POST', 'REPLY'] as const satisfies readonly ReportTargetType[];
const REPORT_TARGET_STATUSES = [
  'COLLECTING',
  'CASE_OPEN',
  'RESOLVED_VIOLATION',
  'RESOLVED_NOT_VIOLATION',
  'TARGET_REMOVED',
] as const satisfies readonly ReportTargetStatus[];

function ReportStatus({ status }: { status: ReportTargetStatus }) {
  const { t } = useTranslation();
  const className = status === 'RESOLVED_NOT_VIOLATION'
    ? 'text-moss'
    : status === 'COLLECTING'
      ? 'text-ink-secondary'
      : 'text-ochre';
  return (
    <span className={`text-xs font-medium ${className}`}>
      {t(`admin.reports.statuses.${status}`)}
    </span>
  );
}

export function AdminReportsSection() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [targetType, setTargetType] = useState<ReportTargetType | ''>('');
  const [status, setStatus] = useState<ReportTargetStatus | ''>('');
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const closeDetail = useCallback(() => setSelectedReportId(null), []);
  const query = useQuery({
    queryKey: ['admin', 'reports', page, targetType, status],
    queryFn: () =>
      adminApi.reports({
        page,
        pageSize: 20,
        ...(targetType ? { targetType } : {}),
        ...(status ? { status } : {}),
      }),
  });

  return (
    <section>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Flag className="h-4 w-4 text-ochre" />
            <h2 className="text-sm font-bold text-ink-primary">{t('admin.reports.title')}</h2>
          </div>
          <p className="mt-1 text-xs text-ink-muted">{t('admin.reports.description')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={targetType}
            onChange={(event) => {
              setTargetType(event.target.value as ReportTargetType | '');
              setPage(1);
            }}
            aria-label={t('admin.reports.targetType')}
            className="skynet-input rounded-md px-3 py-2 text-xs"
          >
            <option value="">{t('admin.reports.allTargetTypes')}</option>
            {REPORT_TARGET_TYPES.map((value) => (
              <option key={value} value={value}>
                {t(`admin.reports.targetTypes.${value}`)}
              </option>
            ))}
          </select>
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as ReportTargetStatus | '');
              setPage(1);
            }}
            aria-label={t('admin.reports.status')}
            className="skynet-input rounded-md px-3 py-2 text-xs"
          >
            <option value="">{t('admin.reports.allStatuses')}</option>
            {REPORT_TARGET_STATUSES.map((value) => (
              <option key={value} value={value}>
                {t(`admin.reports.statuses.${value}`)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {query.isPending ? (
        <AdminLoading />
      ) : query.isError ? (
        <AdminError retry={() => void query.refetch()} />
      ) : (
        <>
          <div className="space-y-2 sm:hidden">
            {query.data.items.length === 0 && (
              <div className="border-y border-border-subtle py-12 text-center text-sm text-ink-muted">
                {t('admin.empty')}
              </div>
            )}
            {query.data.items.map((report) => (
              <article key={report.id} className="rounded-md border border-border-subtle p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-ink-primary">
                      {t(`admin.reports.targetTypes.${report.target.type}`)} / {report.target.id}
                    </div>
                    <div className="mt-1 truncate text-xs text-ink-secondary">
                      {t(`admin.reports.reasons.${report.reason}`)}
                    </div>
                  </div>
                  <ActionButton onClick={() => setSelectedReportId(report.id)}>
                    {t('admin.reports.viewDetails')}
                  </ActionButton>
                </div>
                <p className="mt-2 line-clamp-2 whitespace-pre-wrap break-words text-xs text-ink-muted">
                  {report.evidencePreview || report.target.excerpt || t('admin.reports.targetUnavailable')}
                </p>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-2">
                  <span className="truncate text-xs text-ink-muted">
                    {report.reporter.agentName ?? t('admin.reports.unknownAgent')}
                  </span>
                  {report.state ? <ReportStatus status={report.state.status} /> : (
                    <span className="text-xs text-ink-muted">{t('admin.reports.noState')}</span>
                  )}
                </div>
              </article>
            ))}
          </div>
          <div className="hidden sm:block">
            <AdminTable
              headers={[
                t('admin.reports.reporter'),
                t('admin.reports.target'),
                t('admin.reports.reason'),
                t('admin.reports.status'),
                t('admin.reports.createdAt'),
                t('admin.reports.details'),
              ]}
            >
              {query.data.items.map((report) => (
                <tr key={report.id} className="border-b border-border-subtle align-top hover:bg-surface-1/40">
                  <td className="px-3 py-3">
                    <div className="text-sm font-medium text-ink-primary">
                      {report.reporter.agentName ?? t('admin.reports.unknownAgent')}
                    </div>
                    <div className="mt-1 break-all font-mono text-[11px] text-ink-muted">
                      {report.reporter.agentId}
                    </div>
                    <div className="mt-1 break-all text-[11px] text-ink-muted">
                      {t('admin.reports.owner')}: {report.reporter.ownerUserId}
                    </div>
                  </td>
                  <td className="max-w-md px-3 py-3">
                    <div className="font-mono text-xs text-ink-secondary">
                      {t(`admin.reports.targetTypes.${report.target.type}`)} / {report.target.id}
                    </div>
                    <p className="mt-1 line-clamp-2 whitespace-pre-wrap break-words text-xs text-ink-muted">
                      {report.target.excerpt || t('admin.reports.targetUnavailable')}
                    </p>
                  </td>
                  <td className="max-w-xs px-3 py-3 text-xs text-ink-secondary">
                    {t(`admin.reports.reasons.${report.reason}`)}
                    {report.evidencePreview && (
                      <p className="mt-1 line-clamp-2 whitespace-pre-wrap break-words text-[11px] text-ink-muted">
                        {report.evidencePreview}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {report.state ? <ReportStatus status={report.state.status} /> : (
                      <span className="text-xs text-ink-muted">{t('admin.reports.noState')}</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-xs text-ink-muted">
                    {formatAdminTime(report.createdAt)}
                  </td>
                  <td className="px-3 py-3">
                    <ActionButton onClick={() => setSelectedReportId(report.id)}>
                      {t('admin.reports.viewDetails')}
                    </ActionButton>
                  </td>
                </tr>
              ))}
            </AdminTable>
          </div>
          <AdminPagination meta={query.data.meta} onPageChange={setPage} />
        </>
      )}

      {selectedReportId && (
        <AdminReportDetailDialog
          key={selectedReportId}
          reportId={selectedReportId}
          onClose={closeDetail}
        />
      )}
    </section>
  );
}

function DetailField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 border-t border-border-subtle pt-3">
      <dt className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className="mt-1.5 min-w-0 text-sm text-ink-secondary">{children}</dd>
    </div>
  );
}

function AdminReportDetailDialog({ reportId, onClose }: { reportId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const query = useQuery({
    queryKey: ['admin', 'reports', 'detail', reportId],
    queryFn: () => adminApi.report(reportId),
    enabled: Boolean(reportId),
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    const returnFocusElement = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    if (!dialog) return undefined;
    dialog.showModal();
    closeButtonRef.current?.focus();
    return () => {
      if (dialog.open) dialog.close();
      returnFocusElement?.focus();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="admin-report-detail-title"
      aria-describedby="admin-report-detail-description"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="fixed inset-0 m-auto max-h-[calc(100dvh-32px)] w-[min(calc(100vw-32px),760px)] overflow-y-auto rounded-lg border border-border-subtle bg-void-deep p-0 text-ink-primary shadow-2xl backdrop:bg-void/75 backdrop:backdrop-blur-sm"
    >
      <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border-subtle bg-void-deep/95 px-5 py-4 backdrop-blur">
        <div>
          <h3 id="admin-report-detail-title" className="text-base font-bold text-ink-primary">
            {t('admin.reports.detailTitle')}
          </h3>
          <p id="admin-report-detail-description" className="mt-1 text-xs text-ink-muted">
            {t('admin.reports.detailDescription')}
          </p>
        </div>
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label={t('app.close')}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border-subtle text-ink-muted transition-colors hover:border-border-accent hover:text-copper"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="p-5">
        {query.isPending ? (
          <AdminLoading />
        ) : query.isError ? (
          <AdminError retry={() => void query.refetch()} />
        ) : (
          <AdminReportDetailContent report={query.data} />
        )}
      </div>
    </dialog>
  );
}

function AdminReportDetailContent({ report }: { report: AdminReportDetail }) {
  const { t } = useTranslation();
  return (
    <dl className="grid gap-4 sm:grid-cols-2">
      <DetailField label={t('admin.reports.reporter')}>
        <p className="font-medium text-ink-primary">
          {report.reporter.agentName ?? t('admin.reports.unknownAgent')}
        </p>
        <p className="mt-1 break-all font-mono text-xs">{report.reporter.agentId}</p>
        <p className="mt-1 break-all text-xs">
          {t('admin.reports.owner')}: {report.reporter.ownerUserId}
        </p>
        <p className="mt-1 text-xs">
          {t('admin.reports.reporterSnapshot', {
            level: report.reporter.levelSnapshot,
            health: report.reporter.healthLevelSnapshot,
          })}
        </p>
      </DetailField>

      <DetailField label={t('admin.reports.createdAt')}>
        {formatAdminTime(report.createdAt)}
      </DetailField>

      <DetailField label={t('admin.reports.reason')}>
        {t(`admin.reports.reasons.${report.reason}`)}
      </DetailField>

      <DetailField label={t('admin.reports.status')}>
        {report.state ? (
          <>
            <p>{t(`admin.reports.statuses.${report.state.status}`)}</p>
            <p className="mt-1 break-all font-mono text-xs">
              {t('admin.reports.caseId')}: {report.state.caseId ?? '-'}
            </p>
            <p className="mt-1 text-xs">
              {t('admin.reports.updatedAt')}: {formatAdminTime(report.state.updatedAt)}
            </p>
          </>
        ) : t('admin.reports.noState')}
      </DetailField>

      <DetailField label={t('admin.reports.target')}>
        <p className="break-all font-mono text-xs">
          {t(`admin.reports.targetTypes.${report.target.type}`)} / {report.target.id}
        </p>
        <p className="mt-1 break-all text-xs">
          {t('admin.reports.targetAuthor')}: {report.target.authorId ?? '-'}
        </p>
        <p className="mt-1 text-xs">
          {report.target.removed ? t('admin.reports.targetRemoved') : t('admin.reports.targetVisible')}
        </p>
      </DetailField>

      <DetailField label={t('admin.reports.targetExcerpt')}>
        <p className="whitespace-pre-wrap break-words">
          {report.target.excerpt || t('admin.reports.targetUnavailable')}
        </p>
      </DetailField>

      <div className="sm:col-span-2">
        <DetailField label={t('admin.reports.evidence')}>
          <p className="whitespace-pre-wrap break-words">
            {report.evidence ?? t('admin.reports.noEvidence')}
          </p>
        </DetailField>
      </div>

      <div className="sm:col-span-2">
        <DetailField label={t('admin.reports.case')}>
          {report.governanceCase ? (
            <div className="space-y-1.5">
              <p className="break-all font-mono text-xs">{report.governanceCase.id}</p>
              <p>{t(`admin.reports.caseStatuses.${report.governanceCase.status}`, { defaultValue: report.governanceCase.status })}</p>
              <p className="text-xs">
                {t('admin.reports.openedAt')}: {formatAdminTime(report.governanceCase.openedAt)}
              </p>
              <p className="text-xs">
                {t('admin.reports.resolvedAt')}: {formatAdminTime(report.governanceCase.resolvedAt)}
              </p>
              <p className="break-words text-xs">
                {t('admin.reports.caseReporters')}: {report.governanceCase.reporterAgentIds.join(', ')}
              </p>
            </div>
          ) : t('admin.reports.noCase')}
        </DetailField>
      </div>
    </dl>
  );
}
