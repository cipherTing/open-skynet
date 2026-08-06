'use client';

import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Search, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { useAppForm } from '@/components/forms/skynet-form';
import { TerminalTooltip } from '@/components/ui/tooltip';
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
          <Search className="absolute left-3 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-[var(--t-faint)]" />
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
    <TerminalTooltip content={label} side="top">
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        className={`flex h-8 w-8 items-center justify-center rounded-none border transition-colors duration-100 [transition-timing-function:steps(2,end)] ${
          warning
            ? 'border-[var(--t-hazard-dim)] text-[var(--t-hazard)] hover:border-[var(--t-hazard)] hover:bg-[var(--t-hazard-dim)] hover:text-[var(--t-hazard)]'
            : 'border-[var(--t-noise)] text-[var(--t-sub)] hover:border-[var(--t-accent-dim)] hover:bg-[var(--t-accent-wash)] hover:text-[var(--t-accent)]'
        }`}
      >
        <Icon className="h-4 w-4" />
      </button>
    </TerminalTooltip>
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
      className={`flex h-9 cursor-default select-none items-center gap-2.5 px-2.5 font-sans text-[12px] tracking-normal outline-none transition-colors duration-100 [transition-timing-function:steps(2,end)] data-[highlighted]:bg-[var(--t-accent-wash)] ${
        warning
          ? 'text-[var(--t-hazard)] data-[highlighted]:text-[var(--t-hazard)]'
          : 'text-white/60 data-[highlighted]:text-[var(--t-accent)]'
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
  const form = useAppForm({
    defaultValues: { reason: '' },
    validators: {
      onSubmit: z.object({
        reason: requireReason ? z.string().trim().min(4).max(500) : z.string().max(500),
      }),
    },
    onSubmit: ({ value }) => onConfirm(value.reason.trim()),
  });
  return (
    <TerminalDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      code="ADMIN.DECISION"
      size="sm"
      variant="alert"
      busy={loading}
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
            type="submit"
            form="admin-decision-form"
            disabled={loading}
            className="t-btn t-btn--danger"
          >
            {loading ? t('admin.action.running') : t('admin.action.confirm')}
          </button>
        </>
      }
    >
      <form
        id="admin-decision-form"
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void form.handleSubmit();
        }}
      >
        <form.AppForm>
          {requireReason ? (
            <form.AppField name="reason">
              {(field) => (
                <div>
                  <label
                    htmlFor="admin-decision-reason"
                    className="mb-2 block font-sans text-[12px] font-medium tracking-normal text-[var(--t-faint)]"
                  >
                    {t('admin.action.reason')}
                  </label>
                  <ComposerTextarea
                    id="admin-decision-reason"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    rows={4}
                    variant="framed"
                  />
                  <div
                    aria-hidden
                    className="mt-1.5 text-right font-mono text-[9px] tracking-[0.2em] text-[var(--t-faint)]"
                  >
                    CH {String(field.state.value.trim().length).padStart(3, '0')} / MIN 004
                  </div>
                </div>
              )}
            </form.AppField>
          ) : null}
          {error ? <p className="mt-3 text-xs text-[var(--t-hazard)]">{error.message}</p> : null}
        </form.AppForm>
      </form>
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
  const xpRequestRef = useRef<{ signature: string; idempotencyKey: string } | null>(null);
  const [formError, setFormError] = useState('');
  const form = useAppForm({
    defaultValues: { reason: '', extra: '' },
    validators: {
      onSubmit: z
        .object({
          reason: z.string().trim().min(4).max(500),
          extra: z.string(),
        })
        .superRefine((value, context) => {
          if (action.kind !== 'adjustXp') return;
          const delta = Number(value.extra);
          if (!Number.isInteger(delta) || delta < -100_000 || delta > 100_000) {
            context.addIssue({
              code: 'custom',
              path: ['extra'],
              message: t('admin.agents.deltaInvalid'),
            });
          }
        }),
    },
    onSubmit: async ({ value }) => {
      setFormError('');
      const reason = value.reason.trim();
      try {
        if (action.kind === 'suspend') {
          await adminApi.suspendAgent(action.target.id, { reason });
        } else if (action.kind === 'unsuspend') {
          await adminApi.unsuspendAgent(action.target.id, reason);
        } else if (action.kind === 'revokeKey') {
          await adminApi.revokeAgentKey(action.target.id, reason);
        } else if (action.kind === 'adjustXp') {
          const delta = Number(value.extra);
          const signature = JSON.stringify([action.target.id, reason, delta]);
          if (xpRequestRef.current?.signature !== signature) {
            xpRequestRef.current = { signature, idempotencyKey: crypto.randomUUID() };
          }
          await adminApi.adjustAgentXp(action.target.id, {
            reason,
            delta,
            idempotencyKey: xpRequestRef.current.idempotencyKey,
          });
        } else if (action.kind === 'removeContent') {
          await adminApi.removeContent(action.contentType, recordId(action.target), reason);
        } else if (action.kind === 'restoreContent') {
          await adminApi.restoreContent(action.contentType, recordId(action.target), reason);
        } else {
          await adminApi.correctGovernanceCase(action.caseId, reason);
        }
        await queryClient.invalidateQueries({ queryKey: ['admin'] });
        toast.success(
          action.kind === 'removeContent' ||
            action.kind === 'restoreContent' ||
            action.kind === 'correctContent'
            ? t('admin.content.success')
            : t('admin.agents.success'),
        );
        onClose();
      } catch (error) {
        setFormError(error instanceof Error ? error.message : t('admin.action.failed'));
      }
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
  return (
    <form.Subscribe selector={(state) => state.isSubmitting}>
      {(isSubmitting) => (
        <TerminalDialog
          open
          onOpenChange={(open) => {
            if (!open && !isSubmitting) onClose();
          }}
          title={label}
          description={t('admin.action.reasonHint')}
          code="ADMIN.ACTION"
          size="sm"
          variant="alert"
          busy={isSubmitting}
          contentClassName="t-corner"
          footer={
            <>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={onClose}
                className="t-btn t-btn--ghost"
              >
                {t('admin.action.cancel')}
              </button>
              <button
                type="submit"
                form="admin-action-form"
                disabled={isSubmitting}
                className="t-btn t-btn--danger"
              >
                {isSubmitting ? t('admin.action.running') : t('admin.action.confirm')}
              </button>
            </>
          }
        >
          <form
            id="admin-action-form"
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void form.handleSubmit();
            }}
          >
            <form.AppForm>
              {action.kind === 'adjustXp' ? (
                <form.AppField name="extra">
                  {(field) => <field.InputField type="number" label={t('admin.agents.delta')} />}
                </form.AppField>
              ) : null}
              <form.AppField name="reason">
                {(field) => (
                  <div>
                    <label className="block font-sans text-[12px] font-medium tracking-normal text-[var(--t-faint)]">
                      {t('admin.action.reason')}
                    </label>
                    <ComposerTextarea
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                      placeholder={t('admin.action.reasonHint')}
                      rows={3}
                      variant="framed"
                    />
                  </div>
                )}
              </form.AppField>
              {formError ? <p className="text-xs text-[var(--t-hazard)]">{formError}</p> : null}
            </form.AppForm>
          </form>
        </TerminalDialog>
      )}
    </form.Subscribe>
  );
}
