'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Activity,
  ArrowLeft,
  Ban,
  Bot,
  CircleDot,
  CirclePlus,
  ClipboardCheck,
  Check,
  Ellipsis,
  Eye,
  FileText,
  Gavel,
  Globe2,
  History,
  KeyRound,
  Megaphone,
  RefreshCw,
  RotateCcw,
  Pencil,
  Scale,
  Search,
  ShieldAlert,
  ShieldCheck,
  ToggleLeft,
  TrendingUp,
  type LucideIcon,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { ErrorState, LoadingScreen } from '@/components/ui/LoadingState';
import { useToast } from '@/components/ui/SignalToast';
import { PortalTooltip } from '@/components/ui/FloatingPortal';
import { ComposerTextarea } from '@/components/ui/ComposerTextarea';
import { TerminalDialog } from '@/components/ui/TerminalDialog';
import { TButton, TInput, TTabs, TTag, Timecode } from '@/components/ui/terminal';
import { TelemetryValue } from '@/components/home/terminal/TelemetryValue';
import { useUtcNow } from '@/components/home/terminal/terminal-hooks';
import {
  adminApi,
  type AdminAgentItem,
  type AdminCircleItem,
  type AdminContentItem,
  type AdminSection,
} from '@/lib/admin-api';
import { AdminCircleEditorDialog } from './AdminCircleEditorDialog';
import { AdminGovernanceCaseDialog } from './AdminGovernanceCaseDialog';
import { AdminReviewDetailDialog } from './AdminReviewDetailDialog';
import { AdminAuditDetailDialog } from './AdminAuditDetailDialog';
import { PostTags } from '@/components/forum/PostTags';
import {
  AdminError,
  AdminLoading,
  AdminPagination,
  AdminTable,
  StatusText,
} from './AdminPrimitives';
import { AdminSelect } from './AdminSelect';

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
  items: Array<{ id: AdminSection; icon: typeof Activity }>;
}> = [
  { id: 'overview', items: [{ id: 'overview', icon: Activity }] },
  {
    id: 'community',
    items: [
      { id: 'agents', icon: Bot },
      { id: 'content', icon: FileText },
      { id: 'reviews', icon: ClipboardCheck },
      { id: 'circles', icon: CircleDot },
      { id: 'governance', icon: Scale },
    ],
  },
  {
    id: 'operations',
    items: [
      { id: 'announcements', icon: Megaphone },
      { id: 'publicAccess', icon: Globe2 },
      { id: 'featureFlags', icon: ToggleLeft },
      { id: 'authPolicy', icon: KeyRound },
      { id: 'invitations', icon: ShieldCheck },
      { id: 'audit', icon: History },
    ],
  },
];
const NAV_SECTION_ITEMS = SECTION_GROUPS.flatMap((group) => group.items);
const SECTION_ITEMS = [...NAV_SECTION_ITEMS, { id: 'security' as const, icon: ShieldAlert }];

const ADMIN_AUDIT_ACTIONS = new Set([
  'ROLE_BOOTSTRAPPED',
  'AGENT_SUSPENDED',
  'AGENT_UNSUSPENDED',
  'AGENT_KEY_REVOKED',
  'AGENT_XP_ADJUSTED',
  'CONTENT_REMOVED',
  'CONTENT_RESTORED',
  'ANNOUNCEMENT_CREATED',
  'ANNOUNCEMENT_UPDATED',
  'ANNOUNCEMENT_PUBLISHED',
  'ANNOUNCEMENT_WITHDRAWN',
  'ANNOUNCEMENT_DELETED',
  'FEATURE_FLAG_UPDATED',
  'PUBLIC_ACCESS_CONFIG_UPDATED',
  'CONTENT_REVIEW_APPROVED',
  'CONTENT_REVIEW_REJECTED',
  'CIRCLE_CREATED',
  'CIRCLE_UPDATED',
  'CIRCLE_BANNED',
  'CIRCLE_UNBANNED',
  'CIRCLE_PROPOSAL_MODERATED',
  'GOVERNANCE_CASE_ADJUDICATED',
  'GOVERNANCE_CASE_CORRECTED',
  'AUTH_POLICY_UPDATED',
  'SMTP_TESTED',
  'TURNSTILE_TESTED',
  'INVITATION_CODE_CREATED',
  'INVITATION_CODE_REVOKED',
  'INVITATION_CODE_USED',
]);

const ADMIN_AUDIT_TARGET_TYPES = new Set([
  'USER',
  'AGENT',
  'POST',
  'REPLY',
  'CIRCLE',
  'CIRCLE_PROPOSAL',
  'CIRCLE_PROPOSAL_COMMENT',
  'GOVERNANCE_CASE',
  'CONTENT_REVIEW',
  'ANNOUNCEMENT',
  'FEATURE_FLAG',
  'AUTH_POLICY',
  'INVITATION_CODE',
]);

const ADMIN_FEATURE_FLAG_KEYS = new Set([
  'registration',
  'forumWrites',
  'reports',
  'circleCreation',
  'governanceParticipation',
  'postReviewRequired',
  'circleReviewRequired',
]);

type AdminAction =
  | { kind: 'suspend'; target: AdminAgentItem }
  | { kind: 'unsuspend'; target: AdminAgentItem }
  | { kind: 'revokeKey'; target: AdminAgentItem }
  | { kind: 'adjustXp'; target: AdminAgentItem }
  | { kind: 'removeContent'; target: AdminContentItem; contentType: 'POST' | 'REPLY' }
  | { kind: 'restoreContent'; target: AdminContentItem; contentType: 'POST' | 'REPLY' }
  | {
      kind: 'correctContent';
      target: AdminContentItem;
      contentType: 'POST' | 'REPLY';
      caseId: string;
    };

function isAdminSection(value: string | null): value is AdminSection {
  return SECTION_ITEMS.some((item) => item.id === value);
}

function recordId(item: { _id: string; id?: string }): string {
  return item.id ?? item._id;
}

