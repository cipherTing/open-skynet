'use client';

import * as AlertDialog from '@radix-ui/react-alert-dialog';
import * as Dialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { TButton } from '@/components/ui/terminal';
import { cn } from '@/lib/utils';
import { UI_LAYER_CLASS } from '@/components/ui/layers';

export type TerminalDialogSize = 'sm' | 'md' | 'lg' | 'xl';
export type TerminalDialogVariant = 'dialog' | 'alert';

export interface TerminalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  code?: string;
  size?: TerminalDialogSize;
  variant?: TerminalDialogVariant;
  footer?: ReactNode;
  children: ReactNode;
  contentClassName?: string;
  busy?: boolean;
}

const SIZE_MAX_WIDTH_CLASS: Record<TerminalDialogSize, string> = {
  sm: 'max-w-[400px]',
  md: 'max-w-[560px]',
  lg: 'max-w-[760px]',
  xl: 'max-w-[960px]',
};

const OVERLAY_CLASS = cn(
  'skynet-dialog-overlay fixed inset-0 bg-[rgba(0,0,0,0.72)]',
  UI_LAYER_CLASS.modalOverlay,
);

const CONTENT_BASE_CLASS =
  'skynet-dialog-content !fixed left-1/2 top-1/2 max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-none border border-border bg-surface-1 text-text-primary';

const TITLE_CLASS = 'font-mono text-[11px] font-medium tracking-[0.12em] text-text-primary';

interface TerminalDialogFrameProps {
  title: ReactNode;
  description: ReactNode;
  code?: string;
  closeButton?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}

function TerminalDialogFrame({
  title,
  description,
  code,
  closeButton,
  footer,
  children,
}: TerminalDialogFrameProps) {
  return (
    <>
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-baseline gap-2">
          {title}
          {code ? (
            <span className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-text-tertiary">
              {code}
            </span>
          ) : null}
        </div>
        {closeButton}
      </div>
      {description}
      <div className="px-4 py-4">{children}</div>
      {footer ? (
        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
          {footer}
        </div>
      ) : null}
    </>
  );
}

export function TerminalDialog({
  open,
  onOpenChange,
  title,
  description,
  code,
  size = 'md',
  variant = 'dialog',
  footer,
  children,
  contentClassName,
  busy = false,
}: TerminalDialogProps) {
  const { t } = useTranslation();
  const contentClass = cn(
    CONTENT_BASE_CLASS,
    UI_LAYER_CLASS.modal,
    SIZE_MAX_WIDTH_CLASS[size],
    contentClassName,
  );
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && busy) return;
    onOpenChange(nextOpen);
  };

  if (variant === 'alert') {
    return (
      <AlertDialog.Root open={open} onOpenChange={handleOpenChange}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className={OVERLAY_CLASS} />
          <AlertDialog.Content
            className={contentClass}
            onEscapeKeyDown={(event) => {
              if (busy) event.preventDefault();
            }}
          >
            <TerminalDialogFrame
              title={<AlertDialog.Title className={TITLE_CLASS}>{title}</AlertDialog.Title>}
              description={
                <AlertDialog.Description className="sr-only">{description}</AlertDialog.Description>
              }
              code={code}
              footer={footer}
            >
              {children}
            </TerminalDialogFrame>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    );
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={OVERLAY_CLASS} />
        <Dialog.Content
          className={contentClass}
          onEscapeKeyDown={(event) => {
            if (busy) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (busy) event.preventDefault();
          }}
          onInteractOutside={(event) => {
            if (busy) event.preventDefault();
          }}
        >
          <TerminalDialogFrame
            title={<Dialog.Title className={TITLE_CLASS}>{title}</Dialog.Title>}
            description={<Dialog.Description className="sr-only">{description}</Dialog.Description>}
            code={code}
            closeButton={
              <Dialog.Close asChild>
                <TButton
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  aria-label={t('termUi.dialog.close')}
                  className="!h-7 !px-2"
                >
                  [×]
                </TButton>
              </Dialog.Close>
            }
            footer={footer}
          >
            {children}
          </TerminalDialogFrame>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export const TerminalDialogClose = Dialog.Close;
export const TerminalAlertDialogCancel = AlertDialog.Cancel;
export const TerminalAlertDialogAction = AlertDialog.Action;
