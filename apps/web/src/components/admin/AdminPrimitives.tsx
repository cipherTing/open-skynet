'use client';

import { Children, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export interface AdminPageMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function AdminTable({ headers, children }: { headers: string[]; children: ReactNode }) {
  const { t } = useTranslation();
  const hasRows = Children.count(children) > 0;
  return (
    <div className="overflow-x-auto border-t border-border-subtle">
      <table className="w-full min-w-[760px] border-collapse text-left">
        <thead>
          <tr className="border-b border-border-subtle">
            {headers.map((header, index) => (
              <th
                key={`${header}-${index}`}
                className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-ink-muted"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {hasRows ? (
            children
          ) : (
            <tr>
              <td colSpan={headers.length} className="px-3 py-12 text-center text-sm text-ink-muted">
                {t('admin.empty')}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function AdminPagination({
  meta,
  onPageChange,
}: {
  meta: AdminPageMeta;
  onPageChange: (page: number) => void;
}) {
  const { t } = useTranslation();
  const totalPages = Math.max(1, meta.totalPages);
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-4 text-xs text-ink-muted">
      <span>{t('admin.total', { count: meta.total })}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={t('admin.pagination.previous')}
          disabled={meta.page <= 1}
          onClick={() => onPageChange(meta.page - 1)}
          className="flex h-8 w-8 items-center justify-center rounded border border-border-subtle text-ink-secondary hover:border-border-accent hover:text-copper disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="min-w-20 text-center font-mono text-ink-secondary">
          {t('admin.pagination.page', { page: meta.page, totalPages })}
        </span>
        <button
          type="button"
          aria-label={t('admin.pagination.next')}
          disabled={meta.page >= totalPages}
          onClick={() => onPageChange(meta.page + 1)}
          className="flex h-8 w-8 items-center justify-center rounded border border-border-subtle text-ink-secondary hover:border-border-accent hover:text-copper disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function ActionButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded border border-border-subtle px-2 py-1 text-[11px] text-ink-secondary hover:border-border-accent hover:text-copper"
    >
      {children}
    </button>
  );
}

export function StatusText({ children, warning }: { children: ReactNode; warning: boolean }) {
  return (
    <span className={`text-xs font-medium ${warning ? 'text-ochre' : 'text-moss'}`}>
      {children}
    </span>
  );
}

export function AdminLoading() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-56 items-center justify-center text-xs text-ink-muted">
      {t('admin.loading')}
    </div>
  );
}

export function AdminError({ retry }: { retry: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-56 flex-col items-center justify-center gap-3 text-sm text-ochre">
      <span>{t('admin.action.failed')}</span>
      <button
        type="button"
        onClick={retry}
        className="rounded border border-ochre/30 px-3 py-1.5 text-xs"
      >
        {t('admin.retry')}
      </button>
    </div>
  );
}

export function formatAdminTime(value: string | null): string {
  return value ? new Date(value).toLocaleString() : '-';
}
