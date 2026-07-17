'use client';

import { Radio } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { TButton, TEmpty } from '@/components/ui/terminal';

type LoadingScreenProps = {
  label?: string;
  compact?: boolean;
};

type FeedbackStateProps = {
  title?: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function LoadingScreen({ label, compact = false }: LoadingScreenProps) {
  const { t } = useTranslation();
  const text = label ?? t('app.loading');

  return (
    <div
      className={`flex items-center justify-center ${compact ? 'min-h-[180px] py-8' : 'min-h-screen'}`}
    >
      <LoadingMark label={text} size={compact ? 'sm' : 'md'} />
    </div>
  );
}

export function InlineLoading({ label }: { label?: string }) {
  const { t } = useTranslation();

  return (
    <div className="flex justify-center py-6">
      <LoadingMark label={label ?? t('app.loading')} size="sm" />
    </div>
  );
}

export function ErrorState({ title, message, actionLabel, onAction }: FeedbackStateProps) {
  const { t } = useTranslation();

  return (
    <div className="t-corner relative flex flex-col items-center justify-center gap-3 border border-[#1A2E1A] bg-black p-8 text-center">
      <div className="flex h-10 w-10 items-center justify-center border border-[#7F1D1D] bg-[#7F1D1D]/20 text-[#EF4444]">
        <Radio className="h-4 w-4" />
      </div>
      <div>
        {title && <p className="mb-1 font-mono text-[12px] font-bold uppercase tracking-[0.15em] text-[#EF4444]">{title}</p>}
        <p className="font-mono text-[11px] tracking-[0.08em] text-[#3A5A3A]">{message}</p>
      </div>
      {onAction && (
        <TButton variant="secondary" size="sm" onClick={onAction}>
          {actionLabel ?? t('app.retry')}
        </TButton>
      )}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return <TEmpty message={message} />;
}

function LoadingMark({ label, size }: { label: string; size: 'sm' | 'md' }) {
  const boxClass = size === 'sm' ? 'h-6 w-6' : 'h-8 w-8';
  const textClass = size === 'sm' ? 'text-[11px]' : 'text-[12px]';

  return (
    <div className="flex flex-col items-center gap-3">
      <div className={`relative ${boxClass}`}>
        <div className="absolute inset-0 border border-[#1A2E1A]" />
        <div className="absolute inset-0 border-t border-[#ADFF2F] animate-[t-spin-step_1s_steps(8)_infinite] motion-reduce:animate-none" />
        <div className="absolute inset-[6px] bg-[#ADFF2F]/20 animate-[t-blink_1.6s_steps(1)_infinite] motion-reduce:animate-none" />
      </div>
      <span className={`${textClass} font-mono uppercase tracking-[0.15em] text-[#3A5A3A]`}>{label}</span>
    </div>
  );
}
