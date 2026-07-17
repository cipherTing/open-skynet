'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { FLOATING_Z_INDEX } from '@/components/ui/FloatingPortal';
import {
  DEFAULT_TOAST_DURATION_MS,
  type SignalToastTone,
  type ToastState,
} from '@/components/ui/signal-toast-types';
import { useClientReady } from '@/hooks/useClientReady';

interface StandaloneSignalToastProps {
  message: string;
  tone?: SignalToastTone;
}

export function ToastPortal({ toast, onDismiss }: { toast: ToastState; onDismiss: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, toast.durationMs);
    return () => window.clearTimeout(timer);
  }, [onDismiss, toast.id, toast.durationMs]);

  return createPortal(
    <ToastFrame key={toast.id} {...toast} onDismiss={onDismiss} />,
    document.body,
  );
}

export function StandaloneSignalToast({ message, tone = 'success' }: StandaloneSignalToastProps) {
  const mounted = useClientReady();

  if (!mounted || !message) return null;

  return createPortal(
    <ToastFrame id={0} message={message} tone={tone} durationMs={DEFAULT_TOAST_DURATION_MS} />,
    document.body,
  );
}

const TONE_CLASS: Record<SignalToastTone, string> = {
  success: 'border-accent/40 text-accent',
  error: 'border-danger/50 text-danger',
  info: 'border-info/50 text-info',
};

function ToastFrame({
  message,
  tone,
  action,
  onDismiss,
}: ToastState & { onDismiss?: () => void }) {
  const [actionRunning, setActionRunning] = useState(false);
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'error' ? AlertTriangle : Info;

  return (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2"
      style={{ zIndex: FLOATING_Z_INDEX.toast }}
      role="status"
      aria-live="polite"
    >
      <div
        className={`flex max-w-[calc(100vw-32px)] items-center gap-2 border bg-surface-2 px-4 py-3 font-mono text-[12px] animate-[skynet-floating-in_120ms_steps(3)] motion-reduce:animate-none ${TONE_CLASS[tone]}`}
      >
        <Icon className="h-4 w-4 flex-shrink-0" />
        <span className="min-w-0 break-words text-text-primary">{message}</span>
        {action?.kind === 'link' ? (
          <Link
            href={action.href}
            onClick={onDismiss}
            className="ml-1 shrink-0 border border-current/25 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em] transition-colors hover:bg-current/10"
          >
            {action.label}
          </Link>
        ) : action?.kind === 'button' ? (
          <button
            type="button"
            disabled={actionRunning}
            onClick={async () => {
              if (actionRunning) return;
              setActionRunning(true);
              try {
                await action.onClick();
                onDismiss?.();
              } catch (err) {
                console.error('Toast action failed:', err);
                setActionRunning(false);
              }
            }}
            className="ml-1 shrink-0 border border-current/25 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em] transition-colors hover:bg-current/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {action.label}
          </button>
        ) : null}
      </div>
    </div>
  );
}
