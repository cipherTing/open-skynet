'use client';

import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import Link from 'next/link';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { toast, Toaster } from 'sonner';
import { useTranslation } from 'react-i18next';
import {
  DEFAULT_TOAST_DURATION_MS,
  type SignalToastTone,
  type ToastAction,
} from '@/components/ui/signal-toast-types';
import { UI_LAYER_CLASS } from '@/components/ui/layers';
import { cn } from '@/lib/utils';

export type { SignalToastTone, ToastAction } from '@/components/ui/signal-toast-types';

type ToastInput = {
  message: string;
  tone?: SignalToastTone;
  action?: ToastAction;
  durationMs?: number;
};

type ToastOptions = Omit<ToastInput, 'message' | 'tone'>;

type ToastContextValue = {
  show: (input: ToastInput) => void;
  success: (message: string, options?: ToastOptions) => void;
  error: (message: string, options?: ToastOptions) => void;
  info: (message: string, options?: ToastOptions) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_CLASS: Record<SignalToastTone, string> = {
  success: 'border-accent/40 text-accent',
  error: 'border-danger/50 text-danger',
  info: 'border-info/50 text-info',
};

function ToastFrame({
  message,
  tone,
  action,
  dismiss,
}: {
  message: string;
  tone: SignalToastTone;
  action?: ToastAction;
  dismiss?: () => void;
}) {
  const { t } = useTranslation();
  const [actionRunning, setActionRunning] = useState(false);
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'error' ? AlertTriangle : Info;

  return (
    <div
      className={cn(
        'flex max-w-[calc(100vw-32px)] items-center gap-2 border bg-surface-2 px-4 py-3',
        'font-sans text-[12px] leading-5 tracking-normal shadow-none',
        TONE_CLASS[tone],
      )}
      role="status"
      aria-live="polite"
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 break-words text-text-primary">{message}</span>
      {action?.kind === 'link' ? (
        <Link
          href={action.href}
          onClick={dismiss}
          className="shrink-0 border border-current/25 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em] transition-colors hover:bg-current/10"
        >
          {action.label}
        </Link>
      ) : action?.kind === 'button' ? (
        <button
          type="button"
          disabled={actionRunning}
          onClick={() => {
            if (actionRunning) return;
            setActionRunning(true);
            void Promise.resolve(action.onClick())
              .then(dismiss)
              .catch((error: unknown) => {
                console.error('Toast action failed:', error);
                setActionRunning(false);
              });
          }}
          className="shrink-0 border border-current/25 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em] transition-colors hover:bg-current/10 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {action.label}
        </button>
      ) : null}
      {dismiss ? (
        <button
          type="button"
          aria-label={t('termUi.toast.close')}
          onClick={dismiss}
          className="shrink-0 p-1 text-text-tertiary transition-colors hover:text-text-primary"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const show = useCallback((input: ToastInput) => {
    const tone = input.tone ?? 'info';
    const id = toast.custom(
      () => (
        <ToastFrame
          message={input.message}
          tone={tone}
          action={input.action}
          dismiss={() => toast.dismiss(id)}
        />
      ),
      {
        duration: input.durationMs ?? DEFAULT_TOAST_DURATION_MS,
        position: 'bottom-center',
      },
    );
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      show,
      success: (message, options) => show({ message, tone: 'success', ...options }),
      error: (message, options) => show({ message, tone: 'error', ...options }),
      info: (message, options) => show({ message, tone: 'info', ...options }),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toaster
        position="bottom-center"
        duration={DEFAULT_TOAST_DURATION_MS}
        visibleToasts={3}
        gap={8}
        toastOptions={{
          unstyled: true,
          classNames: {
            toast: UI_LAYER_CLASS.toast,
          },
        }}
      />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
}

export function SignalToast({
  message,
  tone = 'success',
}: {
  message: string;
  tone?: SignalToastTone;
}) {
  if (!message) return null;
  return <ToastFrame message={message} tone={tone} />;
}
