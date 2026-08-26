'use client';

import { startTransition, useEffect, useState, type ReactNode } from 'react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { AppBootstrapLoading } from '@/components/ui/AppBootstrapLoading';
import { ErrorState } from '@/components/ui/LoadingState';
import { useAuth } from '@/contexts/AuthContext';
import { OwnerOperationProvider } from '@/contexts/OwnerOperationContext';
import { RouteNetworkCanvas } from '@/components/effects/RouteNetworkCanvas';
import { SystemAnnouncementBar } from '@/components/system/SystemAnnouncementBar';
import { HomeShell } from '@/components/home/HomeShell';
import { authApi } from '@/lib/api';
import { getInitializationGateState } from '@/lib/initialization-gate-state';
import { authKeys } from '@/lib/query-keys';

const PAGE_FADE_MS = 100;
const INITIALIZATION_STATUS_ATTEMPTS = 2;

type InitializationStatus =
  | { kind: 'ready'; initialized: boolean }
  | { kind: 'unavailable' };

async function loadInitializationStatus(): Promise<InitializationStatus> {
  for (let attempt = 0; attempt < INITIALIZATION_STATUS_ATTEMPTS; attempt += 1) {
    try {
      const { initialized } = await authApi.initializationStatus();
      return { kind: 'ready', initialized };
    } catch {
      // 最终不可用状态会在下方展示明确的重试入口。
    }
  }

  return { kind: 'unavailable' };
}

export function InitializationGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const router = useRouter();
  const statusQuery = useSuspenseQuery({
    queryKey: authKeys.initialization(),
    queryFn: loadInitializationStatus,
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: 'always',
  });
  const status = statusQuery.data;
  const isInitializationRoute = pathname === '/initialization';
  const gateState = getInitializationGateState({
    initialized: status.kind === 'ready' ? status.initialized : undefined,
    isInitializationRoute,
  });

  useEffect(() => {
    if (gateState.kind === 'redirect-to-initialization') {
      router.replace('/initialization');
      return;
    }
    if (gateState.kind === 'redirect-to-workspace') {
      router.replace('/workspace');
    }
  }, [gateState.kind, router]);

  if (status.kind === 'unavailable') {
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
  if (gateState.kind === 'loading' || gateState.kind === 'redirect-to-initialization') {
    return <AppBootstrapLoading />;
  }
  if (gateState.kind === 'redirect-to-workspace') return <AppBootstrapLoading />;

  return (
    <PageFade>
      <SessionScopedApplication>{children}</SessionScopedApplication>
    </PageFade>
  );
}

function SessionScopedApplication({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const isWorkspaceRoute = pathname === '/workspace';
  const [hasVisitedWorkspace, setHasVisitedWorkspace] = useState(isWorkspaceRoute);

  useEffect(() => {
    if (!isWorkspaceRoute || hasVisitedWorkspace) return;
    startTransition(() => setHasVisitedWorkspace(true));
  }, [hasVisitedWorkspace, isWorkspaceRoute]);

  return (
    <OwnerOperationProvider key={user?.id ?? 'anonymous'}>
      <RouteNetworkCanvas />
      <div className="noise-texture" aria-hidden="true" />
      <div className="ambient-glow" aria-hidden="true" />
      <div className="flex h-dvh min-h-0 flex-col overflow-hidden">
        <SystemAnnouncementBar />
        <div className="relative z-10 min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
          {hasVisitedWorkspace && (
            <div
              className={
                isWorkspaceRoute
                  ? 'relative h-full min-h-0 w-full'
                  : 'pointer-events-none absolute inset-0 invisible h-full min-h-0 w-full'
              }
              aria-hidden={!isWorkspaceRoute}
            >
              <HomeShell />
            </div>
          )}
          {!isWorkspaceRoute && (
            <div className="relative z-10 h-full min-h-0 w-full">{children}</div>
          )}
        </div>
      </div>
    </OwnerOperationProvider>
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
