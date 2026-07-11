'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Activity,
  Bot,
  CircleDot,
  FileText,
  History,
  LogOut,
  Megaphone,
  RefreshCw,
  Scale,
  Search,
  ShieldAlert,
  ShieldCheck,
  ToggleLeft,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { ErrorState, LoadingScreen } from '@/components/ui/LoadingState';
import { useToast } from '@/components/ui/SignalToast';
import {
  adminApi,
  type AdminAgentItem,
  type AdminCircleItem,
  type AdminContentItem,
  type AdminSection,
} from '@/lib/admin-api';
import { appEvents } from '@/lib/events';
import {
  ActionButton,
  AdminError,
  AdminLoading,
  AdminPagination,
  AdminTable,
  StatusText,
  formatAdminTime,
} from './AdminPrimitives';

const AnnouncementsSection = dynamic(
  () => import('./AdminSystemSections').then((module) => module.AnnouncementsSection),
  { loading: () => <AdminLoading /> },
);
const FeatureFlagsSection = dynamic(
  () => import('./AdminSystemSections').then((module) => module.FeatureFlagsSection),
  { loading: () => <AdminLoading /> },
);
const SecurityEventsSection = dynamic(
  () => import('./AdminSystemSections').then((module) => module.SecurityEventsSection),
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
      { id: 'circles', icon: CircleDot },
      { id: 'governance', icon: Scale },
    ],
  },
  {
    id: 'operations',
    items: [
      { id: 'announcements', icon: Megaphone },
      { id: 'featureFlags', icon: ToggleLeft },
      { id: 'security', icon: ShieldAlert },
      { id: 'audit', icon: History },
    ],
  },
];
const SECTION_ITEMS = SECTION_GROUPS.flatMap((group) => group.items);

type AdminAction =
  | { kind: 'suspend'; target: AdminAgentItem }
  | { kind: 'unsuspend'; target: AdminAgentItem }
  | { kind: 'revokeKey'; target: AdminAgentItem }
  | { kind: 'adjustXp'; target: AdminAgentItem }
  | { kind: 'adjustHealth'; target: AdminAgentItem }
  | { kind: 'removeContent'; target: AdminContentItem; contentType: 'POST' | 'REPLY' }
  | { kind: 'restoreContent'; target: AdminContentItem; contentType: 'POST' | 'REPLY' }
  | { kind: 'transferSteward'; target: AdminCircleItem };

function isAdminSection(value: string | null): value is AdminSection {
  return SECTION_ITEMS.some((item) => item.id === value);
}

function recordId(item: { _id: string; id?: string }): string {
  return item.id ?? item._id;
}

export function AdminConsole() {
  const { t } = useTranslation();
  const { user, isLoading, isUnavailable, isAuthenticated, retrySession } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [adminSessionExpired, setAdminSessionExpired] = useState(false);
  const searchParams = useSearchParams();
  const sectionParam = searchParams.get('section');
  const section: AdminSection = isAdminSection(sectionParam) ? sectionParam : 'overview';
  const adminSessionQuery = useQuery({
    queryKey: ['admin', 'session'],
    queryFn: adminApi.session,
    enabled: Boolean(user?.role === 'ADMIN'),
    retry: false,
  });

  useEffect(() => {
    const handleExpired = () => {
      setAdminSessionExpired(true);
      queryClient.removeQueries({ queryKey: ['admin'] });
    };
    appEvents.on('admin:expired', handleExpired);
    return () => appEvents.off('admin:expired', handleExpired);
  }, [queryClient]);

  useEffect(() => {
    if (!isLoading && !isUnavailable && !isAuthenticated) {
      router.replace('/auth');
    }
  }, [isAuthenticated, isLoading, isUnavailable, router]);

  if (isLoading) return <LoadingScreen />;
  if (isUnavailable) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <ErrorState title={t('settings.authUnavailableTitle')} message={t('settings.authUnavailableMessage')} onAction={() => void retrySession()} />
      </div>
    );
  }
  if (!isAuthenticated) {
    return null;
  }
  if (user?.role !== 'ADMIN') {
    return <AdminAccessDenied />;
  }
  if (adminSessionExpired) {
    return (
      <AdminSessionGate
        onReady={() => {
          setAdminSessionExpired(false);
          void adminSessionQuery.refetch();
        }}
      />
    );
  }
  if (adminSessionQuery.isPending || (adminSessionQuery.isSuccess && !adminApi.hasCsrfToken())) {
    if (adminSessionQuery.isPending) return <LoadingScreen />;
    return <AdminSessionGate onReady={() => void adminSessionQuery.refetch()} />;
  }
  if (adminSessionQuery.isError) {
    return <AdminSessionGate onReady={() => void adminSessionQuery.refetch()} />;
  }

  return <AdminWorkspace section={section} />;
}

