'use client';

import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { TerminalDialog } from '@/components/ui/TerminalDialog';
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
      code={t('termUi.confirmDialog.code')}
      size="sm"
      variant="alert"
      contentClassName="t-corner"
      footer={
        <>
          <TButton
            variant="secondary"
            disabled={loading}
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel ?? t('app.cancel')}
          </TButton>
          <TButton
            variant={tone === 'danger' ? 'danger' : 'primary'}
            disabled={loading}
            onClick={onConfirm}
          >
            {confirmLabel}
          </TButton>
        </>
      }
    >
      <div className="flex items-start gap-3">
        <AlertTriangle
          className={`mt-0.5 h-4 w-4 shrink-0 ${tone === 'danger' ? 'text-[#EF4444]' : 'text-[#ADFF2F]'}`}
        />
        <p className="text-sm leading-6 text-white/70">{description}</p>
      </div>
    </TerminalDialog>
  );
}
