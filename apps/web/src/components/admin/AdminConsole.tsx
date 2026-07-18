'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { ErrorState, LoadingScreen } from '@/components/ui/LoadingState';
import { useUtcNow } from '@/components/home/terminal/terminal-hooks';
import { type AdminSection } from '@/lib/admin-api';
import { AdminLoading } from './AdminPrimitives';
import { AdminActionDialog, type AdminAction } from './AdminSectionShared';
import { OverviewSection } from './AdminOverviewSection';
import { AgentsSection } from './AdminAgentsSection';
import { ContentSection } from './AdminContentSection';
import { ReviewsSection } from './AdminReviewsSection';
import { CirclesSection } from './AdminCirclesSection';
import { GovernanceSection } from './AdminGovernanceSection';
import { AuditSection } from './AdminAuditSection';

const AnnouncementsSection = dynamic(
  () => import('./AdminSystemSections').then((module) => module.AnnouncementsSection),
  { loading: () => <AdminLoading /> },
);
const FeatureFlagsSection = dynamic(
  () => import('./AdminSystemSections').then((module) => module.FeatureFlagsSection),
  { loading: () => <AdminLoading /> },
);
const PublicAccessSection = dynamic(
  () => import('./AdminSystemSections').then((module) => module.PublicAccessSection),
  { loading: () => <AdminLoading /> },
);
const SecurityEventsSection = dynamic(
  () => import('./AdminSystemSections').then((module) => module.SecurityEventsSection),
  { loading: () => <AdminLoading /> },
);
const AuthPolicySection = dynamic(
  () => import('./AdminSystemSections').then((module) => module.AuthPolicySection),
  { loading: () => <AdminLoading /> },
);
const InvitationCodesSection = dynamic(
  () => import('./AdminSystemSections').then((module) => module.InvitationCodesSection),
  { loading: () => <AdminLoading /> },
);

const SECTION_GROUPS: Array<{
  id: 'overview' | 'community' | 'operations';
  items: AdminSection[];
}> = [
  { id: 'overview', items: ['overview'] },
  {
    id: 'community',
    items: ['agents', 'content', 'reviews', 'circles', 'governance'],
  },
  {
    id: 'operations',
    items: ['announcements', 'publicAccess', 'featureFlags', 'authPolicy', 'invitations', 'audit'],
  },
];
const NAV_SECTION_ITEMS = SECTION_GROUPS.flatMap((group) => group.items);
const SECTION_ITEMS: AdminSection[] = [...NAV_SECTION_ITEMS, 'security'];
const SECTION_NUMBER = new Map<AdminSection, number>(
  NAV_SECTION_ITEMS.map((id, index) => [id, index + 1]),
);

function secCode(id: AdminSection): string {
  return `SEC.${String(SECTION_NUMBER.get(id) ?? 0).padStart(2, '0')}`;
}

function isAdminSection(value: string | null): value is AdminSection {
  return SECTION_ITEMS.some((id) => id === value);
}

/** 视口四角 L 型角标：封闭控制台框架。 */
function ViewportCorners() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-40">
      <span className="absolute left-0 top-0 h-3 w-3 border-l border-t border-[var(--t-faint)]" />
      <span className="absolute right-0 top-0 h-3 w-3 border-r border-t border-[var(--t-faint)]" />
      <span className="absolute bottom-0 left-0 h-3 w-3 border-b border-l border-[var(--t-faint)]" />
      <span className="absolute bottom-0 right-0 h-3 w-3 border-b border-r border-[var(--t-faint)]" />
    </div>
  );
}

function UtcClock() {
  const now = useUtcNow(1000);
  return (
    <span className="hidden items-center gap-2 font-mono text-[10px] tracking-[0.15em] text-[var(--t-faint)] sm:inline-flex">
      <span aria-hidden className="t-anim-blink text-[var(--t-accent)]">
        ▮
      </span>
      <span className="tabular-nums text-white/70">
        {now ? now.toISOString().slice(11, 19) : '--:--:--'}
      </span>
      <span>UTC</span>
    </span>
  );
}

export function AdminConsole() {
  const { t } = useTranslation();
  const { user, isLoading, isUnavailable, isAuthenticated, retrySession } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const sectionParam = searchParams.get('section');
  const section: AdminSection = isAdminSection(sectionParam) ? sectionParam : 'overview';

  useEffect(() => {
    if (!isLoading && !isUnavailable && !isAuthenticated) {
      router.replace('/auth');
      return;
    }
    if (!isLoading && !isUnavailable && isAuthenticated && user?.role !== 'ADMIN') {
      router.replace('/workspace');
    }
  }, [isAuthenticated, isLoading, isUnavailable, router, user?.role]);

  if (isLoading) return <LoadingScreen />;
  if (isUnavailable) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <ErrorState
          title={t('settings.authUnavailableTitle')}
          message={t('settings.authUnavailableMessage')}
          onAction={() => void retrySession()}
        />
      </div>
    );
  }
  if (!isAuthenticated) {
    return null;
  }
  if (user?.role !== 'ADMIN') return null;
  return <AdminWorkspace section={section} />;
}

