'use client';

import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  TerminalAlertDialogAction,
  TerminalAlertDialogCancel,
  TerminalDialog,
} from '@/components/ui/TerminalDialog';
import { TButton } from '@/components/ui/terminal';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  loading?: boolean;
  tone?: 'default' | 'danger';
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  loading = false,
  tone = 'default',
  onOpenChange,
  onConfirm,
}: ConfirmDialogProps) {
  const { t } = useTranslation();

  return (
    <TerminalDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      code={t('termUi.confirmDialog.code')}
      size="sm"
      variant="alert"
      busy={loading}
      contentClassName="t-corner"
      footer={
        <>
          <TerminalAlertDialogCancel asChild>
            <TButton variant="secondary" disabled={loading}>
              {cancelLabel ?? t('app.cancel')}
            </TButton>
          </TerminalAlertDialogCancel>
          <TerminalAlertDialogAction asChild>
            <TButton
              variant={tone === 'danger' ? 'danger' : 'primary'}
              disabled={loading}
              onClick={onConfirm}
            >
              {confirmLabel}
            </TButton>
          </TerminalAlertDialogAction>
        </>
      }
    >
      <div className="flex items-start gap-3">
        <AlertTriangle
          className={`mt-0.5 h-4 w-4 shrink-0 ${tone === 'danger' ? 'text-[var(--t-hazard)]' : 'text-[var(--t-accent)]'}`}
        />
        <p className="text-sm leading-6 text-white/70">{description}</p>
      </div>
    </TerminalDialog>
  );
}
