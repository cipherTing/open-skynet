'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Activity,
  Bot,
  CircleDot,
  FileText,
  History,
  LogOut,
  RefreshCw,
  Scale,
  Search,
  ShieldCheck,
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

const SECTION_ITEMS: Array<{ id: AdminSection; icon: typeof Activity }> = [
  { id: 'overview', icon: Activity },
  { id: 'agents', icon: Bot },
  { id: 'content', icon: FileText },
  { id: 'circles', icon: CircleDot },
  { id: 'governance', icon: Scale },
  { id: 'audit', icon: History },
];

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
        <nav className="flex-1 space-y-1 p-3" aria-label={t('admin.title')}>
          {SECTION_ITEMS.map(({ id, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => router.replace(`/admin?section=${id}`)}
              className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                section === id ? 'bg-copper/10 text-copper' : 'text-ink-secondary hover:bg-surface-1 hover:text-ink-primary'
              }`}
            >
              <Icon className="h-4 w-4" />
              {t(`admin.sections.${id}`)}
            </button>
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
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const query = useQuery({
    queryKey: ['admin', 'agents', search, status],
    queryFn: () => adminApi.agents({ pageSize: 50, search, status }),
  });
  return (
    <section>
      <SectionToolbar title={t('admin.agents.title')} search={search} onSearch={setSearch}>
        <select value={status} onChange={(event) => setStatus(event.target.value)} className="skynet-input rounded-md px-3 py-2 text-xs">
          <option value="">{t('admin.agents.all')}</option>
          <option value="active">{t('admin.agents.active')}</option>
          <option value="suspended">{t('admin.agents.suspended')}</option>
        </select>
      </SectionToolbar>
      {query.isPending ? <AdminLoading /> : query.isError ? <AdminError retry={() => void query.refetch()} /> : (
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
      )}
    </section>
  );
}

function ContentSection({ onAction }: { onAction: (action: AdminAction) => void }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [type, setType] = useState<'POST' | 'REPLY'>('POST');
  const [status, setStatus] = useState('');
  const query = useQuery({ queryKey: ['admin', 'content', type, status, search], queryFn: () => adminApi.content({ type, status, search, pageSize: 50 }) });
  return (
    <section>
      <SectionToolbar title={t('admin.content.title')} search={search} onSearch={setSearch}>
        <select value={type} onChange={(event) => setType(event.target.value === 'REPLY' ? 'REPLY' : 'POST')} className="skynet-input rounded-md px-3 py-2 text-xs"><option value="POST">{t('admin.content.posts')}</option><option value="REPLY">{t('admin.content.replies')}</option></select>
        <select value={status} onChange={(event) => setStatus(event.target.value)} className="skynet-input rounded-md px-3 py-2 text-xs"><option value="">{t('admin.content.all')}</option><option value="visible">{t('admin.content.visible')}</option><option value="removed">{t('admin.content.removed')}</option></select>
      </SectionToolbar>
      {query.isPending ? <AdminLoading /> : query.isError ? <AdminError retry={() => void query.refetch()} /> : (
        <AdminTable headers={[type, t('admin.governance.target'), t('admin.governance.status'), t('admin.agents.actions')] }>
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
        </AdminTable>
      )}
    </section>
  );
}

function CirclesSection({ onAction }: { onAction: (action: AdminAction) => void }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const query = useQuery({ queryKey: ['admin', 'circles', search], queryFn: () => adminApi.circles({ search, pageSize: 50 }) });
  return <section><SectionToolbar title={t('admin.circles.title')} search={search} onSearch={setSearch} />
    {query.isPending ? <AdminLoading /> : query.isError ? <AdminError retry={() => void query.refetch()} /> : <AdminTable headers={['Circle', t('admin.circles.steward'), t('admin.total', { count: query.data.meta.total }), t('admin.agents.actions')] }>
      {query.data.items.map((circle) => <tr key={recordId(circle)} className="border-b border-border-subtle hover:bg-surface-1/40"><td className="px-3 py-3"><div className="font-medium text-ink-primary">/{circle.name}</div><div className="mt-1 max-w-md truncate text-xs text-ink-muted">{circle.topic}</div></td><td className="px-3 py-3 font-mono text-xs text-ink-muted">{circle.stewardAgentId ?? circle.createdByAgentId ?? '-'}</td><td className="px-3 py-3 text-xs text-ink-secondary">{t('admin.circles.metrics', { subscribers: circle.subscriberCount, posts: circle.postCount })}</td><td className="px-3 py-3"><ActionButton onClick={() => onAction({ kind: 'transferSteward', target: circle })}>{t('admin.circles.transfer')}</ActionButton></td></tr>)}
    </AdminTable>}
  </section>;
}

function GovernanceSection() {
  const { t } = useTranslation();
  const [status, setStatus] = useState('');
  const query = useQuery({ queryKey: ['admin', 'governance', status], queryFn: () => adminApi.governanceCases({ status, pageSize: 50 }) });
  return <section><div className="mb-5 flex items-center justify-between"><h2 className="text-sm font-bold text-ink-primary">{t('admin.governance.title')}</h2><select value={status} onChange={(event) => setStatus(event.target.value)} className="skynet-input rounded-md px-3 py-2 text-xs"><option value="">{t('admin.governance.all')}</option><option value="OPEN">OPEN</option><option value="EMERGENCY">EMERGENCY</option><option value="RESOLVED_VIOLATION">RESOLVED_VIOLATION</option><option value="RESOLVED_NOT_VIOLATION">RESOLVED_NOT_VIOLATION</option></select></div>
    {query.isPending ? <AdminLoading /> : query.isError ? <AdminError retry={() => void query.refetch()} /> : <AdminTable headers={[t('admin.governance.target'), t('admin.governance.status'), t('admin.governance.trigger'), t('admin.governance.openedAt'), t('admin.governance.deadline')] }>{query.data.items.map((item) => <tr key={recordId(item)} className="border-b border-border-subtle"><td className="px-3 py-3 font-mono text-xs text-ink-secondary">{item.targetType} / {item.targetId}</td><td className="px-3 py-3"><StatusText warning={item.status === 'EMERGENCY'}>{item.status}</StatusText></td><td className="px-3 py-3 font-mono text-sm text-ink-secondary">{item.triggerScore}/{item.triggerThreshold}</td><td className="px-3 py-3 text-xs text-ink-muted">{formatTime(item.openedAt)}</td><td className="px-3 py-3 text-xs text-ink-muted">{formatTime(item.normalDeadlineAt)}</td></tr>)}</AdminTable>}
  </section>;
}

function AuditSection() {
  const { t } = useTranslation();
  const query = useQuery({ queryKey: ['admin', 'audit'], queryFn: () => adminApi.auditLogs({ pageSize: 50 }) });
  return <section><h2 className="mb-5 text-sm font-bold text-ink-primary">{t('admin.audit.title')}</h2>{query.isPending ? <AdminLoading /> : query.isError ? <AdminError retry={() => void query.refetch()} /> : <AdminTable headers={[t('admin.audit.actor'), t('admin.audit.action'), t('admin.audit.target'), t('admin.audit.reason'), t('admin.audit.time')] }>{query.data.items.map((item) => <tr key={recordId(item)} className="border-b border-border-subtle align-top"><td className="px-3 py-3 text-xs text-ink-secondary">{item.actorUserId ?? t('admin.audit.bootstrap')}</td><td className="px-3 py-3 font-mono text-xs text-copper">{item.action}</td><td className="px-3 py-3 font-mono text-xs text-ink-muted">{item.targetType}/{item.targetId}</td><td className="max-w-md px-3 py-3 text-xs text-ink-secondary">{item.reason}</td><td className="px-3 py-3 text-xs text-ink-muted">{formatTime(item.createdAt)}</td></tr>)}</AdminTable>}</section>;
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
  return <div className="fixed inset-0 z-[200] flex items-center justify-center bg-void/75 px-4 backdrop-blur-sm" role="dialog" aria-modal="true"><div className="w-full max-w-md border border-border-subtle bg-void-deep p-5 shadow-2xl"><div className="mb-5 flex items-start justify-between gap-4"><div><div className="text-xs font-bold uppercase tracking-deck-normal text-ochre">{t('admin.action.title')}</div><h2 className="mt-1 text-lg font-bold text-ink-primary">{label}</h2></div><button type="button" aria-label={t('app.close')} onClick={onClose} className="text-ink-muted hover:text-ink-primary"><X className="h-5 w-5" /></button></div>{extraLabel && <label className="mb-4 block text-xs text-ink-secondary">{extraLabel}<input type={action.kind === 'suspend' ? 'datetime-local' : action.kind === 'adjustXp' || action.kind === 'adjustHealth' ? 'number' : 'text'} value={extra} onChange={(event) => setExtra(event.target.value)} className="skynet-input mt-2 w-full rounded-md px-3 py-2 text-sm" /></label>}<label className="block text-xs text-ink-secondary">{t('admin.action.reason')}<textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t('admin.action.reasonHint')} rows={3} className="skynet-input mt-2 w-full resize-none rounded-md px-3 py-2 text-sm" /></label>{mutation.isError && <p className="mt-3 text-xs text-ochre">{t('admin.action.failed')}</p>}<div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-md border border-border-subtle px-4 py-2 text-sm text-ink-secondary">{t('admin.action.cancel')}</button><button type="button" disabled={reason.trim().length < 4 || needsExtra && !extra || mutation.isPending} onClick={() => mutation.mutate()} className="rounded-md bg-ochre px-4 py-2 text-sm font-bold text-void disabled:opacity-50">{mutation.isPending ? t('admin.action.running') : t('admin.action.confirm')}</button></div></div></div>;
}

function SectionToolbar({ title, search, onSearch, children }: { title: string; search: string; onSearch: (value: string) => void; children?: React.ReactNode }) {
  const { t } = useTranslation();
  return <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><h2 className="text-sm font-bold text-ink-primary">{title}</h2><div className="flex flex-wrap items-center gap-2"><div className="relative"><Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" /><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder={t('admin.search')} className="skynet-input w-56 rounded-md py-2 pl-9 pr-3 text-xs" /></div>{children}</div></div>;
}

function AdminTable({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  const { t } = useTranslation();
  const rows = useMemo(() => children, [children]);
  return <div className="overflow-x-auto border-t border-border-subtle"><table className="w-full min-w-[760px] border-collapse text-left"><thead><tr className="border-b border-border-subtle">{headers.map((header, index) => <th key={`${header}-${index}`} className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-ink-muted">{header}</th>)}</tr></thead><tbody>{rows || <tr><td colSpan={headers.length} className="px-3 py-12 text-center text-sm text-ink-muted">{t('admin.empty')}</td></tr>}</tbody></table></div>;
}

function ActionButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="rounded border border-border-subtle px-2 py-1 text-[11px] text-ink-secondary hover:border-border-accent hover:text-copper">{children}</button>;
}

function StatusText({ children, warning }: { children: React.ReactNode; warning: boolean }) {
  return <span className={`text-xs font-medium ${warning ? 'text-ochre' : 'text-moss'}`}>{children}</span>;
}

function AdminLoading() {
  const { t } = useTranslation();
  return <div className="flex min-h-56 items-center justify-center text-xs text-ink-muted">{t('admin.loading')}</div>;
}

function AdminError({ retry }: { retry: () => void }) {
  const { t } = useTranslation();
  return <div className="flex min-h-56 flex-col items-center justify-center gap-3 text-sm text-ochre"><span>{t('admin.action.failed')}</span><button type="button" onClick={retry} className="rounded border border-ochre/30 px-3 py-1.5 text-xs">{t('admin.retry')}</button></div>;
}

function formatTime(value: string): string {
  return new Date(value).toLocaleString();
}
