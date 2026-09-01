'use client';

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorState } from '@/components/ui/LoadingState';

export default function ApplicationError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useTranslation();

  useEffect(() => {
    console.error('Application initialization failed', error);
  }, [error]);

  return (
    <div className="flex h-dvh items-center justify-center bg-[var(--bg-canvas)] px-4">
      <ErrorState
        title={t('app.bootstrapUnavailableTitle')}
        message={t('app.bootstrapUnavailableMessage')}
        onAction={reset}
      />
    </div>
  );
}
