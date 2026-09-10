'use client';

import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CircleForumFeed } from '@/components/circle/CircleForumFeed';
import { CircleInfoPanel } from '@/components/circle/CircleInfoPanel';
import { PageHeader } from '@/components/layout/PageHeader';
import { ErrorState, InlineLoading } from '@/components/ui/LoadingState';
import { AuthRequiredDialog, AuthRequiredState } from '@/components/ui/AuthRequiredDialog';
import { useAuth } from '@/contexts/AuthContext';
import { ApiError, circleApi } from '@/lib/api';
import { circleKeys, forumKeys } from '@/lib/query-keys';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';

interface CircleDetailPageProps {
  slug: string;
}

export function CircleDetailPage({ slug }: CircleDetailPageProps) {
  const { t } = useTranslation();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const [authPromptOpen, setAuthPromptOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const queryClient = useQueryClient();
  const viewerKey = user?.id ?? 'anonymous';
  const circleQuery = useQuery({
    queryKey: circleKeys.detail(viewerKey, slug),
    queryFn: () => circleApi.getCircleBySlug(slug),
    enabled: !authLoading && isAuthenticated && Boolean(slug),
  });
  const circle = circleQuery.data ?? null;
  const detailTitle = circle ? `/${circle.name}` : t('circles.detail.title');
  const isNotFound = circleQuery.error instanceof ApiError && circleQuery.error.statusCode === 404;
  const errorMessage = isNotFound ? t('circles.detail.notFound') : t('circles.detail.loadFailed');

  const refreshCircleData = useCallback(async () => {
    if (!circle) {
      await circleQuery.refetch();
      return;
    }

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: circleKeys.detail(viewerKey, slug) }),
      queryClient.invalidateQueries({ queryKey: circleKeys.lists(viewerKey) }),
      queryClient.invalidateQueries({ queryKey: forumKeys.viewerRoot(viewerKey) }),
    ]);
  }, [circle, circleQuery, queryClient, slug, viewerKey]);

  if (!authLoading && !isAuthenticated) {
    return (
      <>
        <AuthRequiredState onOpen={() => setAuthPromptOpen(true)} />
        <AuthRequiredDialog open={authPromptOpen} onOpenChange={setAuthPromptOpen} />
      </>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden">
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <PageHeader title={detailTitle} />

        <div className="min-h-0 flex-1 px-4 pt-0 sm:px-6">
          {circleQuery.isPending && (
            <div className="flex min-h-full items-center justify-center py-16">
              <InlineLoading label={t('circles.detail.loading')} />
            </div>
          )}

          {circleQuery.isError && (
            <div className="flex min-h-full items-center justify-center py-16">
              <ErrorState
                title={t('circles.detail.loadFailedTitle')}
                message={errorMessage}
                actionLabel={t('app.retry')}
                onAction={() => void refreshCircleData()}
              />
            </div>
          )}

          {circle && (
            <div className="flex h-full min-h-0 flex-col">
              <div className="mb-3 mt-3 flex justify-end xl:hidden">
                <Sheet open={panelOpen} onOpenChange={setPanelOpen}>
                  <SheetTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex h-8 items-center gap-1.5 border border-[var(--t-noise)] px-2.5 font-sans text-[12px] text-[var(--t-sub)] transition-colors hover:border-[var(--t-accent)] hover:text-[var(--t-accent)]"
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" />
                      {t('circles.detail.panelTitle')}
                    </button>
                  </SheetTrigger>
                  <SheetContent side="right" showClose closeLabel={t('app.close')} className="w-[min(360px,calc(100vw-24px))] p-0">
                    <SheetHeader>
                      <SheetTitle>{t('circles.detail.panelTitle')}</SheetTitle>
                    </SheetHeader>
                    <div className="h-[calc(100%-57px)] overflow-y-auto">
                      <CircleInfoPanel circle={circle} compact onMembershipChanged={refreshCircleData} />
                    </div>
                  </SheetContent>
                </Sheet>
              </div>
              <div className="min-h-0 flex-1">
                <CircleForumFeed circle={circle} />
              </div>
            </div>
          )}
        </div>
      </main>

      {circle && (
        <aside className="hidden h-full min-h-0 w-[280px] shrink-0 flex-col border-l border-[var(--t-noise)] bg-[var(--t-panel)] xl:flex">
          <CircleInfoPanel circle={circle} onMembershipChanged={refreshCircleData} />
        </aside>
      )}
    </div>
  );
}
