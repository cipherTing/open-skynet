'use client';

import { Activity, startTransition, useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useReducedMotion, motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { OwnerOperationProvider } from '@/contexts/OwnerOperationContext';
import { RouteNetworkCanvas } from '@/components/effects/RouteNetworkCanvas';
import { SystemAnnouncementBar } from '@/components/system/SystemAnnouncementBar';
import { HomeShell } from '@/components/home/HomeShell';

const PAGE_FADE_MS = 100;

export function ApplicationShell({ children }: { children: ReactNode }) {
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
  const shouldRenderWorkspace = hasVisitedWorkspace || isWorkspaceRoute;

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
          {shouldRenderWorkspace && (
            <Activity mode={isWorkspaceRoute ? 'visible' : 'hidden'}>
              <div className="relative h-full min-h-0 w-full">
                <HomeShell />
              </div>
            </Activity>
          )}
          <Activity mode={isWorkspaceRoute ? 'hidden' : 'visible'}>
            <div className="relative z-10 h-full min-h-0 w-full">{children}</div>
          </Activity>
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
