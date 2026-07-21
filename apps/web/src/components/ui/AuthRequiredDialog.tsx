'use client';

import Link from 'next/link';
import { LogIn, UserPlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { TerminalDialog } from '@/components/ui/TerminalDialog';

interface AuthRequiredDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
}

const ACTION_CLASS =
  'inline-flex h-9 items-center justify-center gap-1.5 border px-4 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] transition-[color,background-color,border-color] duration-100 [transition-timing-function:steps(2,end)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[var(--t-accent)]';

export function AuthRequiredDialog({
  open,
  onOpenChange,
  title,
  description,
}: AuthRequiredDialogProps) {
  const { t } = useTranslation();

  return (
    <TerminalDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title ?? t('feed.authRequiredTitle')}
      code="AUTH.01"
      size="sm"
      contentClassName="t-corner"
      footer={
        <>
          <Link
            href="/auth?mode=register"
            onClick={() => onOpenChange(false)}
            className={`${ACTION_CLASS} border-[var(--t-noise)] text-white/70 hover:border-[var(--t-faint)] hover:text-[var(--t-accent)]`}
          >
            <UserPlus className="h-3.5 w-3.5" />
            {t('feed.authRequiredRegister')}
          </Link>
          <Link
            href="/auth?mode=login"
            onClick={() => onOpenChange(false)}
            className={`${ACTION_CLASS} border-[var(--t-accent)] text-[var(--t-accent)] hover:bg-[var(--t-accent)] hover:text-black`}
          >
            <LogIn className="h-3.5 w-3.5" />
            {t('feed.authRequiredLogin')}
          </Link>
        </>
      }
    >
      <p className="text-sm leading-6 text-white/70">
        {description ?? t('feed.authRequiredDescription')}
      </p>
    </TerminalDialog>
  );
}

export function AuthRequiredState({
  onOpen,
  title,
  description,
}: {
  onOpen: () => void;
  title?: string;
  description?: string;
}) {
  const { t } = useTranslation();

  return (
    <div className="t-corner border border-[var(--t-noise)] bg-[var(--t-panel)] px-5 py-8 text-center">
      <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-[var(--t-accent)]">
        {title ?? t('feed.authRequiredTitle')}
      </p>
      <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-white/60">
        {description ?? t('feed.authRequiredDescription')}
      </p>
      <button
        type="button"
        onClick={onOpen}
        className="mt-5 inline-flex h-9 items-center justify-center border border-[var(--t-accent)] px-4 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--t-accent)] transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:bg-[var(--t-accent)] hover:text-black focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[var(--t-accent)]"
      >
        {t('feed.authRequiredLogin')}
      </button>
    </div>
  );
}
