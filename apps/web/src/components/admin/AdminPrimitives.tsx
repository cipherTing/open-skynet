'use client';

import { Children, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { TButton, TEmpty, TSkeleton, TTag } from '@/components/ui/terminal';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export interface AdminPageMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const ADMIN_FILTER_ALL_VALUE = '__all__';

/** 分区标题：// 章节标记 + 中文可读标题，控制台内统一使用。 */
export function AdminSectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 font-sans text-[12px] font-semibold tracking-normal text-[var(--t-text)]">
      <span aria-hidden className="text-[var(--t-accent)]">
        {'//'}
      </span>
      {children}
    </h2>
  );
}

export function AdminToggleFilter({
  value,
  options,
  ariaLabel,
  onValueChange,
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  ariaLabel: string;
  onValueChange: (value: string) => void;
}) {
  return (
    <ToggleGroup
      type="single"
      value={value || ADMIN_FILTER_ALL_VALUE}
      onValueChange={(nextValue) => {
        const normalizedValue = nextValue === ADMIN_FILTER_ALL_VALUE ? '' : nextValue;
        if (options.some((option) => option.value === normalizedValue)) {
          onValueChange(normalizedValue);
        }
      }}
      aria-label={ariaLabel}
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={option.value || ADMIN_FILTER_ALL_VALUE}
          value={option.value || ADMIN_FILTER_ALL_VALUE}
        >
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
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
    <div className="border-y border-[var(--t-noise)]">
      <Table className="min-w-[760px] [font-variant-numeric:tabular-nums]">
        <TableHeader>
          <TableRow className="border-b border-[var(--t-noise)] bg-[var(--t-panel)] hover:bg-[var(--t-panel)]">
            {headers.map((header, index) => (
              <TableHead
                key={`${header}-${index}`}
                className={`px-3 py-2 font-sans text-[12px] font-semibold tracking-normal text-[var(--t-faint)] ${centeredColumns.includes(index) ? 'text-center' : ''}`}
              >
                {header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody
          className={[
            '[&>tr]:h-11',
            '[&>tr]:transition-colors [&>tr]:duration-100 [&>tr]:[transition-timing-function:steps(2,end)]',
            '[&>tr:hover]:bg-[var(--t-panel)]',
            '[&>tr:hover>td:first-child]:shadow-[inset_2px_0_0_0_var(--t-accent)]',
          ].join(' ')}
        >
          {hasRows ? (
            children
          ) : (
            <TableRow>
              <TableCell colSpan={headers.length} className="px-3 py-8">
                <TEmpty message={t('admin.empty')} />
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
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
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--t-noise)] pt-4">
      <span className="font-sans text-[12px] font-medium tracking-normal text-[var(--t-faint)]">
        {t('admin.total', { count: meta.total })}
      </span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-label={t('admin.pagination.previous')}
          disabled={meta.page <= 1}
          onClick={() => onPageChange(meta.page - 1)}
          className="flex h-7 items-center border border-[var(--t-noise)] px-2 font-mono text-[10px] tracking-[0.15em] text-[var(--t-sub)] transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          [&lt;]
        </button>
        <span className="min-w-20 text-center font-mono text-[10px] tracking-[0.15em] text-white/60">
          {String(meta.page).padStart(2, '0')} / {String(totalPages).padStart(2, '0')}
        </span>
        <button
          type="button"
          aria-label={t('admin.pagination.next')}
          disabled={meta.page >= totalPages}
          onClick={() => onPageChange(meta.page + 1)}
          className="flex h-7 items-center border border-[var(--t-noise)] px-2 font-mono text-[10px] tracking-[0.15em] text-[var(--t-sub)] transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          [&gt;]
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
    <div className="t-corner flex min-h-56 flex-col items-center justify-center gap-4 border border-dashed border-[var(--t-hazard-dim)] px-6 py-10">
      <span aria-hidden className="t-hazard-stripes absolute inset-x-0 top-0 h-1" />
      <span className="font-sans text-[12px] font-medium tracking-normal text-[var(--t-hazard)]">
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