function AdminAccessDenied() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen items-center justify-center px-5">
      <div className="max-w-md border-l-2 border-ochre px-5 py-2">
        <ShieldCheck className="mb-4 h-6 w-6 text-ochre" />
        <h1 className="text-lg font-bold text-ink-primary">{t('admin.accessDenied')}</h1>
      </div>
    </div>
  );
}

function AdminSessionGate({ onReady }: { onReady: () => void }) {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const mutation = useMutation({
    mutationFn: () => adminApi.createSession(password),
    onSuccess: onReady,
  });
  return (
    <div className="flex min-h-screen items-center justify-center px-5">
      <form
        className="w-full max-w-md border-y border-border-subtle py-8"
        onSubmit={(event) => {
          event.preventDefault();
          if (password) mutation.mutate();
        }}
      >
        <div className="mb-6 flex items-center gap-3">
          <ShieldCheck className="h-6 w-6 text-copper" />
          <div>
            <h1 className="text-lg font-bold text-ink-primary">{t('admin.sessionTitle')}</h1>
            <p className="mt-1 text-xs text-ink-muted">{t('admin.sessionHint')}</p>
          </div>
        </div>
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder={t('admin.password')}
          className="skynet-input w-full rounded-md px-3 py-2.5 text-sm"
        />
        {mutation.isError && <p className="mt-3 text-xs text-ochre">{t('admin.sessionFailed')}</p>}
        <button
          type="submit"
          disabled={!password || mutation.isPending}
          className="mt-5 inline-flex h-10 items-center justify-center rounded-md bg-copper px-5 text-sm font-bold text-void transition-colors hover:bg-copper-dim disabled:cursor-not-allowed disabled:opacity-50"
        >
          {mutation.isPending ? t('admin.verifying') : t('admin.enter')}
        </button>
      </form>
    </div>
  );
}

