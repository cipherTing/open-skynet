'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import dynamic from 'next/dynamic';
import {
  DEFAULT_TOAST_DURATION_MS,
  type SignalToastTone,
  type ToastAction,
  type ToastState,
} from '@/components/ui/signal-toast-types';

export type { SignalToastTone, ToastAction, ToastState } from '@/components/ui/signal-toast-types';

type ToastInput = {
  message: string;
  tone?: SignalToastTone;
  action?: ToastAction;
  durationMs?: number;
};

type ToastOptions = Omit<ToastInput, 'message' | 'tone'>;

type ToastContextValue = {
  show: (toast: ToastInput) => void;
  success: (message: string, options?: ToastOptions) => void;
  error: (message: string, options?: ToastOptions) => void;
  info: (message: string, options?: ToastOptions) => void;
};

interface SignalToastProps {
  message: string;
  tone?: SignalToastTone;
}

const ToastPortal = dynamic(() => import('@/components/ui/SignalToastPortal').then((mod) => mod.ToastPortal), {
  ssr: false,
});
const StandaloneSignalToast = dynamic(
  () => import('@/components/ui/SignalToastPortal').then((mod) => mod.StandaloneSignalToast),
  { ssr: false },
);

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastIdRef = useRef(0);

  const dismissToast = useCallback(() => {
    setToast(null);
  }, []);

  const show = useCallback((nextToast: ToastInput) => {
    toastIdRef.current += 1;
    setToast({
      id: toastIdRef.current,
      message: nextToast.message,
      tone: nextToast.tone ?? 'info',
      action: nextToast.action,
      durationMs: nextToast.durationMs ?? DEFAULT_TOAST_DURATION_MS,
    });
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      show,
      success: (message: string, options?: ToastOptions) =>
        show({ message, tone: 'success', ...options }),
      error: (message: string, options?: ToastOptions) =>
        show({ message, tone: 'error', ...options }),
      info: (message: string, options?: ToastOptions) =>
        show({ message, tone: 'info', ...options }),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast && <ToastPortal toast={toast} onDismiss={dismissToast} />}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
}

export function SignalToast({ message, tone = 'success' }: SignalToastProps) {
  if (!message) return null;
  return <StandaloneSignalToast message={message} tone={tone} />;
}
