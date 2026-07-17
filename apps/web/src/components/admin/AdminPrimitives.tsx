'use client';

import { Children, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { TButton, TEmpty, TSkeleton, TTag } from '@/components/ui/terminal';

export interface AdminPageMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function AdminTable({
  headers,
  children,
  centeredColumns = [],
}: {
  headers: string[];
  children: ReactNode;
  centeredColumns?: number[];
}) {
  const { t } = useTranslation();
  const hasRows = Children.count(children) > 0;
  return (
    <div className="overflow-x-auto border-y border-[#1A2E1A]">
      <table className="w-full min-w-[760px] border-collapse text-left">
        <thead>
          <tr className="border-b border-[#1A2E1A] bg-[#040704]">
            {headers.map((header, index) => (
              <th
                key={`${header}-${index}`}
                className={`px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-[#3A5A3A] ${centeredColumns.includes(index) ? 'text-center' : ''}`}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody
          className={[
            '[&>tr]:transition-colors [&>tr]:duration-100 [&>tr]:[transition-timing-function:steps(2,end)]',
            '[&>tr:hover]:bg-[#040704]',
            '[&>tr:hover>td:first-child]:shadow-[inset_2px_0_0_0_#ADFF2F]',
          ].join(' ')}
        >
          {hasRows ? (
            children
          ) : (
            <tr>
              <td colSpan={headers.length} className="px-3 py-8">
                <TEmpty message={t('admin.empty')} />
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
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#1A2E1A] pt-4">
      <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#3A5A3A]">
        {t('admin.total', { count: meta.total })}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={t('admin.pagination.previous')}
          disabled={meta.page <= 1}
          onClick={() => onPageChange(meta.page - 1)}
          className="flex h-7 w-7 items-center justify-center rounded-none border border-[#1A2E1A] text-[#3A5A3A] transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:border-[#ADFF2F] hover:text-[#ADFF2F] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <span className="min-w-20 text-center font-mono text-[10px] tracking-[0.15em] text-white/60">
          {t('admin.pagination.page', { page: meta.page, totalPages })}
        </span>
        <button
          type="button"
          aria-label={t('admin.pagination.next')}
          disabled={meta.page >= totalPages}
          onClick={() => onPageChange(meta.page + 1)}
          className="flex h-7 w-7 items-center justify-center rounded-none border border-[#1A2E1A] text-[#3A5A3A] transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:border-[#ADFF2F] hover:text-[#ADFF2F] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export function ActionButton({
  children,
  onClick,
  variant = 'secondary',
}: {
  children: ReactNode;
  onClick: () => void;
  variant?: 'secondary' | 'danger';
}) {
  return (
    <TButton type="button" size="sm" variant={variant} onClick={onClick}>
      {children}
    </TButton>
  );
}

export function StatusText({ children, warning }: { children: ReactNode; warning: boolean }) {
  return <TTag color={warning ? 'amber' : 'accent'}>{children}</TTag>;
}

export function AdminLoading() {
  return (
    <div className="flex min-h-56 flex-col justify-center px-2">
      <TSkeleton rows={5} />
    </div>
  );
}

export function AdminError({ retry }: { retry: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-56 flex-col items-center justify-center gap-4 border border-dashed border-[#7F1D1D] px-6 py-10">
      <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#EF4444]/80">
        {t('admin.action.failed')}
      </span>
      <TButton type="button" size="sm" variant="secondary" onClick={retry}>
        {t('admin.retry')}
      </TButton>
    </div>
  );
}

export function formatAdminTime(value: string | null): string {
  return value ? new Date(value).toLocaleString() : '-';
}
