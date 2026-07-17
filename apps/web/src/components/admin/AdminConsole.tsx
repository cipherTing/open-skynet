'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
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
      <span className="absolute left-0 top-0 h-3 w-3 border-l border-t border-[#3A5A3A]" />
      <span className="absolute right-0 top-0 h-3 w-3 border-r border-t border-[#3A5A3A]" />
      <span className="absolute bottom-0 left-0 h-3 w-3 border-b border-l border-[#3A5A3A]" />
      <span className="absolute bottom-0 right-0 h-3 w-3 border-b border-r border-[#3A5A3A]" />
    </div>
  );
}

function UtcClock() {
  const now = useUtcNow(1000);
  return (
    <span className="hidden items-center gap-2 font-mono text-[10px] tracking-[0.15em] text-[#3A5A3A] sm:inline-flex">
      <span aria-hidden className="t-anim-blink text-[#ADFF2F]">
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
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-[#1A2E1A] bg-[#040704] lg:flex">
        <div className="border-b border-[#1A2E1A] px-5 py-5">
          <div className="font-mono text-[9px] uppercase tracking-[0.3em] text-[#3A5A3A]">
            SKYNET.OS
          </div>
          <div className="mt-1.5 font-mono text-[13px] font-bold uppercase tracking-[0.2em] text-[#ADFF2F]">
            ROOT CONSOLE
          </div>
          <p className="mt-2 text-[11px] leading-4 text-white/50">{t('admin.subtitle')}</p>
          <p
            aria-hidden
            className="mt-3 font-mono text-[9px] uppercase tracking-[0.25em] text-[#1A2E1A]"
          >
            PRIVILEGED ACCESS // ROOT
          </p>
        </div>
        <nav className="flex-1 overflow-y-auto" aria-label={t('adminDialogs.secIndex')}>
          {SECTION_GROUPS.map((group) => (
            <div key={group.id} className="border-b border-[#122012] px-3 py-3 last:border-b-0">
              <div className="mb-2 flex items-center gap-2 px-2 font-mono text-[9px] uppercase tracking-[0.25em] text-[#3A5A3A]">
                <span aria-hidden className="text-[#1A2E1A]">
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
                          ? 'bg-[#ADFF2F]/5 shadow-[inset_2px_0_0_0_#ADFF2F]'
                          : 'hover:bg-black hover:shadow-[inset_2px_0_0_0_#3A5A3A]'
                      }`}
                    >
                      <span
                        className={`shrink-0 font-mono text-[9px] tracking-[0.15em] ${
                          active
                            ? 'text-[#ADFF2F]'
                            : 'text-[#3A5A3A] group-hover:text-[#EDF3ED]'
                        }`}
                      >
                        [{secCode(id)}]
                      </span>
                      <span
                        className={`truncate text-[13px] ${
                          active
                            ? 'font-bold text-[#ADFF2F]'
                            : 'text-white/60 group-hover:text-[#EDF3ED]'
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
        <div className="border-t border-[#1A2E1A] p-3">
          <Link
            href="/workspace"
            className="flex items-center gap-2 px-2 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#3A5A3A] transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:text-[#ADFF2F]"
          >
            <span aria-hidden>[&lt;&lt;]</span>
            {t('admin.backHome')}
          </Link>
        </div>
      </aside>

      <main className="min-w-0 lg:ml-60">
        <header className="sticky top-0 z-20 border-b border-[#1A2E1A] bg-black/90 backdrop-blur-md">
          <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <div className="flex min-w-0 items-baseline gap-3">
              <span className="hidden shrink-0 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#ADFF2F] md:inline">
                ROOT CONSOLE
              </span>
              <span aria-hidden className="hidden shrink-0 text-[#1A2E1A] md:inline">
                /
              </span>
              <span className="shrink-0 font-mono text-[10px] tracking-[0.15em] text-[#3A5A3A]">
                [{secCode(section)}]
              </span>
              <h1 className="truncate text-lg font-bold text-[#EDF3ED]">
                {t(`admin.sections.${section}`)}
              </h1>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <UtcClock />
              <button
                type="button"
                aria-label={t('admin.refresh')}
                onClick={() => void queryClient.invalidateQueries({ queryKey: ['admin', section] })}
                className="flex h-8 w-8 items-center justify-center rounded-none border border-[#1A2E1A] text-[#3A5A3A] transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:border-[#ADFF2F] hover:text-[#ADFF2F]"
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
                    ? 'bg-[#ADFF2F]/10 text-[#ADFF2F] shadow-[inset_0_-2px_0_0_#ADFF2F]'
                    : 'text-[#3A5A3A] hover:text-white/85'
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
