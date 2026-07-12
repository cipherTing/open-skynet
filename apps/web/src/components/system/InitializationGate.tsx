'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { AppBootstrapLoading } from '@/components/ui/AppBootstrapLoading';
import { ErrorState } from '@/components/ui/LoadingState';
import { AuthProvider } from '@/contexts/AuthContext';
import { OwnerOperationProvider } from '@/contexts/OwnerOperationContext';
import { RouteNetworkCanvas } from '@/components/effects/RouteNetworkCanvas';
import { SystemAnnouncementBar } from '@/components/system/SystemAnnouncementBar';
import { authApi } from '@/lib/api';
import { authKeys } from '@/lib/query-keys';

const MINIMUM_BOOTSTRAP_MS = 1_000;
const PAGE_FADE_MS = 100;

export function InitializationGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const router = useRouter();
  const [minimumDelayElapsed, setMinimumDelayElapsed] = useState(false);
  const statusQuery = useQuery({
    queryKey: authKeys.initialization(),
    queryFn: authApi.initializationStatus,
    retry: 1,
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: 'always',
  });
  const initialized = statusQuery.data?.initialized;
  const isInitializationRoute = pathname === '/initialization';

  useEffect(() => {
    const timer = window.setTimeout(() => setMinimumDelayElapsed(true), MINIMUM_BOOTSTRAP_MS);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!minimumDelayElapsed || initialized === undefined) return;
    if (!initialized && !isInitializationRoute) {
      router.replace('/initialization');
      return;
    }
    if (initialized && isInitializationRoute) {
      router.replace('/workspace');
    }
  }, [initialized, isInitializationRoute, minimumDelayElapsed, router]);

  if (!minimumDelayElapsed || statusQuery.isPending) return <AppBootstrapLoading />;
  if (statusQuery.isError && initialized === undefined) {
    return (
      <div className="flex h-dvh items-center justify-center px-4">
        <ErrorState
          title={t('app.bootstrapUnavailableTitle')}
          message={t('app.bootstrapUnavailableMessage')}
          onAction={() => void statusQuery.refetch()}
        />
      </div>
    );
  }
  if (initialized === undefined) return <AppBootstrapLoading />;
  if (!initialized) {
    return isInitializationRoute ? <PageFade>{children}</PageFade> : <AppBootstrapLoading />;
  }
  if (isInitializationRoute) return <AppBootstrapLoading />;

  return (
    <PageFade>
      <AuthProvider>
        <OwnerOperationProvider>
          <RouteNetworkCanvas />
          <div className="noise-texture" aria-hidden="true" />
          <div className="ambient-glow" aria-hidden="true" />
          <div className="flex h-dvh min-h-0 flex-col overflow-hidden">
            <SystemAnnouncementBar />
            <div className="relative z-10 min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
              {children}
            </div>
          </div>
        </OwnerOperationProvider>
      </AuthProvider>
    </PageFade>
  );
}

function PageFade({ children }: { children: ReactNode }) {
  const reduceMotion = useReducedMotion() === true;
  const [animationComplete, setAnimationComplete] = useState(reduceMotion);

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduceMotion ? 0 : PAGE_FADE_MS / 1_000, ease: 'easeOut' }}
      onAnimationComplete={() => setAnimationComplete(true)}
      className="h-dvh min-h-0"
      style={{ pointerEvents: reduceMotion || animationComplete ? 'auto' : 'none' }}
    >
      {children}
    </motion.div>
  );
}
