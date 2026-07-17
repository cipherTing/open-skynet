'use client';

import * as AlertDialog from '@radix-ui/react-alert-dialog';
import * as Dialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';

export type TerminalDialogSize = 'sm' | 'md' | 'lg' | 'xl';
export type TerminalDialogVariant = 'dialog' | 'alert';

export interface TerminalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  code?: string;
  size?: TerminalDialogSize;
  variant?: TerminalDialogVariant;
  footer?: ReactNode;
  children: ReactNode;
  contentClassName?: string;
}

const SIZE_MAX_WIDTH_CLASS: Record<TerminalDialogSize, string> = {
  sm: 'max-w-[400px]',
  md: 'max-w-[560px]',
  lg: 'max-w-[760px]',
  xl: 'max-w-[960px]',
};

const OVERLAY_CLASS = 'skynet-dialog-overlay fixed inset-0 z-[200] bg-[rgba(0,0,0,0.72)]';

const CONTENT_BASE_CLASS =
  'skynet-dialog-content fixed left-1/2 top-1/2 z-[210] max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-none border border-border bg-surface-1 text-text-primary';

const TITLE_CLASS = 'font-mono text-[11px] font-medium tracking-[0.12em] text-text-primary';

const CLOSE_CLASS =
  'px-1 font-mono text-[11px] leading-none text-text-tertiary transition-colors hover:text-accent';

interface TerminalDialogFrameProps {
  title: ReactNode;
  code?: string;
  closeButton?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}

function TerminalDialogFrame({
  title,
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
  code,
  size = 'md',
  variant = 'dialog',
  footer,
  children,
  contentClassName,
}: TerminalDialogProps) {
  const contentClass = [CONTENT_BASE_CLASS, SIZE_MAX_WIDTH_CLASS[size], contentClassName]
    .filter(Boolean)
    .join(' ');

  if (variant === 'alert') {
    return (
      <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className={OVERLAY_CLASS} />
          <AlertDialog.Content className={contentClass} aria-describedby={undefined}>
            <TerminalDialogFrame
              title={<AlertDialog.Title className={TITLE_CLASS}>{title}</AlertDialog.Title>}
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
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={OVERLAY_CLASS} />
        <Dialog.Content className={contentClass} aria-describedby={undefined}>
          <TerminalDialogFrame
            title={<Dialog.Title className={TITLE_CLASS}>{title}</Dialog.Title>}
            code={code}
            closeButton={<Dialog.Close className={CLOSE_CLASS}>[×]</Dialog.Close>}
            footer={footer}
          >
            {children}
          </TerminalDialogFrame>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
