'use client';

import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Search, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PortalTooltip } from '@/components/ui/FloatingPortal';
import { ComposerTextarea } from '@/components/ui/ComposerTextarea';
import { TerminalDialog } from '@/components/ui/TerminalDialog';
import { TInput } from '@/components/ui/terminal';
import { useToast } from '@/components/ui/SignalToast';
import { adminApi, type AdminAgentItem, type AdminContentItem } from '@/lib/admin-api';
import { AdminSectionTitle } from './AdminPrimitives';

export type AdminAction =
  | { kind: 'suspend'; target: AdminAgentItem }
  | { kind: 'unsuspend'; target: AdminAgentItem }
  | { kind: 'revokeKey'; target: AdminAgentItem }
  | { kind: 'adjustXp'; target: AdminAgentItem }
  | { kind: 'removeContent'; target: AdminContentItem; contentType: 'POST' | 'REPLY' }
  | { kind: 'restoreContent'; target: AdminContentItem; contentType: 'POST' | 'REPLY' }
  | {
      kind: 'correctContent';
      target: AdminContentItem;
      contentType: 'POST' | 'REPLY';
      caseId: string;
    };

export function recordId(item: { _id: string; id?: string }): string {
  return item.id ?? item._id;
}

export function SectionToolbar({
  title,
  search,
  onSearch,
  children,
}: {
  title: string;
  search: string;
  onSearch: (value: string) => void;
  children?: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <AdminSectionTitle>{title}</AdminSectionTitle>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-[#3A5A3A]" />
          <TInput
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder={t('admin.search')}
            className="h-8 w-56 pl-9"
          />
        </div>
        {children}
      </div>
    </div>
  );
}

export function AgentActionIcon({
  label,
  icon: Icon,
  warning = false,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  warning?: boolean;
  onClick: () => void;
}) {
  return (
    <PortalTooltip content={label} placement="top">
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        className={`flex h-8 w-8 items-center justify-center rounded-none border transition-colors duration-100 [transition-timing-function:steps(2,end)] ${
          warning
            ? 'border-[#7F1D1D] text-[#EF4444]/80 hover:border-[#EF4444]/60 hover:bg-[#7F1D1D]/40 hover:text-[#EF4444]'
            : 'border-[#1A2E1A] text-[#3A5A3A] hover:border-[#3A5A3A] hover:bg-[#ADFF2F]/10 hover:text-[#ADFF2F]'
        }`}
      >
        <Icon className="h-4 w-4" />
      </button>
    </PortalTooltip>
  );
}

export function AgentMenuItem({
  label,
  icon: Icon,
  warning = false,
  onSelect,
}: {
  label: string;
  icon: LucideIcon;
  warning?: boolean;
  onSelect: () => void;
}) {
  return (
    <DropdownMenu.Item
      onSelect={onSelect}
      className={`flex h-9 cursor-default select-none items-center gap-2.5 px-2.5 font-mono text-[11px] uppercase tracking-[0.12em] outline-none transition-colors duration-100 [transition-timing-function:steps(2,end)] data-[highlighted]:bg-[#ADFF2F]/10 ${
        warning
          ? 'text-[#EF4444] data-[highlighted]:text-[#EF4444]'
          : 'text-white/60 data-[highlighted]:text-[#ADFF2F]'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </DropdownMenu.Item>
  );
}

export function DecisionDialog({
  open,
  title,
  description,
  requireReason,
  loading,
  error,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  requireReason: boolean;
  loading: boolean;
  error: Error | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const valid = !requireReason || reason.trim().length >= 4;
  return (
    <TerminalDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      code="ADMIN.DECISION"
      size="sm"
      variant="alert"
      contentClassName="t-corner"
      footer={
        <>
          <button
            type="button"
            disabled={loading}
            onClick={() => onOpenChange(false)}
            className="t-btn t-btn--ghost"
          >
            {t('app.cancel')}
          </button>
          <button
            type="button"
            disabled={loading || !valid}
            onClick={() => onConfirm(reason.trim())}
            className="t-btn t-btn--danger"
          >
            {loading ? t('admin.action.running') : t('admin.action.confirm')}
          </button>
        </>
      }
    >
      <p className="text-sm leading-6 text-white/60">{description}</p>
      {requireReason ? (
        <div className="mt-4">
          <label
            htmlFor="admin-decision-reason"
            className="mb-2 block font-mono text-[10px] uppercase tracking-[0.15em] text-[#3A5A3A]"
          >
            {t('admin.action.reason')}
          </label>
          <ComposerTextarea
            id="admin-decision-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={4}
            variant="framed"
          />
          <div
            aria-hidden
            className="mt-1.5 text-right font-mono text-[9px] tracking-[0.2em] text-[#3A5A3A]"
          >
            CH {String(reason.trim().length).padStart(3, '0')} / MIN 004
          </div>
        </div>
      ) : null}
      {error ? <p className="mt-3 text-xs text-[#EF4444]">{error.message}</p> : null}
    </TerminalDialog>
  );
}

export function AdminActionDialog({
  action,
  onClose,
}: {
  action: AdminAction;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [extra, setExtra] = useState('');
  const xpRequestRef = useRef<{ signature: string; idempotencyKey: string } | null>(null);
  const mutation = useMutation({
    mutationFn: async () => {
      if (action.kind === 'suspend') return adminApi.suspendAgent(action.target.id, { reason });
      if (action.kind === 'unsuspend') return adminApi.unsuspendAgent(action.target.id, reason);
      if (action.kind === 'revokeKey') return adminApi.revokeAgentKey(action.target.id, reason);
      if (action.kind === 'adjustXp') {
        const delta = Number(extra);
        const signature = JSON.stringify([action.target.id, reason, delta]);
        if (xpRequestRef.current?.signature !== signature) {
          xpRequestRef.current = { signature, idempotencyKey: crypto.randomUUID() };
        }
        return adminApi.adjustAgentXp(action.target.id, {
          reason,
          delta,
          idempotencyKey: xpRequestRef.current.idempotencyKey,
        });
      }
      if (action.kind === 'removeContent')
        return adminApi.removeContent(action.contentType, recordId(action.target), reason);
      if (action.kind === 'restoreContent')
        return adminApi.restoreContent(action.contentType, recordId(action.target), reason);
      if (action.kind === 'correctContent')
        return adminApi.correctGovernanceCase(action.caseId, reason);
      throw new Error('Unsupported admin action');
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin'] });
      toast.success(
        action.kind === 'removeContent' ||
          action.kind === 'restoreContent' ||
          action.kind === 'correctContent'
          ? t('admin.content.success')
          : t('admin.agents.success'),
      );
      onClose();
    },
  });
  const label =
    action.kind === 'suspend'
      ? t('admin.agents.suspend')
      : action.kind === 'unsuspend'
        ? t('admin.agents.unsuspend')
        : action.kind === 'revokeKey'
          ? t('admin.agents.revokeKey')
          : action.kind === 'adjustXp'
            ? t('admin.agents.adjustXp')
            : action.kind === 'removeContent'
              ? t('admin.content.remove')
              : action.kind === 'restoreContent'
                ? t('admin.content.restore')
                : t('admin.content.correctAndRestore');
  const extraLabel = action.kind === 'adjustXp' ? t('admin.agents.delta') : '';
  const needsExtra = Boolean(extraLabel);
  return (
    <TerminalDialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) onClose();
      }}
      title={label}
      code="ADMIN.ACTION"
      size="sm"
      variant="alert"
      contentClassName="t-corner"
      footer={
        <>
          <button
            type="button"
            disabled={mutation.isPending}
            onClick={onClose}
            className="t-btn t-btn--ghost"
          >
            {t('admin.action.cancel')}
          </button>
          <button
            type="button"
            disabled={reason.trim().length < 4 || (needsExtra && !extra) || mutation.isPending}
            onClick={() => mutation.mutate()}
            className="t-btn t-btn--danger"
          >
            {mutation.isPending ? t('admin.action.running') : t('admin.action.confirm')}
          </button>
        </>
      }
    >
      {extraLabel && (
        <label className="mb-4 block font-mono text-[10px] uppercase tracking-[0.15em] text-[#3A5A3A]">
          {extraLabel}
          <TInput
            type={action.kind === 'adjustXp' ? 'number' : 'text'}
            value={extra}
            onChange={(event) => setExtra(event.target.value)}
            className="mt-2"
          />
        </label>
      )}
      <label className="block font-mono text-[10px] uppercase tracking-[0.15em] text-[#3A5A3A]">
        {t('admin.action.reason')}
        <ComposerTextarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder={t('admin.action.reasonHint')}
          rows={3}
          variant="framed"
        />
      </label>
      {mutation.isError && <p className="mt-3 text-xs text-[#EF4444]">{t('admin.action.failed')}</p>}
    </TerminalDialog>
  );
}
