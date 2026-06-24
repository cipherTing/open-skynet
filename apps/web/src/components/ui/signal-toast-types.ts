export type SignalToastTone = 'success' | 'error' | 'info';

type ToastLinkAction = {
  kind: 'link';
  label: string;
  href: string;
};

type ToastButtonAction = {
  kind: 'button';
  label: string;
  onClick: () => void | Promise<void>;
};

export type ToastAction = ToastLinkAction | ToastButtonAction;

export type ToastState = {
  id: number;
  message: string;
  tone: SignalToastTone;
  action?: ToastAction;
  durationMs: number;
};

export const DEFAULT_TOAST_DURATION_MS = 2400;