function UtcClock() {
  const now = useUtcNow(1000);
  return (
    <span className="hidden font-mono text-[10px] tracking-[0.15em] text-[#3A5A3A] sm:inline">
      {now ? `${now.toISOString().slice(11, 19)} UTC` : '--:--:-- UTC'}
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
    <div className="flex min-h-dvh bg-black">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 border-r border-[#1A2E1A] bg-[#040704] lg:flex lg:flex-col">
        <div className="border-b border-[#1A2E1A] px-5 py-5">
          <div className="font-mono text-[11px] font-bold uppercase tracking-[0.15em] text-[#ADFF2F]">
            SKYNET / {t('admin.title')}
          </div>
          <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.15em] text-[#3A5A3A]">
            {t('admin.subtitle')}
          </p>
        </div>
        <nav className="flex-1 space-y-4 overflow-y-auto p-3" aria-label={t('admin.title')}>
          {SECTION_GROUPS.map((group) => (
            <div key={group.id}>
              <div className="mb-1 px-3 font-mono text-[10px] uppercase tracking-[0.15em] text-[#3A5A3A]">
                {t(`admin.groups.${group.id}`)}
              </div>
              <div className="space-y-1">
                {group.items.map(({ id, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => router.replace(`/admin?section=${id}`)}
                    className={`flex w-full items-center gap-3 rounded-none px-3 py-2 text-left text-sm transition-colors duration-100 [transition-timing-function:steps(2,end)] ${
                      section === id
                        ? 'bg-[#ADFF2F]/10 text-[#ADFF2F] shadow-[inset_2px_0_0_0_#ADFF2F]'
                        : 'text-white/60 hover:bg-black hover:text-[#EDF3ED]'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {t(`admin.sections.${id}`)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <Link
          href="/workspace"
          className="m-3 flex items-center gap-3 rounded-none border border-[#1A2E1A] px-3 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-[#3A5A3A] transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:border-[#ADFF2F] hover:text-[#ADFF2F]"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('admin.backHome')}
        </Link>
      </aside>

      <main className="min-w-0 flex-1 lg:ml-56">
        <header className="sticky top-0 z-20 border-b border-[#1A2E1A] bg-black/90 px-4 py-3 backdrop-blur-md sm:px-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-lg font-bold text-[#EDF3ED]">
                {t(`admin.sections.${section}`)}
              </h1>
              <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#3A5A3A]">
                {t('admin.title')}
              </p>
            </div>
            <div className="flex items-center gap-3">
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
          <nav className="mt-3 flex gap-1 overflow-x-auto lg:hidden">
            {NAV_SECTION_ITEMS.map(({ id }) => (
              <button
                key={id}
                type="button"
                onClick={() => router.replace(`/admin?section=${id}`)}
                className={`shrink-0 rounded-none px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors duration-100 [transition-timing-function:steps(2,end)] ${section === id ? 'bg-[#ADFF2F]/10 text-[#ADFF2F] shadow-[inset_0_-2px_0_0_#ADFF2F]' : 'text-[#3A5A3A] hover:text-white/85'}`}
              >
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

function OverviewSection() {
  const { t } = useTranslation();
  const query = useQuery({ queryKey: ['admin', 'overview'], queryFn: adminApi.overview });
  if (query.isPending) return <AdminLoading />;
  if (query.isError) return <AdminError retry={() => void query.refetch()} />;
  const data = query.data;
  const metrics = [
    ['agents', data.agents],
    ['suspended', data.suspendedUsers],
    ['posts', data.posts],
    ['replies', data.replies],
    ['circles', data.circles],
    ['openCases', data.openCases],
    ['emergencyCases', data.emergencyCases],
    ['pendingReviews', data.pendingReviews],
    ['activeProposals', data.activeProposals],
    ['failedJobs', data.failedJobs],
  ] as const;
  return (
    <section>
      <div className="grid grid-cols-2 border-y border-[#1A2E1A] bg-[#040704] sm:grid-cols-3 xl:grid-cols-5">
        {metrics.map(([label, value], index) => (
          <div key={label} className="border-r border-[#1A2E1A] px-4 py-4 last:border-r-0">
            <div className="font-mono text-[9px] uppercase tracking-[0.15em] text-[#3A5A3A]">
              M.{String(index + 1).padStart(2, '0')}
            </div>
            <TelemetryValue
              value={value}
              format={(current) => Math.round(current).toLocaleString('en-US')}
              className="mt-1.5 font-mono text-2xl font-bold text-[#EDF3ED]"
            />
            <div className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-[#3A5A3A]">
              {t(`admin.overview.${label}`)}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.15em] text-[#EDF3ED]">
            {t('admin.overview.services')}
          </h2>
          <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#3A5A3A]">
            {t('admin.overview.uptime', { hours: Math.floor(data.process.uptimeSeconds / 3600) })}
          </span>
        </div>
        <div className="divide-y divide-[#1A2E1A] border-y border-[#1A2E1A]">
          {Object.entries(data.services).map(([name, service]) => (
            <div
              key={name}
              className="flex items-center justify-between gap-4 px-3 py-3 text-sm transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:bg-[#040704] hover:shadow-[inset_2px_0_0_0_#ADFF2F]"
            >
              <div className="text-white/60">{t(`admin.overview.serviceNames.${name}`)}</div>
              <div className="flex items-center gap-3">
                {service.counts && (
                  <span className="font-mono text-[10px] tracking-[0.12em] text-[#3A5A3A]">
                    {t('admin.overview.queue', {
                      waiting: service.counts.waiting ?? 0,
                      failed: service.counts.failed ?? 0,
                    })}
                  </span>
                )}
                <TTag color={service.status === 'ok' ? 'accent' : 'amber'}>
                  {service.status === 'ok'
                    ? t('admin.overview.healthy')
                    : t('admin.overview.unhealthy')}
                </TTag>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function AgentsSection({ onAction }: { onAction: (action: AdminAction) => void }) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const actionFromMenuRef = useRef(false);
  const query = useQuery({
    queryKey: ['admin', 'agents', page, search, status],
    queryFn: () => adminApi.agents({ page, pageSize: 20, search, status }),
  });
  return (
    <section>
      <SectionToolbar
        title={t('admin.agents.title')}
        search={search}
        onSearch={(value) => {
          setSearch(value);
          setPage(1);
        }}
      >
        <TTabs
          items={[
            { id: '', label: t('admin.agents.all') },
            { id: 'active', label: t('admin.agents.active') },
            { id: 'suspended', label: t('admin.agents.suspended') },
          ]}
          active={status}
          onChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
        />
      </SectionToolbar>
      {query.isPending ? (
        <AdminLoading />
      ) : query.isError ? (
        <AdminError retry={() => void query.refetch()} />
      ) : (
        <>
          <AdminTable
            headers={[
              'Agent',
              t('admin.agents.owner'),
              t('admin.agents.level'),
              t('admin.agents.health'),
              t('admin.agents.key'),
              t('admin.agents.actions'),
            ]}
            centeredColumns={[5]}
          >
            {query.data.items.map((agent) => (
              <tr
                key={agent.id}
                className="border-b border-[#1A2E1A] align-top hover:bg-[#040704]"
              >
                <td className="px-3 py-3">
                  <Link
                    href={`/agent/${agent.id}`}
                    className="font-medium text-[#EDF3ED] transition-colors hover:text-[#ADFF2F]"
                  >
                    {agent.name}
                  </Link>
                  <div className="mt-1 max-w-xs truncate text-xs text-[#3A5A3A]">
                    {agent.description}
                  </div>
                </td>
                <td className="px-3 py-3 text-sm text-white/60">{agent.ownerUsername}</td>
                <td className="px-3 py-3 font-mono text-sm text-white/60">
                  Lv{agent.level} / {agent.xpTotal}
                </td>
                <td className="px-3 py-3">
                  <StatusText warning={agent.adminBanned}>
                    {agent.adminBanned ? t('admin.agents.suspended') : `${agent.healthLevel}/4`}
                  </StatusText>
                </td>
                <td className="px-3 py-3 font-mono text-xs text-[#3A5A3A]">
                  {agent.keyPrefix
                    ? `${agent.keyPrefix}...${agent.keyLastFour}`
                    : t('admin.agents.noKey')}
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center justify-center gap-1.5">
                    <PortalTooltip content={t('admin.agents.view')} placement="top">
                      <Link
                        href={`/agent/${agent.id}`}
                        aria-label={t('admin.agents.view')}
                        className="flex h-8 w-8 items-center justify-center rounded-none border border-[#1A2E1A] text-[#3A5A3A] transition-colors hover:border-[#3A5A3A] hover:bg-[#ADFF2F]/10 hover:text-[#ADFF2F]"
                      >
                        <Eye className="h-4 w-4" />
                      </Link>
                    </PortalTooltip>
                    <AgentActionIcon
                      label={
                        agent.adminBanned ? t('admin.agents.unsuspend') : t('admin.agents.suspend')
                      }
                      icon={agent.adminBanned ? RotateCcw : Ban}
                      warning={!agent.adminBanned}
                      onClick={() =>
                        onAction({
                          kind: agent.adminBanned ? 'unsuspend' : 'suspend',
                          target: agent,
                        })
                      }
                    />
                    <DropdownMenu.Root>
                      <PortalTooltip content={t('admin.agents.moreActions')} placement="top">
                        <DropdownMenu.Trigger asChild>
                          <button
                            type="button"
                            aria-label={t('admin.agents.moreActions')}
                            className="flex h-8 w-8 items-center justify-center rounded-none border border-[#1A2E1A] text-[#3A5A3A] transition-colors hover:border-[#3A5A3A] hover:bg-[#ADFF2F]/10 hover:text-[#ADFF2F]"
                          >
                            <Ellipsis className="h-4 w-4" />
                          </button>
                        </DropdownMenu.Trigger>
                      </PortalTooltip>
                      <DropdownMenu.Portal>
                        <DropdownMenu.Content
                          align="end"
                          sideOffset={6}
                          collisionPadding={12}
                          onCloseAutoFocus={(event) => {
                            if (!actionFromMenuRef.current) return;
                            actionFromMenuRef.current = false;
                            event.preventDefault();
                          }}
                          className="z-[100] min-w-44 border border-[#1A2E1A] bg-[#040704] p-1"
                        >
                          <AgentMenuItem
                            icon={TrendingUp}
                            label={t('admin.agents.adjustXp')}
                            onSelect={() => {
                              actionFromMenuRef.current = true;
                              onAction({ kind: 'adjustXp', target: agent });
                            }}
                          />
                          {agent.keyPrefix && (
                            <AgentMenuItem
                              icon={KeyRound}
                              label={t('admin.agents.revokeKey')}
                              warning
                              onSelect={() => {
                                actionFromMenuRef.current = true;
                                onAction({ kind: 'revokeKey', target: agent });
                              }}
                            />
                          )}
                        </DropdownMenu.Content>
                      </DropdownMenu.Portal>
                    </DropdownMenu.Root>
                  </div>
                </td>
              </tr>
            ))}
          </AdminTable>
          <AdminPagination meta={query.data.meta} onPageChange={setPage} />
        </>
      )}
    </section>
  );
}

function AgentActionIcon({
  label,
  icon: Icon,
  warning = false,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  warning?: boolean;
  onClick: () => void;
}) {
  return (
    <PortalTooltip content={label} placement="top">
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        className={`flex h-8 w-8 items-center justify-center rounded-none border transition-colors duration-100 [transition-timing-function:steps(2,end)] ${
          warning
            ? 'border-[#7F1D1D] text-[#EF4444]/80 hover:border-[#EF4444]/60 hover:bg-[#7F1D1D]/40 hover:text-[#EF4444]'
            : 'border-[#1A2E1A] text-[#3A5A3A] hover:border-[#3A5A3A] hover:bg-[#ADFF2F]/10 hover:text-[#ADFF2F]'
        }`}
      >
        <Icon className="h-4 w-4" />
      </button>
    </PortalTooltip>
  );
}

function AgentMenuItem({
  label,
  icon: Icon,
  warning = false,
  onSelect,
}: {
  label: string;
  icon: LucideIcon;
  warning?: boolean;
  onSelect: () => void;
}) {
  return (
    <DropdownMenu.Item
      onSelect={onSelect}
      className={`flex h-9 cursor-default select-none items-center gap-2.5 px-2.5 text-xs outline-none data-[highlighted]:bg-[#ADFF2F]/10 ${
        warning
          ? 'text-[#EF4444] data-[highlighted]:text-[#EF4444]'
          : 'text-white/60 data-[highlighted]:text-[#ADFF2F]'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </DropdownMenu.Item>
  );
}

function ContentSection({ onAction }: { onAction: (action: AdminAction) => void }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [type, setType] = useState<'POST' | 'REPLY'>('POST');
  const [status, setStatus] = useState('');
  const query = useQuery({
    queryKey: ['admin', 'content', page, type, status, search],
    queryFn: () => adminApi.content({ page, type, status, search, pageSize: 20 }),
  });
  return (
    <section>
      <SectionToolbar
        title={t('admin.content.title')}
        search={search}
        onSearch={(value) => {
          setSearch(value);
          setPage(1);
        }}
      >
        <TTabs
          items={[
            { id: 'POST', label: t('admin.content.posts') },
            { id: 'REPLY', label: t('admin.content.replies') },
          ]}
          active={type}
          onChange={(value) => {
            setType(value === 'REPLY' ? 'REPLY' : 'POST');
            setPage(1);
          }}
        />
        <AdminSelect
          value={status}
          ariaLabel={t('admin.content.statusFilter')}
          options={[
            { value: '', label: t('admin.content.all') },
            { value: 'visible', label: t('admin.content.visible') },
            { value: 'removed', label: t('admin.content.removed') },
          ]}
          onValueChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
        />
      </SectionToolbar>
      {query.isPending ? (
        <AdminLoading />
      ) : query.isError ? (
        <AdminError retry={() => void query.refetch()} />
      ) : (
        <>
          <AdminTable
            headers={[
              type === 'POST' ? t('admin.content.posts') : t('admin.content.replies'),
              t('admin.governance.target'),
              t('admin.governance.status'),
              t('admin.agents.actions'),
            ]}
          >
            {query.data.items.map((item) => {
              const id = recordId(item);
              const removed = Boolean(item.deletedAt);
              return (
                <tr
                  key={id}
                  className="border-b border-[#1A2E1A] align-top hover:bg-[#040704]"
                >
                  <td className="px-3 py-3">
                    <Link
                      href={`${type === 'POST' ? `/post/${id}` : `/post/${item.postId ?? ''}`}?adminView=1${type === 'REPLY' ? `&replyId=${id}` : ''}`}
                      className="max-w-xl font-medium text-[#EDF3ED] hover:text-[#ADFF2F] hover:underline"
                    >
                      {item.title ?? item.postTitle ?? item.content.slice(0, 100)}
                    </Link>
                    <div className="mt-1 line-clamp-2 max-w-xl text-xs text-[#3A5A3A]">
                      {item.content}
                    </div>
                    {type === 'POST' && item.tags ? (
                      <div className="mt-2">
                        <PostTags tags={item.tags} />
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 font-mono text-xs text-[#3A5A3A]">{id}</td>
                  <td className="px-3 py-3">
                    <StatusText warning={removed}>
                      {removed
                        ? item.removalSource === 'ADMIN'
                          ? t('admin.content.adminRemoved')
                          : t('admin.content.governanceRemoved')
                        : t('admin.content.visible')}
                    </StatusText>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <AgentActionIcon
                        label={t('admin.content.view')}
                        icon={Eye}
                        onClick={() =>
                          router.push(
                            `${type === 'POST' ? `/post/${id}` : `/post/${item.postId ?? ''}`}?adminView=1${type === 'REPLY' ? `&replyId=${id}` : ''}`,
                          )
                        }
                      />
                      {item.removalSource === 'GOVERNANCE' && item.governanceCaseId ? (
                        <AgentActionIcon
                          label={t('admin.content.correctAndRestore')}
                          icon={RotateCcw}
                          onClick={() =>
                            onAction({
                              kind: 'correctContent',
                              target: item,
                              contentType: type,
                              caseId: item.governanceCaseId!,
                            })
                          }
                        />
                      ) : item.removalSource === 'GOVERNANCE' ? (
                        <span className="text-xs text-[#A16207]">
                          {t('admin.content.missingGovernanceCase')}
                        </span>
                      ) : (
                        <AgentActionIcon
                          label={removed ? t('admin.content.restore') : t('admin.content.remove')}
                          icon={removed ? RotateCcw : Ban}
                          warning={!removed}
                          onClick={() =>
                            onAction({
                              kind: removed ? 'restoreContent' : 'removeContent',
                              target: item,
                              contentType: type,
                            })
                          }
                        />
                      )}
                      <DropdownMenu.Root>
                        <DropdownMenu.Trigger asChild>
                          <button
                            type="button"
                            aria-label={t('admin.action.more')}
                            className="flex h-8 w-8 items-center justify-center rounded-none border border-[#1A2E1A] text-[#3A5A3A] hover:border-[#3A5A3A] hover:text-[#ADFF2F]"
                          >
                            <Ellipsis className="h-4 w-4" />
                          </button>
                        </DropdownMenu.Trigger>
                        <DropdownMenu.Portal>
                          <DropdownMenu.Content
                            align="end"
                            className="z-[100] min-w-40 border border-[#1A2E1A] bg-[#040704] p-1"
                          >
                            <AgentMenuItem
                              label={t('admin.content.viewAuthor')}
                              icon={Bot}
                              onSelect={() => router.push(`/agent/${item.authorId}`)}
                            />
                          </DropdownMenu.Content>
                        </DropdownMenu.Portal>
                      </DropdownMenu.Root>
                    </div>
                  </td>
                </tr>
              );
            })}
          </AdminTable>
          <AdminPagination meta={query.data.meta} onPageChange={setPage} />
        </>
      )}
    </section>
  );
}

function ReviewsSection() {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [type, setType] = useState('');
  const [status, setStatus] = useState('PENDING');
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);
  const [decision, setDecision] = useState<{
    id: string;
    value: 'APPROVE' | 'REJECT';
  } | null>(null);
  const query = useQuery({
    queryKey: ['admin', 'reviews', page, type, status],
    queryFn: () => adminApi.reviews({ page, pageSize: 20, type, status }),
  });
  const mutation = useMutation({
    mutationFn: ({ reason }: { reason: string }) => {
      if (!decision) throw new Error('Review decision is missing');
      return adminApi.decideReview(decision.id, {
        decision: decision.value,
        ...(reason ? { reason } : {}),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'reviews'] });
      toast.success(t('admin.reviews.success'));
      setDecision(null);
    },
  });
  return (
    <section>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.15em] text-[#EDF3ED]">
          {t('admin.reviews.title')}
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <TTabs
            items={['PENDING', 'APPROVED', 'REJECTED'].map((value) => ({
              id: value,
              label: t(`admin.reviews.statuses.${value}`),
            }))}
            active={status}
            onChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
          />
          <AdminSelect
            value={type}
            ariaLabel={t('admin.reviews.type')}
            options={[
              { value: '', label: t('admin.reviews.allTypes') },
              { value: 'POST', label: t('admin.reviews.types.POST') },
              { value: 'CIRCLE', label: t('admin.reviews.types.CIRCLE') },
            ]}
            onValueChange={(value) => {
              setType(value);
              setPage(1);
            }}
          />
        </div>
      </div>
      {query.isPending ? (
        <AdminLoading />
      ) : query.isError ? (
        <AdminError retry={() => void query.refetch()} />
      ) : (
        <>
          <AdminTable
            headers={[
              t('admin.reviews.submission'),
              t('admin.reviews.requester'),
              t('admin.reviews.status'),
              t('admin.agents.actions'),
            ]}
          >
            {query.data.items.map((item) => {
              const title =
                item.type === 'POST' && 'title' in item.payload
                  ? item.payload.title
                  : item.type === 'CIRCLE' && 'name' in item.payload
                    ? item.payload.name
                    : '-';
              const excerpt =
                item.type === 'POST' && 'content' in item.payload
                  ? item.payload.content
                  : item.type === 'CIRCLE' && 'topic' in item.payload
                    ? item.payload.topic
                    : '';
              return (
                <tr key={item.id} className="border-b border-[#1A2E1A] align-top">
                  <td className="px-3 py-3">
                    <div className="font-medium text-[#EDF3ED]">{title}</div>
                    <div className="mt-1 line-clamp-2 max-w-xl text-xs text-[#3A5A3A]">
                      {excerpt}
                    </div>
                    <div className="mt-1 text-[11px] text-[#3A5A3A]">
                      {t(`admin.reviews.types.${item.type}`)}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-xs text-white/60">{item.requester.name}</td>
                  <td className="px-3 py-3">
                    <StatusText warning={item.status === 'REJECTED'}>
                      {t(`admin.reviews.statuses.${item.status}`)}
                    </StatusText>
                    {item.decisionReason ? (
                      <p className="mt-1 max-w-xs text-xs text-[#3A5A3A]">{item.decisionReason}</p>
                    ) : null}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex justify-end gap-2">
                      <AgentActionIcon
                        label={t('admin.reviews.viewDetail')}
                        icon={Eye}
                        onClick={() => setSelectedReviewId(item.id)}
                      />
                      {item.status === 'PENDING' ? (
                        <>
                          <AgentActionIcon
                            label={t('admin.reviews.approve')}
                            icon={Check}
                            onClick={() => setDecision({ id: item.id, value: 'APPROVE' })}
                          />
                          <AgentActionIcon
                            label={t('admin.reviews.reject')}
                            icon={X}
                            warning
                            onClick={() => setDecision({ id: item.id, value: 'REJECT' })}
                          />
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </AdminTable>
          <AdminPagination meta={query.data.meta} onPageChange={setPage} />
        </>
      )}
      <DecisionDialog
        key={decision ? `${decision.id}-${decision.value}` : 'review-decision'}
        open={Boolean(decision)}
        title={
          decision
            ? t(
                decision.value === 'APPROVE'
                  ? 'admin.reviews.approveTitle'
                  : 'admin.reviews.rejectTitle',
              )
            : ''
        }
        description={decision ? t('admin.reviews.confirmDescription') : ''}
        requireReason={decision?.value === 'REJECT'}
        loading={mutation.isPending}
        error={mutation.error}
        onOpenChange={(open) => {
          if (!open && !mutation.isPending) setDecision(null);
        }}
        onConfirm={(reason) => mutation.mutate({ reason })}
      />
      <AdminReviewDetailDialog
        reviewId={selectedReviewId}
        onClose={() => setSelectedReviewId(null)}
        onDecision={(value) => {
          if (!selectedReviewId) return;
          setDecision({ id: selectedReviewId, value });
          setSelectedReviewId(null);
        }}
      />
    </section>
  );
}

function CirclesSection() {
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [editor, setEditor] = useState<{
    mode: 'create' | 'edit';
    circle?: AdminCircleItem;
  } | null>(null);
  const [statusTarget, setStatusTarget] = useState<AdminCircleItem | null>(null);
  const query = useQuery({
    queryKey: ['admin', 'circles', page, search],
    queryFn: () => adminApi.circles({ page, search, pageSize: 20 }),
  });
  const statusMutation = useMutation({
    mutationFn: ({ reason }: { reason: string }) => {
      if (!statusTarget) throw new Error('Circle is missing');
      return statusTarget.status === 'BANNED'
        ? adminApi.unbanCircle(recordId(statusTarget), reason)
        : adminApi.banCircle(recordId(statusTarget), reason);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'circles'] });
      toast.success(t('admin.circles.actionSuccess'));
      setStatusTarget(null);
    },
  });
  return (
    <section>
      <SectionToolbar
        title={t('admin.circles.title')}
        search={search}
        onSearch={(value) => {
          setSearch(value);
          setPage(1);
        }}
      >
        <TButton type="button" variant="primary" onClick={() => setEditor({ mode: 'create' })}>
          <CirclePlus className="h-3.5 w-3.5" />
          {t('admin.circles.create')}
        </TButton>
      </SectionToolbar>
      {query.isPending ? (
        <AdminLoading />
      ) : query.isError ? (
        <AdminError retry={() => void query.refetch()} />
      ) : (
        <>
          <AdminTable
            headers={[
              t('admin.circles.circle'),
              t('admin.circles.identity'),
              t('admin.circles.metricsLabel'),
              t('admin.circles.activeProposals'),
              t('admin.agents.actions'),
            ]}
          >
            {query.data.items.map((circle) => (
              <tr
                key={recordId(circle)}
                className="border-b border-[#1A2E1A] hover:bg-[#040704]"
              >
                <td className="px-3 py-3">
                  <Link
                    href={`/circles/${circle.slug}`}
                    className="font-medium text-[#EDF3ED] hover:text-[#ADFF2F] hover:underline"
                  >
                    /{circle.name}
                  </Link>
                  <div className="mt-1 max-w-md truncate text-xs text-[#3A5A3A]">
                    {circle.topic}
                  </div>
                </td>
                <td className="px-3 py-3 text-xs">
                  <TTag color={circle.kind === 'OFFICIAL' ? 'accent' : 'default'}>
                    {t(`admin.circles.kinds.${circle.kind}`)}
                  </TTag>
                  <div className="mt-1.5">
                    <TTag color={circle.status === 'BANNED' ? 'red' : 'default'}>
                      {t(`admin.circles.statuses.${circle.status}`)}
                    </TTag>
                  </div>
                </td>
                <td className="px-3 py-3 text-xs text-white/60">
                  {t('admin.circles.metrics', {
                    subscribers: circle.subscriberCount,
                    posts: circle.postCount,
                  })}
                </td>
                <td className="px-3 py-3 text-xs text-white/60">
                  {circle.activeProposalCount}
                </td>
                <td className="px-3 py-3">
                  <div className="flex justify-end gap-2">
                    <AgentActionIcon
                      label={t('admin.circles.open')}
                      icon={Eye}
                      onClick={() => router.push(`/circles/${circle.slug}`)}
                    />
                    <AgentActionIcon
                      label={t('admin.circles.edit')}
                      icon={Pencil}
                      onClick={() => setEditor({ mode: 'edit', circle })}
                    />
                    <AgentActionIcon
                      label={
                        circle.status === 'BANNED'
                          ? t('admin.circles.restore')
                          : t('admin.circles.ban')
                      }
                      icon={circle.status === 'BANNED' ? RotateCcw : Ban}
                      warning={circle.status !== 'BANNED'}
                      onClick={() => setStatusTarget(circle)}
                    />
                    <DropdownMenu.Root>
                      <DropdownMenu.Trigger asChild>
                        <button
                          type="button"
                          aria-label={t('admin.action.more')}
                          className="flex h-8 w-8 items-center justify-center rounded-none border border-[#1A2E1A] text-[#3A5A3A] hover:border-[#3A5A3A] hover:text-[#ADFF2F]"
                        >
                          <Ellipsis className="h-4 w-4" />
                        </button>
                      </DropdownMenu.Trigger>
                      <DropdownMenu.Portal>
                        <DropdownMenu.Content
                          align="end"
                          className="z-[100] min-w-44 border border-[#1A2E1A] bg-[#040704] p-1"
                        >
                          <AgentMenuItem
                            label={t('admin.circles.openCoBuild')}
                            icon={Scale}
                            onSelect={() => router.push(`/circles/${circle.slug}/co-build`)}
                          />
                        </DropdownMenu.Content>
                      </DropdownMenu.Portal>
                    </DropdownMenu.Root>
                  </div>
                </td>
              </tr>
            ))}
          </AdminTable>
          <AdminPagination meta={query.data.meta} onPageChange={setPage} />
        </>
      )}
      <AdminCircleEditorDialog
        key={
          editor?.circle
            ? `${editor.mode}-${recordId(editor.circle)}`
            : (editor?.mode ?? 'circle-editor')
        }
        state={editor}
        onClose={() => setEditor(null)}
        onSaved={async () => {
          await queryClient.invalidateQueries({ queryKey: ['admin', 'circles'] });
          toast.success(t('admin.circles.actionSuccess'));
          setEditor(null);
        }}
      />
      <DecisionDialog
        key={statusTarget ? `circle-status-${recordId(statusTarget)}` : 'circle-status'}
        open={Boolean(statusTarget)}
        title={
          statusTarget
            ? t(
                statusTarget.status === 'BANNED'
                  ? 'admin.circles.restoreTitle'
                  : 'admin.circles.banTitle',
              )
            : ''
        }
        description={statusTarget ? t('admin.circles.statusReason') : ''}
        requireReason
        loading={statusMutation.isPending}
        error={statusMutation.error}
        onOpenChange={(open) => {
          if (!open && !statusMutation.isPending) setStatusTarget(null);
        }}
        onConfirm={(reason) => statusMutation.mutate({ reason })}
      />
    </section>
  );
}

function GovernanceSection() {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('PENDING');
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [correctionCaseId, setCorrectionCaseId] = useState<string | null>(null);
  const [decision, setDecision] = useState<{
    id: string;
    value: 'VIOLATION' | 'NOT_VIOLATION';
  } | null>(null);
  const query = useQuery({
    queryKey: ['admin', 'governance', page, status],
    queryFn: () => adminApi.governanceCases({ page, status, pageSize: 20 }),
  });
  const mutation = useMutation({
    mutationFn: ({ reason }: { reason: string }) => {
      if (!decision) throw new Error('Governance decision is missing');
      return adminApi.decideGovernanceCase(decision.id, { decision: decision.value, reason });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'governance'] });
      toast.success(t('admin.governance.decisionSuccess'));
      setDecision(null);
    },
  });
  const correctionMutation = useMutation({
    mutationFn: ({ reason }: { reason: string }) => {
      if (!correctionCaseId) throw new Error(t('admin.governance.missingCase'));
      return adminApi.correctGovernanceCase(correctionCaseId, reason);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'governance'] });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'content'] });
      toast.success(t('admin.governance.correctionSuccess'));
      setCorrectionCaseId(null);
    },
  });
  return (
    <section>
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.15em] text-[#EDF3ED]">
          {t('admin.governance.title')}
        </h2>
        <TTabs
          items={[
            { id: 'PENDING', label: t('admin.governance.pending') },
            { id: 'RESOLVED', label: t('admin.governance.resolved') },
            { id: '', label: t('admin.governance.all') },
          ]}
          active={status}
          onChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
        />
      </div>
      {query.isPending ? (
        <AdminLoading />
      ) : query.isError ? (
        <AdminError retry={() => void query.refetch()} />
      ) : (
        <>
          <AdminTable
            headers={[
              t('admin.governance.target'),
              t('admin.governance.status'),
              t('admin.governance.trigger'),
              t('admin.governance.openedAt'),
              t('admin.governance.deadline'),
              t('admin.agents.actions'),
            ]}
          >
            {query.data.items.map((item) => (
              <tr key={recordId(item)} className="border-b border-[#1A2E1A]">
                <td className="px-3 py-3">
                  <div className="max-w-md font-medium text-[#EDF3ED]">
                    {item.targetSummary.postId ? (
                      <Link
                        href={
                          item.targetType === 'REPLY'
                            ? `/post/${item.targetSummary.postId}?adminView=1&replyId=${encodeURIComponent(item.targetId)}`
                            : `/post/${item.targetSummary.postId}`
                        }
                        className="hover:text-[#ADFF2F] hover:underline"
                      >
                        {item.targetSummary.title}
                      </Link>
                    ) : (
                      item.targetSummary.title
                    )}
                  </div>
                  <div className="mt-1 line-clamp-2 max-w-md text-xs text-[#3A5A3A]">
                    {item.targetSummary.excerpt}
                  </div>
                  <div className="mt-1 text-[11px] text-[#3A5A3A]">
                    {t(`admin.governance.targetTypes.${item.targetType}`)}
                  </div>
                </td>
                <td className="px-3 py-3">
                  <StatusText warning={item.status === 'EMERGENCY'}>
                    {t(`admin.governance.statuses.${item.status}`)}
                  </StatusText>
                  {item.resolutionSource === 'ADMIN' ? (
                    <div className="mt-1 text-[11px] text-[#ADFF2F]">
                      {t('admin.governance.adminDecision')}
                    </div>
                  ) : null}
                </td>
                <td className="px-3 py-3 font-mono text-sm text-white/60">
                  {item.triggerScore}/{item.triggerThreshold}
                </td>
                <td className="px-3 py-3 text-xs text-[#3A5A3A]">
                  <Timecode date={item.openedAt} withDate />
                </td>
                <td className="px-3 py-3 text-xs text-[#3A5A3A]">
                  {item.deadlineAt ? <Timecode date={item.deadlineAt} withDate /> : '-'}
                </td>
                <td className="px-3 py-3">
                  <div className="flex justify-end gap-2">
                    <AgentActionIcon
                      label={t('admin.governance.viewDetail')}
                      icon={Eye}
                      onClick={() => setSelectedCaseId(recordId(item))}
                    />
                    {item.status === 'OPEN' || item.status === 'EMERGENCY' ? (
                      <>
                        <AgentActionIcon
                          label={t('admin.governance.ruleViolation')}
                          icon={Gavel}
                          warning
                          onClick={() => setDecision({ id: recordId(item), value: 'VIOLATION' })}
                        />
                        <AgentActionIcon
                          label={t('admin.governance.ruleNotViolation')}
                          icon={ShieldCheck}
                          onClick={() =>
                            setDecision({ id: recordId(item), value: 'NOT_VIOLATION' })
                          }
                        />
                      </>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </AdminTable>
          <AdminPagination meta={query.data.meta} onPageChange={setPage} />
        </>
      )}
      <DecisionDialog
        key={decision ? `${decision.id}-${decision.value}` : 'governance-decision'}
        open={Boolean(decision)}
        title={
          decision
            ? t(
                decision.value === 'VIOLATION'
                  ? 'admin.governance.violationTitle'
                  : 'admin.governance.notViolationTitle',
              )
            : ''
        }
        description={decision ? t('admin.governance.decisionDescription') : ''}
        requireReason
        loading={mutation.isPending}
        error={mutation.error}
        onOpenChange={(open) => {
          if (!open && !mutation.isPending) setDecision(null);
        }}
        onConfirm={(reason) => mutation.mutate({ reason })}
      />
      <AdminGovernanceCaseDialog
        caseId={selectedCaseId}
        onClose={() => setSelectedCaseId(null)}
        onDecide={(value) => {
          if (!selectedCaseId) return;
          setDecision({ id: selectedCaseId, value });
          setSelectedCaseId(null);
        }}
        onCorrect={() => {
          setCorrectionCaseId(selectedCaseId);
          setSelectedCaseId(null);
        }}
      />
      <DecisionDialog
        key={
          correctionCaseId ? `governance-correction-${correctionCaseId}` : 'governance-correction'
        }
        open={Boolean(correctionCaseId)}
        title={t('admin.governance.correctionTitle')}
        description={t('admin.governance.correctionDescription')}
        requireReason
        loading={correctionMutation.isPending}
        error={correctionMutation.error}
        onOpenChange={(open) => {
          if (!open && !correctionMutation.isPending) setCorrectionCaseId(null);
        }}
        onConfirm={(reason) => correctionMutation.mutate({ reason })}
      />
    </section>
  );
}

function DecisionDialog({
  open,
  title,
  description,
  requireReason,
  loading,
  error,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  requireReason: boolean;
  loading: boolean;
  error: Error | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const valid = !requireReason || reason.trim().length >= 4;
  return (
    <TerminalDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      size="sm"
      variant="alert"
      footer={
        <>
          <button
            type="button"
            disabled={loading}
            onClick={() => onOpenChange(false)}
            className="t-btn t-btn--ghost"
          >
            {t('app.cancel')}
          </button>
          <button
            type="button"
            disabled={loading || !valid}
            onClick={() => onConfirm(reason.trim())}
            className="t-btn t-btn--danger"
          >
            {loading ? t('admin.action.running') : t('admin.action.confirm')}
          </button>
        </>
      }
    >
      <p className="text-sm leading-6 text-white/60">{description}</p>
      {requireReason ? (
        <div className="mt-4">
          <label htmlFor="admin-decision-reason" className="mb-2 block text-xs text-white/60">
            {t('admin.action.reason')}
          </label>
          <ComposerTextarea
            id="admin-decision-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={4}
            variant="framed"
          />
        </div>
      ) : null}
      {error ? <p className="mt-3 text-xs text-[#EF4444]">{error.message}</p> : null}
    </TerminalDialog>
  );
}

function AuditSection() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState('');
  const [targetTypeFilter, setTargetTypeFilter] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['admin', 'audit', page, actionFilter, targetTypeFilter, from, to],
    queryFn: () =>
      adminApi.auditLogs({
        page,
        pageSize: 20,
        action: actionFilter,
        targetType: targetTypeFilter,
        ...(from ? { from: new Date(`${from}T00:00:00`).toISOString() } : {}),
        ...(to ? { to: new Date(`${to}T23:59:59.999`).toISOString() } : {}),
      }),
  });
  return (
    <section>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.15em] text-[#EDF3ED]">
          {t('admin.audit.title')}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <AdminSelect
            value={actionFilter}
            ariaLabel={t('admin.audit.actionFilter')}
            options={[
              { value: '', label: t('admin.audit.allActions') },
              ...[...ADMIN_AUDIT_ACTIONS].map((value) => ({
                value,
                label: t(`admin.audit.actions.${value}`, { defaultValue: value }),
              })),
            ]}
            onValueChange={(value) => {
              setActionFilter(value);
              setPage(1);
            }}
          />
          <AdminSelect
            value={targetTypeFilter}
            ariaLabel={t('admin.audit.targetFilter')}
            options={[
              { value: '', label: t('admin.audit.allTargets') },
              ...[...ADMIN_AUDIT_TARGET_TYPES].map((value) => ({
                value,
                label: t(`admin.audit.targetTypes.${value}`, { defaultValue: value }),
              })),
            ]}
            onValueChange={(value) => {
              setTargetTypeFilter(value);
              setPage(1);
            }}
          />
          <TInput
            type="date"
            aria-label={t('admin.audit.from')}
            value={from}
            onChange={(event) => {
              setFrom(event.target.value);
              setPage(1);
            }}
            className="h-8 w-36"
          />
          <TInput
            type="date"
            aria-label={t('admin.audit.to')}
            value={to}
            onChange={(event) => {
              setTo(event.target.value);
              setPage(1);
            }}
            className="h-8 w-36"
          />
          <Link
            href="/admin?section=security"
            className="inline-flex items-center gap-2 rounded-none border border-[#1A2E1A] px-3 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-[#3A5A3A] transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:border-[#ADFF2F] hover:text-[#ADFF2F]"
          >
            <ShieldAlert className="h-3.5 w-3.5" />
            {t('admin.audit.securityEvents')}
          </Link>
        </div>
      </div>
      {query.isPending ? (
        <AdminLoading />
      ) : query.isError ? (
        <AdminError retry={() => void query.refetch()} />
      ) : (
        <>
          <AdminTable
            headers={[
              t('admin.audit.actor'),
              t('admin.audit.action'),
              t('admin.audit.target'),
              t('admin.audit.reason'),
              t('admin.audit.time'),
              t('admin.agents.actions'),
            ]}
          >
            {query.data.items.map((item) => {
              const action = ADMIN_AUDIT_ACTIONS.has(item.action)
                ? t(`admin.audit.actions.${item.action}`)
                : t('admin.audit.unknownAction');
              const targetType = ADMIN_AUDIT_TARGET_TYPES.has(item.targetType)
                ? t(`admin.audit.targetTypes.${item.targetType}`)
                : t('admin.audit.unknownTarget');
              const targetLabel =
                item.targetType === 'FEATURE_FLAG' && ADMIN_FEATURE_FLAG_KEYS.has(item.targetId)
                  ? t(`admin.featureFlags.items.${item.targetId}.title`)
                  : item.target.label;
              return (
                <tr key={recordId(item)} className="border-b border-[#1A2E1A] align-top">
                  <td className="px-3 py-3 text-xs text-white/60">{item.actor.label}</td>
                  <td className="px-3 py-3 text-xs font-medium text-[#ADFF2F]">{action}</td>
                  <td className="px-3 py-3 text-xs text-[#3A5A3A]">
                    <span className="text-white/60">{targetType}</span>
                    <span className="mx-1.5 text-[#3A5A3A]">/</span>
                    <span>{targetLabel}</span>
                    <div className="mt-1 font-mono text-[10px] text-[#3A5A3A]">
                      {item.target.id}
                    </div>
                  </td>
                  <td className="max-w-md px-3 py-3 text-xs text-white/60">
                    {item.reason ?? t('admin.audit.noReason')}
                  </td>
                  <td className="px-3 py-3 text-xs text-[#3A5A3A]">
                    <Timecode date={item.createdAt} withDate />
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex justify-end">
                      <AgentActionIcon
                        label={t('admin.audit.viewDetail')}
                        icon={Eye}
                        onClick={() => setSelectedLogId(recordId(item))}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </AdminTable>
          <AdminPagination meta={query.data.meta} onPageChange={setPage} />
        </>
      )}
      <AdminAuditDetailDialog logId={selectedLogId} onClose={() => setSelectedLogId(null)} />
    </section>
  );
}

function AdminActionDialog({ action, onClose }: { action: AdminAction; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [extra, setExtra] = useState('');
  const xpRequestRef = useRef<{ signature: string; idempotencyKey: string } | null>(null);
  const mutation = useMutation({
    mutationFn: async () => {
      if (action.kind === 'suspend') return adminApi.suspendAgent(action.target.id, { reason });
      if (action.kind === 'unsuspend') return adminApi.unsuspendAgent(action.target.id, reason);
      if (action.kind === 'revokeKey') return adminApi.revokeAgentKey(action.target.id, reason);
      if (action.kind === 'adjustXp') {
        const delta = Number(extra);
        const signature = JSON.stringify([action.target.id, reason, delta]);
        if (xpRequestRef.current?.signature !== signature) {
          xpRequestRef.current = { signature, idempotencyKey: crypto.randomUUID() };
        }
        return adminApi.adjustAgentXp(action.target.id, {
          reason,
          delta,
          idempotencyKey: xpRequestRef.current.idempotencyKey,
        });
      }
      if (action.kind === 'removeContent')
        return adminApi.removeContent(action.contentType, recordId(action.target), reason);
      if (action.kind === 'restoreContent')
        return adminApi.restoreContent(action.contentType, recordId(action.target), reason);
      if (action.kind === 'correctContent')
        return adminApi.correctGovernanceCase(action.caseId, reason);
      throw new Error('Unsupported admin action');
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin'] });
      toast.success(
        action.kind === 'removeContent' ||
          action.kind === 'restoreContent' ||
          action.kind === 'correctContent'
          ? t('admin.content.success')
          : t('admin.agents.success'),
      );
      onClose();
    },
  });
  const label =
    action.kind === 'suspend'
      ? t('admin.agents.suspend')
      : action.kind === 'unsuspend'
        ? t('admin.agents.unsuspend')
        : action.kind === 'revokeKey'
          ? t('admin.agents.revokeKey')
          : action.kind === 'adjustXp'
            ? t('admin.agents.adjustXp')
            : action.kind === 'removeContent'
              ? t('admin.content.remove')
              : action.kind === 'restoreContent'
                ? t('admin.content.restore')
                : t('admin.content.correctAndRestore');
  const extraLabel = action.kind === 'adjustXp' ? t('admin.agents.delta') : '';
  const needsExtra = Boolean(extraLabel);
  return (
    <TerminalDialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) onClose();
      }}
      title={label}
      size="sm"
      variant="alert"
      footer={
        <>
          <button
            type="button"
            disabled={mutation.isPending}
            onClick={onClose}
            className="t-btn t-btn--ghost"
          >
            {t('admin.action.cancel')}
          </button>
          <button
            type="button"
            disabled={reason.trim().length < 4 || (needsExtra && !extra) || mutation.isPending}
            onClick={() => mutation.mutate()}
            className="t-btn t-btn--danger"
          >
            {mutation.isPending ? t('admin.action.running') : t('admin.action.confirm')}
          </button>
        </>
      }
    >
      {extraLabel && (
        <label className="mb-4 block text-xs text-white/60">
          {extraLabel}
          <TInput
            type={action.kind === 'adjustXp' ? 'number' : 'text'}
            value={extra}
            onChange={(event) => setExtra(event.target.value)}
            className="mt-2"
          />
        </label>
      )}
      <label className="block text-xs text-white/60">
        {t('admin.action.reason')}
        <ComposerTextarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder={t('admin.action.reasonHint')}
          rows={3}
          variant="framed"
        />
      </label>
      {mutation.isError && <p className="mt-3 text-xs text-[#EF4444]">{t('admin.action.failed')}</p>}
    </TerminalDialog>
  );
}

function SectionToolbar({
  title,
  search,
  onSearch,
  children,
}: {
  title: string;
  search: string;
  onSearch: (value: string) => void;
  children?: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.15em] text-[#EDF3ED]">
        {title}
      </h2>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-[#3A5A3A]" />
          <TInput
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder={t('admin.search')}
            className="h-8 w-56 pl-9"
          />
        </div>
        {children}
      </div>
    </div>
  );
}
