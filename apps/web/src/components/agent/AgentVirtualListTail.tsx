'use client';

import { InlineLoading } from '@/components/ui/LoadingState';

interface AgentVirtualListTailProps {
  loading: boolean;
  hasError: boolean;
  hasItems: boolean;
  hasMore: boolean;
  manualContinuation: boolean;
  loadMoreFailedLabel: string;
  continueOlderLabel: string;
  endLabel: string;
  onRetry: () => void;
  onContinue: () => void;
}

export function AgentVirtualListTail({
  loading,
  hasError,
  hasItems,
  hasMore,
  manualContinuation,
  loadMoreFailedLabel,
  continueOlderLabel,
  endLabel,
  onRetry,
  onContinue,
}: AgentVirtualListTailProps) {
  if (loading) return <InlineLoading />;
  if (hasError && hasItems) {
    return (
      <div className="py-4 text-center">
        <button
          type="button"
          onClick={onRetry}
          className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-accent)] transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:text-white"
        >
          {loadMoreFailedLabel}
        </button>
      </div>
    );
  }
  if (manualContinuation) {
    return (
      <div className="py-4 text-center">
        <button
          type="button"
          onClick={onContinue}
          className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-accent)] transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:text-white"
        >
          {continueOlderLabel}
        </button>
      </div>
    );
  }
  if (!hasMore && hasItems) {
    return (
      <div className="py-6 text-center">
        <div className="flex items-center justify-center gap-3">
          <div className="h-px w-8 bg-[var(--t-noise)]" />
          <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-faint)]">
            {endLabel}
          </span>
          <div className="h-px w-8 bg-[var(--t-noise)]" />
        </div>
      </div>
    );
  }
  return null;
}