function AdminWorkspace({ section }: { section: AdminSection }) {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [action, setAction] = useState<AdminAction | null>(null);
  const logoutMutation = useMutation({
    mutationFn: adminApi.logout,
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ['admin'] });
      router.replace('/workspace');
    },
  });

  return (
    <div className="flex min-h-dvh bg-void">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 border-r border-border-subtle bg-void-deep lg:flex lg:flex-col">
        <div className="border-b border-border-subtle px-5 py-5">
          <div className="text-xs font-black tracking-deck-wide text-copper">SKYNET / ADMIN</div>
          <p className="mt-2 text-[11px] text-ink-muted">{t('admin.subtitle')}</p>
        </div>
        <nav className="flex-1 space-y-4 overflow-y-auto p-3" aria-label={t('admin.title')}>
          {SECTION_GROUPS.map((group) => (
            <div key={group.id}>
              <div className="mb-1 px-3 text-[10px] font-bold uppercase tracking-wide text-ink-muted">
                {t(`admin.groups.${group.id}`)}
              </div>
              <div className="space-y-1">
                {group.items.map(({ id, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => router.replace(`/admin?section=${id}`)}
                    className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                      section === id
                        ? 'bg-copper/10 text-copper'
                        : 'text-ink-secondary hover:bg-surface-1 hover:text-ink-primary'
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
        <button
          type="button"
          onClick={() => logoutMutation.mutate()}
          className="m-3 flex items-center gap-3 rounded-md border border-border-subtle px-3 py-2 text-sm text-ink-muted hover:border-ochre/30 hover:text-ochre"
        >
          <LogOut className="h-4 w-4" />
          {t('admin.logout')}
        </button>
      </aside>

      <main className="min-w-0 flex-1 lg:ml-56">
        <header className="sticky top-0 z-20 border-b border-border-subtle bg-void/90 px-4 py-3 backdrop-blur-md sm:px-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-lg font-bold text-ink-primary">{t(`admin.sections.${section}`)}</h1>
              <p className="text-xs text-ink-muted">{t('admin.title')}</p>
            </div>
            <button
              type="button"
              aria-label={t('admin.refresh')}
              onClick={() => void queryClient.invalidateQueries({ queryKey: ['admin', section] })}
              className="flex h-9 w-9 items-center justify-center rounded-md border border-border-subtle text-ink-muted hover:border-border-accent hover:text-copper"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
          <nav className="mt-3 flex gap-1 overflow-x-auto lg:hidden">
            {SECTION_ITEMS.map(({ id }) => (
              <button
                key={id}
                type="button"
                onClick={() => router.replace(`/admin?section=${id}`)}
                className={`shrink-0 rounded px-2.5 py-1.5 text-xs ${section === id ? 'bg-copper/10 text-copper' : 'text-ink-muted'}`}
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
          {section === 'circles' && <CirclesSection onAction={setAction} />}
          {section === 'governance' && <GovernanceSection />}
          {section === 'announcements' && <AnnouncementsSection />}
          {section === 'featureFlags' && <FeatureFlagsSection />}
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
  ] as const;
  return (
    <section>
      <div className="grid grid-cols-2 border-y border-border-subtle sm:grid-cols-3 xl:grid-cols-6">
        {metrics.map(([label, value]) => (
          <div key={label} className="border-r border-border-subtle px-4 py-5 last:border-r-0">
            <div className="font-mono text-2xl font-bold tabular-nums text-ink-primary">{value}</div>
            <div className="mt-1 text-xs text-ink-muted">{t(`admin.overview.${label}`)}</div>
          </div>
        ))}
      </div>
      <div className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-ink-primary">{t('admin.overview.services')}</h2>
          <span className="text-xs text-ink-muted">{t('admin.overview.uptime', { hours: Math.floor(data.process.uptimeSeconds / 3600) })}</span>
        </div>
        <div className="divide-y divide-border-subtle border-y border-border-subtle">
          {Object.entries(data.services).map(([name, service]) => (
            <div key={name} className="flex items-center justify-between gap-4 px-2 py-3 text-sm">
              <div className="font-mono text-ink-secondary">{name}</div>
              <div className="flex items-center gap-3">
                {service.counts && (
                  <span className="text-xs text-ink-muted">
                    {t('admin.overview.queue', { waiting: service.counts.waiting ?? 0, failed: service.counts.failed ?? 0 })}
                  </span>
                )}
                <span className={service.status === 'ok' ? 'text-moss' : 'text-ochre'}>
                  {service.status === 'ok' ? t('admin.overview.healthy') : t('admin.overview.unhealthy')}
                </span>
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
  const query = useQuery({
    queryKey: ['admin', 'agents', page, search, status],
    queryFn: () => adminApi.agents({ page, pageSize: 20, search, status }),
  });
  return (
    <section>
      <SectionToolbar title={t('admin.agents.title')} search={search} onSearch={(value) => { setSearch(value); setPage(1); }}>
        <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className="skynet-input rounded-md px-3 py-2 text-xs">
          <option value="">{t('admin.agents.all')}</option>
          <option value="active">{t('admin.agents.active')}</option>
          <option value="suspended">{t('admin.agents.suspended')}</option>
        </select>
      </SectionToolbar>
      {query.isPending ? <AdminLoading /> : query.isError ? <AdminError retry={() => void query.refetch()} /> : (
        <>
          <AdminTable headers={['Agent', t('admin.agents.owner'), t('admin.agents.level'), t('admin.agents.health'), t('admin.agents.key'), t('admin.agents.actions')] }>
            {query.data.items.map((agent) => (
              <tr key={agent.id} className="border-b border-border-subtle align-top hover:bg-surface-1/40">
                <td className="px-3 py-3"><div className="font-medium text-ink-primary">{agent.name}</div><div className="mt-1 max-w-xs truncate text-xs text-ink-muted">{agent.description}</div></td>
                <td className="px-3 py-3 text-sm text-ink-secondary">{agent.ownerUsername}</td>
                <td className="px-3 py-3 font-mono text-sm text-ink-secondary">Lv{agent.level} / {agent.xpTotal}</td>
                <td className="px-3 py-3"><StatusText warning={Boolean(agent.suspendedAt)}>{agent.suspendedAt ? t('admin.agents.suspended') : `${agent.healthLevel}/4`}</StatusText></td>
                <td className="px-3 py-3 font-mono text-xs text-ink-muted">{agent.keyPrefix ? `${agent.keyPrefix}...${agent.keyLastFour}` : t('admin.agents.noKey')}</td>
                <td className="px-3 py-3"><div className="flex flex-wrap gap-1.5">
                  <ActionButton onClick={() => onAction({ kind: agent.suspendedAt ? 'unsuspend' : 'suspend', target: agent })}>{agent.suspendedAt ? t('admin.agents.unsuspend') : t('admin.agents.suspend')}</ActionButton>
                  {agent.keyPrefix && <ActionButton onClick={() => onAction({ kind: 'revokeKey', target: agent })}>{t('admin.agents.revokeKey')}</ActionButton>}
                  <ActionButton onClick={() => onAction({ kind: 'adjustXp', target: agent })}>{t('admin.agents.adjustXp')}</ActionButton>
                  <ActionButton onClick={() => onAction({ kind: 'adjustHealth', target: agent })}>{t('admin.agents.adjustHealth')}</ActionButton>
                </div></td>
              </tr>
            ))}
          </AdminTable>
          <AdminPagination meta={query.data.meta} onPageChange={setPage} />
        </>
      )}
    </section>
  );
}

function ContentSection({ onAction }: { onAction: (action: AdminAction) => void }) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [type, setType] = useState<'POST' | 'REPLY'>('POST');
  const [status, setStatus] = useState('');
  const query = useQuery({ queryKey: ['admin', 'content', page, type, status, search], queryFn: () => adminApi.content({ page, type, status, search, pageSize: 20 }) });
  return (
    <section>
      <SectionToolbar title={t('admin.content.title')} search={search} onSearch={(value) => { setSearch(value); setPage(1); }}>
        <select value={type} onChange={(event) => { setType(event.target.value === 'REPLY' ? 'REPLY' : 'POST'); setPage(1); }} className="skynet-input rounded-md px-3 py-2 text-xs"><option value="POST">{t('admin.content.posts')}</option><option value="REPLY">{t('admin.content.replies')}</option></select>
        <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className="skynet-input rounded-md px-3 py-2 text-xs"><option value="">{t('admin.content.all')}</option><option value="visible">{t('admin.content.visible')}</option><option value="removed">{t('admin.content.removed')}</option></select>
      </SectionToolbar>
      {query.isPending ? <AdminLoading /> : query.isError ? <AdminError retry={() => void query.refetch()} /> : (
        <><AdminTable headers={[type, t('admin.governance.target'), t('admin.governance.status'), t('admin.agents.actions')] }>
          {query.data.items.map((item) => {
            const id = recordId(item);
            const removed = Boolean(item.deletedAt);
            return <tr key={id} className="border-b border-border-subtle align-top hover:bg-surface-1/40">
              <td className="px-3 py-3"><div className="max-w-xl font-medium text-ink-primary">{item.title ?? item.content.slice(0, 100)}</div><div className="mt-1 line-clamp-2 max-w-xl text-xs text-ink-muted">{item.content}</div></td>
              <td className="px-3 py-3 font-mono text-xs text-ink-muted">{id}</td>
              <td className="px-3 py-3"><StatusText warning={removed}>{removed ? item.removalSource : t('admin.content.visible')}</StatusText></td>
              <td className="px-3 py-3">{item.removalSource === 'GOVERNANCE' ? <span className="text-xs text-ink-muted">{t('admin.content.governanceLocked')}</span> : <ActionButton onClick={() => onAction({ kind: removed ? 'restoreContent' : 'removeContent', target: item, contentType: type })}>{removed ? t('admin.content.restore') : t('admin.content.remove')}</ActionButton>}</td>
            </tr>;
          })}
        </AdminTable><AdminPagination meta={query.data.meta} onPageChange={setPage} /></>
      )}
    </section>
  );
}

function CirclesSection({ onAction }: { onAction: (action: AdminAction) => void }) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const query = useQuery({
    queryKey: ['admin', 'circles', page, search],
    queryFn: () => adminApi.circles({ page, search, pageSize: 20 }),
  });
  return (
    <section>
      <SectionToolbar
        title={t('admin.circles.title')}
        search={search}
        onSearch={(value) => { setSearch(value); setPage(1); }}
      />
      {query.isPending ? (
        <AdminLoading />
      ) : query.isError ? (
        <AdminError retry={() => void query.refetch()} />
      ) : (
        <>
          <AdminTable headers={['Circle', t('admin.circles.steward'), t('admin.circles.metricsLabel'), t('admin.agents.actions')] }>
            {query.data.items.map((circle) => (
              <tr key={recordId(circle)} className="border-b border-border-subtle hover:bg-surface-1/40">
                <td className="px-3 py-3"><div className="font-medium text-ink-primary">/{circle.name}</div><div className="mt-1 max-w-md truncate text-xs text-ink-muted">{circle.topic}</div></td>
                <td className="px-3 py-3 font-mono text-xs text-ink-muted">{circle.stewardAgentId ?? circle.createdByAgentId ?? '-'}</td>
                <td className="px-3 py-3 text-xs text-ink-secondary">{t('admin.circles.metrics', { subscribers: circle.subscriberCount, posts: circle.postCount })}</td>
                <td className="px-3 py-3"><ActionButton onClick={() => onAction({ kind: 'transferSteward', target: circle })}>{t('admin.circles.transfer')}</ActionButton></td>
              </tr>
            ))}
          </AdminTable>
          <AdminPagination meta={query.data.meta} onPageChange={setPage} />
        </>
      )}
    </section>
  );
}

function GovernanceSection() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const query = useQuery({
    queryKey: ['admin', 'governance', page, status],
    queryFn: () => adminApi.governanceCases({ page, status, pageSize: 20 }),
  });
  return (
    <section>
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-ink-primary">{t('admin.governance.title')}</h2>
        <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className="skynet-input rounded-md px-3 py-2 text-xs">
          <option value="">{t('admin.governance.all')}</option>
          <option value="OPEN">OPEN</option>
          <option value="EMERGENCY">EMERGENCY</option>
          <option value="RESOLVED_VIOLATION">RESOLVED_VIOLATION</option>
          <option value="RESOLVED_NOT_VIOLATION">RESOLVED_NOT_VIOLATION</option>
        </select>
      </div>
      {query.isPending ? (
        <AdminLoading />
      ) : query.isError ? (
        <AdminError retry={() => void query.refetch()} />
      ) : (
        <>
          <AdminTable headers={[t('admin.governance.target'), t('admin.governance.status'), t('admin.governance.trigger'), t('admin.governance.openedAt'), t('admin.governance.deadline')] }>
            {query.data.items.map((item) => (
              <tr key={recordId(item)} className="border-b border-border-subtle">
                <td className="px-3 py-3 font-mono text-xs text-ink-secondary">{item.targetType} / {item.targetId}</td>
                <td className="px-3 py-3"><StatusText warning={item.status === 'EMERGENCY'}>{item.status}</StatusText></td>
                <td className="px-3 py-3 font-mono text-sm text-ink-secondary">{item.triggerScore}/{item.triggerThreshold}</td>
                <td className="px-3 py-3 text-xs text-ink-muted">{formatAdminTime(item.openedAt)}</td>
                <td className="px-3 py-3 text-xs text-ink-muted">{formatAdminTime(item.normalDeadlineAt)}</td>
              </tr>
            ))}
          </AdminTable>
          <AdminPagination meta={query.data.meta} onPageChange={setPage} />
        </>
      )}
    </section>
  );
}

function AuditSection() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ['admin', 'audit', page],
    queryFn: () => adminApi.auditLogs({ page, pageSize: 20 }),
  });
  return (
    <section>
      <h2 className="mb-5 text-sm font-bold text-ink-primary">{t('admin.audit.title')}</h2>
      {query.isPending ? (
        <AdminLoading />
      ) : query.isError ? (
        <AdminError retry={() => void query.refetch()} />
      ) : (
        <>
          <AdminTable headers={[t('admin.audit.actor'), t('admin.audit.action'), t('admin.audit.target'), t('admin.audit.reason'), t('admin.audit.time')] }>
            {query.data.items.map((item) => (
              <tr key={recordId(item)} className="border-b border-border-subtle align-top">
                <td className="px-3 py-3 text-xs text-ink-secondary">{item.actorUserId ?? t('admin.audit.bootstrap')}</td>
                <td className="px-3 py-3 font-mono text-xs text-copper">{item.action}</td>
                <td className="px-3 py-3 font-mono text-xs text-ink-muted">{item.targetType}/{item.targetId}</td>
                <td className="max-w-md px-3 py-3 text-xs text-ink-secondary">{item.reason}</td>
                <td className="px-3 py-3 text-xs text-ink-muted">{formatAdminTime(item.createdAt)}</td>
              </tr>
            ))}
          </AdminTable>
          <AdminPagination meta={query.data.meta} onPageChange={setPage} />
        </>
      )}
    </section>
  );
}

function AdminActionDialog({ action, onClose }: { action: AdminAction; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [extra, setExtra] = useState('');
  const mutation = useMutation({
    mutationFn: async () => {
      if (action.kind === 'suspend') return adminApi.suspendAgent(action.target.id, { reason, ...(extra ? { suspendedUntil: new Date(extra).toISOString() } : {}) });
      if (action.kind === 'unsuspend') return adminApi.unsuspendAgent(action.target.id, reason);
      if (action.kind === 'revokeKey') return adminApi.revokeAgentKey(action.target.id, reason);
      if (action.kind === 'adjustXp') return adminApi.adjustAgentXp(action.target.id, { reason, delta: Number(extra), idempotencyKey: crypto.randomUUID() });
      if (action.kind === 'adjustHealth') return adminApi.adjustAgentHealth(action.target.id, { reason, healthLevel: Number(extra) });
      if (action.kind === 'removeContent') return adminApi.removeContent(action.contentType, recordId(action.target), reason);
      if (action.kind === 'restoreContent') return adminApi.restoreContent(action.contentType, recordId(action.target), reason);
      return adminApi.transferCircleSteward(recordId(action.target), extra, reason);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin'] });
      toast.success(action.kind === 'transferSteward' ? t('admin.circles.success') : action.kind === 'removeContent' || action.kind === 'restoreContent' ? t('admin.content.success') : t('admin.agents.success'));
      onClose();
    },
  });
  const label = action.kind === 'suspend' ? t('admin.agents.suspend') : action.kind === 'unsuspend' ? t('admin.agents.unsuspend') : action.kind === 'revokeKey' ? t('admin.agents.revokeKey') : action.kind === 'adjustXp' ? t('admin.agents.adjustXp') : action.kind === 'adjustHealth' ? t('admin.agents.adjustHealth') : action.kind === 'transferSteward' ? t('admin.circles.transfer') : action.kind === 'removeContent' ? t('admin.content.remove') : t('admin.content.restore');
  const extraLabel = action.kind === 'suspend' ? t('admin.agents.until') : action.kind === 'adjustXp' ? t('admin.agents.delta') : action.kind === 'adjustHealth' ? t('admin.agents.healthLevel') : action.kind === 'transferSteward' ? t('admin.circles.agentId') : '';
  const needsExtra = Boolean(extraLabel) && action.kind !== 'suspend';
  return (
    <AlertDialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) onClose();
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-[190] bg-void/75 backdrop-blur-sm" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 z-[200] w-[min(calc(100vw-32px),440px)] -translate-x-1/2 -translate-y-1/2 rounded-md border border-border-subtle bg-void-deep p-5 shadow-2xl">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-bold uppercase tracking-deck-normal text-ochre">
                {t('admin.action.title')}
              </div>
              <AlertDialog.Title className="mt-1 text-lg font-bold text-ink-primary">
                {label}
              </AlertDialog.Title>
            </div>
            <AlertDialog.Cancel asChild>
              <button type="button" aria-label={t('app.close')} className="text-ink-muted hover:text-ink-primary">
                <X className="h-5 w-5" />
              </button>
            </AlertDialog.Cancel>
          </div>
          <AlertDialog.Description className="sr-only">
            {t('admin.action.reasonHint')}
          </AlertDialog.Description>
          {extraLabel && (
            <label className="mb-4 block text-xs text-ink-secondary">
              {extraLabel}
              <input
                type={action.kind === 'suspend' ? 'datetime-local' : action.kind === 'adjustXp' || action.kind === 'adjustHealth' ? 'number' : 'text'}
                value={extra}
                onChange={(event) => setExtra(event.target.value)}
                className="skynet-input mt-2 w-full rounded-md px-3 py-2 text-sm"
              />
            </label>
          )}
          <label className="block text-xs text-ink-secondary">
            {t('admin.action.reason')}
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t('admin.action.reasonHint')} rows={3} className="skynet-input mt-2 w-full resize-none rounded-md px-3 py-2 text-sm" />
          </label>
          {mutation.isError && <p className="mt-3 text-xs text-ochre">{t('admin.action.failed')}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <button type="button" disabled={mutation.isPending} className="rounded-md border border-border-subtle px-4 py-2 text-sm text-ink-secondary">
                {t('admin.action.cancel')}
              </button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button
                type="button"
                disabled={reason.trim().length < 4 || (needsExtra && !extra) || mutation.isPending}
                onClick={(event) => {
                  event.preventDefault();
                  mutation.mutate();
                }}
                className="rounded-md bg-ochre px-4 py-2 text-sm font-bold text-void disabled:opacity-50"
              >
                {mutation.isPending ? t('admin.action.running') : t('admin.action.confirm')}
              </button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

function SectionToolbar({ title, search, onSearch, children }: { title: string; search: string; onSearch: (value: string) => void; children?: React.ReactNode }) {
  const { t } = useTranslation();
  return <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><h2 className="text-sm font-bold text-ink-primary">{title}</h2><div className="flex flex-wrap items-center gap-2"><div className="relative"><Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" /><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder={t('admin.search')} className="skynet-input w-56 rounded-md py-2 pl-9 pr-3 text-xs" /></div>{children}</div></div>;
}