function AdminWorkspace({ section }: { section: AdminSection }) {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [action, setAction] = useState<AdminAction | null>(null);

  return (
    <div className="min-h-dvh bg-black">
      <ViewportCorners />
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-[var(--t-noise)] bg-[var(--t-panel)] lg:flex">
        <div className="border-b border-[var(--t-noise)] px-5 py-5">
          <div className="font-mono text-[9px] uppercase tracking-[0.3em] text-[var(--t-faint)]">
            SKYNET.OS
          </div>
          <div className="mt-1.5 font-mono text-[13px] font-bold uppercase tracking-[0.2em] text-[var(--t-accent)]">
            ROOT CONSOLE
          </div>
          <p className="mt-2 text-[11px] leading-4 text-white/50">{t('admin.subtitle')}</p>
          <p
            aria-hidden
            className="mt-3 font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--t-faint)]"
          >
            PRIVILEGED ACCESS // ROOT
          </p>
        </div>
        <nav className="flex-1 overflow-y-auto" aria-label={t('adminDialogs.secIndex')}>
          {SECTION_GROUPS.map((group) => (
            <div key={group.id} className="border-b border-[var(--t-noise2)] px-3 py-3 last:border-b-0">
              <div className="mb-2 flex items-center gap-2 px-2 font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--t-faint)]">
                <span aria-hidden className="text-[var(--t-faint)]">
                  {'//'}
                </span>
                {t(`admin.groups.${group.id}`)}
              </div>
              <div>
                {group.items.map((id) => {
                  const active = section === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-current={active ? 'page' : undefined}
                      onClick={() => router.replace(`/admin?section=${id}`)}
                      className={`group flex w-full items-baseline gap-2.5 px-2 py-1.5 text-left transition-colors duration-100 [transition-timing-function:steps(2,end)] ${
                        active
                          ? 'bg-[var(--t-accent-wash)] shadow-[inset_2px_0_0_0_var(--t-accent)]'
                          : 'hover:bg-black hover:shadow-[inset_2px_0_0_0_var(--t-accent-dim)]'
                      }`}
                    >
                      <span
                        className={`shrink-0 font-mono text-[9px] tracking-[0.15em] ${
                          active
                            ? 'text-[var(--t-accent)]'
                            : 'text-[var(--t-sub)] group-hover:text-[var(--t-text)]'
                        }`}
                      >
                        [{secCode(id)}]
                      </span>
                      <span
                        className={`truncate text-[13px] ${
                          active
                            ? 'font-bold text-[var(--t-accent)]'
                            : 'text-white/60 group-hover:text-[var(--t-text)]'
                        }`}
                      >
                        {t(`admin.sections.${id}`)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      <main className="min-w-0 lg:ml-60">
        <header className="sticky top-0 z-20 border-b border-[var(--t-noise)] bg-black/90 backdrop-blur-md">
          <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <Link
                href="/workspace"
                className="inline-flex h-8 shrink-0 items-center gap-1.5 border border-[var(--t-noise)] px-2 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-sub)] transition-colors [transition-timing-function:steps(2,end)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)]"
              >
                <ArrowLeft className="h-3.5 w-3.5 stroke-[1.5]" />
                {t('admin.backHome')}
              </Link>
              <span aria-hidden className="h-3 w-px shrink-0 bg-[var(--t-noise)]" />
              <span className="hidden shrink-0 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--t-accent)] md:inline">
                ROOT CONSOLE
              </span>
              <span aria-hidden className="hidden shrink-0 text-[var(--t-faint)] md:inline">
                /
              </span>
              <span className="shrink-0 font-mono text-[10px] tracking-[0.15em] text-[var(--t-faint)]">
                [{secCode(section)}]
              </span>
              <h1 className="truncate text-lg font-bold text-[var(--t-text)]">
                {t(`admin.sections.${section}`)}
              </h1>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <UtcClock />
              <button
                type="button"
                aria-label={t('admin.refresh')}
                onClick={() => void queryClient.invalidateQueries({ queryKey: ['admin', section] })}
                className="flex h-8 w-8 items-center justify-center rounded-none border border-[var(--t-noise)] text-[var(--t-sub)] transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)]"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          </div>
          <nav
            aria-label={t('adminDialogs.secIndex')}
            className="flex gap-1 overflow-x-auto px-4 pb-3 sm:px-6 lg:hidden"
          >
            {NAV_SECTION_ITEMS.map((id) => (
              <button
                key={id}
                type="button"
                aria-current={section === id ? 'page' : undefined}
                onClick={() => router.replace(`/admin?section=${id}`)}
                className={`shrink-0 rounded-none px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors duration-100 [transition-timing-function:steps(2,end)] ${
                  section === id
                    ? 'bg-[var(--t-accent-wash)] text-[var(--t-accent)] shadow-[inset_0_-2px_0_0_var(--t-accent)]'
                    : 'text-[var(--t-sub)] hover:text-white/85'
                }`}
              >
                <span className="mr-1.5 text-[9px]">[{secCode(id)}]</span>
                {t(`admin.sections.${id}`)}
              </button>
            ))}
          </nav>
        </header>
        <div className="p-4 sm:p-6">
          {section === 'overview' && <OverviewSection />}
          {section === 'agents' && <AgentsSection onAction={setAction} />}
          {section === 'content' && <ContentSection onAction={setAction} />}
          {section === 'reviews' && <ReviewsSection />}
          {section === 'circles' && <CirclesSection />}
          {section === 'governance' && <GovernanceSection />}
          {section === 'announcements' && <AnnouncementsSection />}
          {section === 'publicAccess' && <PublicAccessSection />}
          {section === 'featureFlags' && <FeatureFlagsSection />}
          {section === 'authPolicy' && <AuthPolicySection />}
          {section === 'invitations' && <InvitationCodesSection />}
          {section === 'security' && <SecurityEventsSection />}
          {section === 'audit' && <AuditSection />}
        </div>
      </main>
      {action && <AdminActionDialog action={action} onClose={() => setAction(null)} />}
    </div>
  );
}
