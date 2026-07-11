'use client';

import { useDeferredValue, useState } from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  Pencil,
  Plus,
  Send,
  ShieldAlert,
  ToggleLeft,
  ToggleRight,
  Trash2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/components/ui/SignalToast';
import { ApiError } from '@/lib/api';
import {
  adminApi,
  type AdminAnnouncement,
  type AdminAnnouncementKind,
  type AdminFeatureFlag,
} from '@/lib/admin-api';
import {
  ActionButton,
  AdminError,
  AdminLoading,
  AdminPagination,
  AdminTable,
  StatusText,
  formatAdminTime,
} from './AdminPrimitives';

const ANNOUNCEMENT_KINDS: AdminAnnouncementKind[] = [
  'INFO',
  'MAINTENANCE',
  'SECURITY',
  'INCIDENT',
];
const SECURITY_EVENT_TYPES = [
  'LOGIN_FAILED',
  'ADMIN_AUTH_FAILED',
  'ADMIN_CSRF_REJECTED',
  'ADMIN_AGENT_KEY_REJECTED',
  'AGENT_KEY_REJECTED',
  'RATE_LIMITED',
];
const SECURITY_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

type AnnouncementAction = {
  item: AdminAnnouncement;
  kind: 'publish' | 'withdraw' | 'delete';
};

function toLocalDateTime(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function toIsoDateTime(value: string): string {
  return new Date(value).toISOString();
}

export function AnnouncementsSection() {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [kind, setKind] = useState('');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [editor, setEditor] = useState<AdminAnnouncement | 'new' | null>(null);
  const [action, setAction] = useState<AnnouncementAction | null>(null);
  const query = useQuery({
    queryKey: ['admin', 'announcements', page, status, kind, deferredSearch],
    queryFn: async () => {
      const result = await adminApi.announcements({
        page,
        pageSize: 20,
        status,
        kind,
        search: deferredSearch,
      });
      const lastPage = Math.max(1, result.meta.totalPages);
      if (page > lastPage) {
        setPage(lastPage);
        return adminApi.announcements({
          page: lastPage,
          pageSize: 20,
          status,
          kind,
          search: deferredSearch,
        });
      }
      return result;
    },
  });
  const actionMutation = useMutation({
    mutationFn: async ({ reason }: { reason: string }) => {
      if (!action) throw new Error('Announcement action is missing');
      if (action.kind === 'publish') {
        await adminApi.publishAnnouncement(action.item.id, action.item.updatedAt, reason);
        return;
      }
      if (action.kind === 'withdraw') {
        await adminApi.withdrawAnnouncement(action.item.id, action.item.updatedAt, reason);
        return;
      }
      await adminApi.deleteAnnouncement(action.item.id, action.item.updatedAt, reason);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'announcements'] });
      await queryClient.invalidateQueries({ queryKey: ['system', 'activeAnnouncements'] });
      toast.success(t('admin.announcements.actionSuccess'));
      setAction(null);
    },
  });

  return (
    <section>
      <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h2 className="text-sm font-bold text-ink-primary">{t('admin.announcements.title')}</h2>
          <p className="mt-1 text-xs text-ink-muted">{t('admin.announcements.description')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder={t('admin.search')}
            className="skynet-input w-52 rounded-md px-3 py-2 text-xs"
          />
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
            className="skynet-input rounded-md px-3 py-2 text-xs"
          >
            <option value="">{t('admin.announcements.allStatuses')}</option>
            <option value="DRAFT">{t('admin.announcements.status.DRAFT')}</option>
            <option value="PUBLISHED">{t('admin.announcements.status.PUBLISHED')}</option>
            <option value="WITHDRAWN">{t('admin.announcements.status.WITHDRAWN')}</option>
          </select>
          <select
            value={kind}
            onChange={(event) => {
              setKind(event.target.value);
              setPage(1);
            }}
            className="skynet-input rounded-md px-3 py-2 text-xs"
          >
            <option value="">{t('admin.announcements.allKinds')}</option>
            {ANNOUNCEMENT_KINDS.map((item) => (
              <option key={item} value={item}>{t(`admin.announcements.kind.${item}`)}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setEditor('new')}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-copper px-3 text-xs font-bold text-void hover:bg-copper-dim"
          >
            <Plus className="h-4 w-4" />
            {t('admin.announcements.create')}
          </button>
        </div>
      </div>

      {editor && (
        <AnnouncementEditor
          key={editor === 'new' ? 'new' : editor.id}
          item={editor === 'new' ? null : editor}
          onClose={() => setEditor(null)}
        />
      )}

      {query.isPending ? (
        <AdminLoading />
      ) : query.isError ? (
        <AdminError retry={() => void query.refetch()} />
      ) : (
        <>
          <AdminTable
            headers={[
              t('admin.announcements.content'),
              t('admin.announcements.kindLabel'),
              t('admin.announcements.statusLabel'),
              t('admin.announcements.window'),
              t('admin.agents.actions'),
            ]}
          >
            {query.data.items.map((item) => (
              <tr key={item.id} className="border-b border-border-subtle align-top hover:bg-surface-1/40">
                <td className="px-3 py-3">
                  <div className="font-medium text-ink-primary">{item.titleZh}</div>
                  <div className="mt-1 text-xs text-ink-secondary">{item.titleEn}</div>
                  <div className="mt-2 line-clamp-2 max-w-xl text-xs text-ink-muted">{item.bodyZh}</div>
                </td>
                <td className="px-3 py-3 font-mono text-xs text-ink-secondary">
                  {t(`admin.announcements.kind.${item.kind}`)}
                </td>
                <td className="px-3 py-3">
                  <StatusText warning={item.status === 'WITHDRAWN'}>
                    {t(`admin.announcements.status.${item.status}`)}
                  </StatusText>
                </td>
                <td className="px-3 py-3 text-xs text-ink-muted">
                  <div>{formatAdminTime(item.startsAt)}</div>
                  <div className="mt-1">{formatAdminTime(item.endsAt)}</div>
                </td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    {item.status === 'DRAFT' && (
                      <>
                        <ActionButton onClick={() => setEditor(item)}>
                          <span className="inline-flex items-center gap-1"><Pencil className="h-3 w-3" />{t('admin.announcements.edit')}</span>
                        </ActionButton>
                        <ActionButton onClick={() => setAction({ item, kind: 'publish' })}>
                          <span className="inline-flex items-center gap-1"><Send className="h-3 w-3" />{t('admin.announcements.publish')}</span>
                        </ActionButton>
                        <ActionButton onClick={() => setAction({ item, kind: 'delete' })}>
                          <span className="inline-flex items-center gap-1"><Trash2 className="h-3 w-3" />{t('admin.announcements.delete')}</span>
                        </ActionButton>
                      </>
                    )}
                    {item.status === 'PUBLISHED' && (
                      <ActionButton onClick={() => setAction({ item, kind: 'withdraw' })}>
                        <span className="inline-flex items-center gap-1"><Archive className="h-3 w-3" />{t('admin.announcements.withdraw')}</span>
                      </ActionButton>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </AdminTable>
          <AdminPagination meta={query.data.meta} onPageChange={setPage} />
        </>
      )}

      <ReasonDialog
        key={action ? `${action.item.id}:${action.kind}` : 'announcement-action'}
        open={Boolean(action)}
        title={action ? t(`admin.announcements.confirm.${action.kind}`) : ''}
        loading={actionMutation.isPending}
        error={actionMutation.error}
        onOpenChange={(open) => {
          if (!open && !actionMutation.isPending) setAction(null);
        }}
        onConfirm={(reason) => actionMutation.mutate({ reason })}
      />
    </section>
  );
}

function AnnouncementEditor({
  item,
  onClose,
}: {
  item: AdminAnnouncement | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [titleZh, setTitleZh] = useState(item?.titleZh ?? '');
  const [titleEn, setTitleEn] = useState(item?.titleEn ?? '');
  const [bodyZh, setBodyZh] = useState(item?.bodyZh ?? '');
  const [bodyEn, setBodyEn] = useState(item?.bodyEn ?? '');
  const [kind, setKind] = useState<AdminAnnouncementKind>(item?.kind ?? 'INFO');
  const [startsAt, setStartsAt] = useState(
    toLocalDateTime(item?.startsAt ?? new Date().toISOString()),
  );
  const [endsAt, setEndsAt] = useState(toLocalDateTime(item?.endsAt ?? null));
  const [dismissible, setDismissible] = useState(item?.dismissible ?? true);
  const [linkUrl, setLinkUrl] = useState(item?.linkUrl ?? '');
  const [reason, setReason] = useState('');
  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        titleZh,
        titleEn,
        bodyZh,
        bodyEn,
        kind,
        startsAt: toIsoDateTime(startsAt),
        endsAt: endsAt ? toIsoDateTime(endsAt) : null,
        dismissible,
        linkUrl: linkUrl || null,
        reason,
      };
      return item
        ? adminApi.updateAnnouncement(item.id, {
            ...payload,
            expectedUpdatedAt: item.updatedAt,
          })
        : adminApi.createAnnouncement(payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'announcements'] });
      await queryClient.invalidateQueries({ queryKey: ['system', 'activeAnnouncements'] });
      toast.success(t('admin.announcements.saveSuccess'));
      onClose();
    },
  });
  const valid = Boolean(
    titleZh.trim() &&
    titleEn.trim() &&
    bodyZh.trim() &&
    bodyEn.trim() &&
    startsAt &&
    reason.trim().length >= 4,
  );

  return (
    <form
      className="mb-6 border-y border-border-accent/50 bg-surface-1/35 px-3 py-5 sm:px-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) mutation.mutate();
      }}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-ink-primary">
          {item ? t('admin.announcements.editTitle') : t('admin.announcements.createTitle')}
        </h3>
        <button type="button" onClick={onClose} className="text-xs text-ink-muted hover:text-ink-primary">
          {t('admin.action.cancel')}
        </button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <AdminField label={t('admin.announcements.titleZh')}>
          <input value={titleZh} onChange={(event) => setTitleZh(event.target.value)} maxLength={120} className="skynet-input w-full rounded-md px-3 py-2 text-sm" />
        </AdminField>
        <AdminField label={t('admin.announcements.titleEn')}>
          <input value={titleEn} onChange={(event) => setTitleEn(event.target.value)} maxLength={120} className="skynet-input w-full rounded-md px-3 py-2 text-sm" />
        </AdminField>
        <AdminField label={t('admin.announcements.bodyZh')}>
          <textarea value={bodyZh} onChange={(event) => setBodyZh(event.target.value)} maxLength={1000} rows={4} className="skynet-input w-full resize-y rounded-md px-3 py-2 text-sm" />
        </AdminField>
        <AdminField label={t('admin.announcements.bodyEn')}>
          <textarea value={bodyEn} onChange={(event) => setBodyEn(event.target.value)} maxLength={1000} rows={4} className="skynet-input w-full resize-y rounded-md px-3 py-2 text-sm" />
        </AdminField>
        <AdminField label={t('admin.announcements.kindLabel')}>
          <select value={kind} onChange={(event) => setKind(event.target.value as AdminAnnouncementKind)} className="skynet-input w-full rounded-md px-3 py-2 text-sm">
            {ANNOUNCEMENT_KINDS.map((value) => <option key={value} value={value}>{t(`admin.announcements.kind.${value}`)}</option>)}
          </select>
        </AdminField>
        <AdminField label={t('admin.announcements.link')}>
          <input value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} placeholder={t('admin.announcements.linkPlaceholder')} maxLength={500} className="skynet-input w-full rounded-md px-3 py-2 text-sm" />
        </AdminField>
        <AdminField label={t('admin.announcements.startsAt')}>
          <input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} className="skynet-input w-full rounded-md px-3 py-2 text-sm" />
        </AdminField>
        <AdminField label={t('admin.announcements.endsAt')}>
          <input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} className="skynet-input w-full rounded-md px-3 py-2 text-sm" />
        </AdminField>
      </div>
      <div className="mt-4 flex flex-col gap-4 border-t border-border-subtle pt-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex-1">
          <AdminField label={t('admin.action.reason')}>
            <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} placeholder={t('admin.action.reasonHint')} className="skynet-input w-full rounded-md px-3 py-2 text-sm" />
          </AdminField>
          <label className="mt-3 inline-flex items-center gap-2 text-xs text-ink-secondary">
            <input type="checkbox" checked={dismissible} onChange={(event) => setDismissible(event.target.checked)} className="h-4 w-4 accent-copper" />
            {t('admin.announcements.dismissible')}
          </label>
        </div>
        <button type="submit" disabled={!valid || mutation.isPending} className="h-10 rounded-md bg-copper px-5 text-sm font-bold text-void disabled:cursor-not-allowed disabled:opacity-50">
          {mutation.isPending ? t('admin.action.running') : t('admin.announcements.saveDraft')}
        </button>
      </div>
      {mutation.isError && <p className="mt-3 text-xs text-ochre">{t('admin.action.failed')}</p>}
    </form>
  );
}

export function FeatureFlagsSection() {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<AdminFeatureFlag | null>(null);
  const query = useQuery({ queryKey: ['admin', 'featureFlags'], queryFn: adminApi.featureFlags });
  const mutation = useMutation({
    mutationFn: ({ reason, reviewAt }: { reason: string; reviewAt: string }) => {
      if (!selected) throw new Error('Feature flag is missing');
      return adminApi.updateFeatureFlag(selected.key, {
        enabled: !selected.enabled,
        reason,
        reviewAt: reviewAt ? toIsoDateTime(reviewAt) : null,
        expectedUpdatedAt: selected.updatedAt,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'featureFlags'] });
      toast.success(t('admin.featureFlags.success'));
      setSelected(null);
    },
  });

  return (
    <section>
      <div className="mb-5">
        <h2 className="text-sm font-bold text-ink-primary">{t('admin.featureFlags.title')}</h2>
        <p className="mt-1 text-xs text-ink-muted">{t('admin.featureFlags.description')}</p>
      </div>
      {query.isPending ? (
        <AdminLoading />
      ) : query.isError ? (
        <AdminError retry={() => void query.refetch()} />
      ) : (
        <div className="divide-y divide-border-subtle border-y border-border-subtle">
          {query.data.map((flag) => (
            <div key={flag.key} className="grid gap-3 px-2 py-4 md:grid-cols-[minmax(0,1fr)_minmax(220px,0.55fr)_auto] md:items-center">
              <div>
                <div className="text-sm font-medium text-ink-primary">{t(`admin.featureFlags.items.${flag.key}.title`)}</div>
                <p className="mt-1 text-xs leading-5 text-ink-muted">{t(`admin.featureFlags.items.${flag.key}.description`)}</p>
              </div>
              <div className="text-xs text-ink-muted">
                <div>{flag.reason ?? t('admin.featureFlags.defaultReason')}</div>
                {flag.reviewAt && <div className="mt-1">{t('admin.featureFlags.reviewAt', { time: formatAdminTime(flag.reviewAt) })}</div>}
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={flag.enabled}
                aria-label={t(`admin.featureFlags.items.${flag.key}.title`)}
                onClick={() => setSelected(flag)}
                className={`inline-flex h-9 items-center gap-2 rounded-md border px-3 text-xs font-bold ${flag.enabled ? 'border-moss/30 text-moss' : 'border-ochre/30 text-ochre'}`}
              >
                {flag.enabled ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
                {flag.enabled ? t('admin.featureFlags.enabled') : t('admin.featureFlags.disabled')}
              </button>
            </div>
          ))}
        </div>
      )}
      <ReasonDialog
        key={selected?.key ?? 'feature-flag-action'}
        open={Boolean(selected)}
        title={selected ? t('admin.featureFlags.confirm', { state: selected.enabled ? t('admin.featureFlags.disable') : t('admin.featureFlags.enable') }) : ''}
        loading={mutation.isPending}
        error={mutation.error}
        showReviewAt
        onOpenChange={(open) => {
          if (!open && !mutation.isPending) setSelected(null);
        }}
        onConfirm={(reason, reviewAt) => mutation.mutate({ reason, reviewAt })}
      />
    </section>
  );
}

export function SecurityEventsSection() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [type, setType] = useState('');
  const [severity, setSeverity] = useState('');
  const query = useQuery({
    queryKey: ['admin', 'security', page, type, severity],
    queryFn: async () => {
      const result = await adminApi.securityEvents({ page, pageSize: 20, type, severity });
      const lastPage = Math.max(1, result.meta.totalPages);
      if (page > lastPage) {
        setPage(lastPage);
        return adminApi.securityEvents({
          page: lastPage,
          pageSize: 20,
          type,
          severity,
        });
      }
      return result;
    },
    refetchInterval: 30_000,
  });
  return (
    <section>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-ochre" />
            <h2 className="text-sm font-bold text-ink-primary">{t('admin.security.title')}</h2>
          </div>
          <p className="mt-1 text-xs text-ink-muted">{t('admin.security.description')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={type} onChange={(event) => { setType(event.target.value); setPage(1); }} className="skynet-input rounded-md px-3 py-2 text-xs">
            <option value="">{t('admin.security.allTypes')}</option>
            {SECURITY_EVENT_TYPES.map((value) => <option key={value} value={value}>{t(`admin.security.types.${value}`)}</option>)}
          </select>
          <select value={severity} onChange={(event) => { setSeverity(event.target.value); setPage(1); }} className="skynet-input rounded-md px-3 py-2 text-xs">
            <option value="">{t('admin.security.allSeverities')}</option>
            {SECURITY_SEVERITIES.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </div>
      </div>
      {query.isPending ? (
        <AdminLoading />
      ) : query.isError ? (
        <AdminError retry={() => void query.refetch()} />
      ) : (
        <>
          <AdminTable headers={[t('admin.security.event'), t('admin.security.route'), t('admin.security.fingerprint'), t('admin.security.samples'), t('admin.security.lastSeen')] }>
            {query.data.items.map((event) => (
              <tr key={event.id} className="border-b border-border-subtle align-top hover:bg-surface-1/40">
                <td className="px-3 py-3"><div className="font-mono text-xs text-ink-primary">{t(`admin.security.types.${event.type}`, { defaultValue: t('admin.security.unknown') })}</div><div className={`mt-1 text-[11px] font-bold ${event.severity === 'HIGH' || event.severity === 'CRITICAL' ? 'text-ochre' : 'text-copper'}`}>{t(`admin.security.severities.${event.severity}`, { defaultValue: t('admin.security.unknown') })} / {event.details.reason ? t(`admin.security.reasons.${event.details.reason}`, { defaultValue: t('admin.security.unknown') }) : t('admin.security.unknown')}</div></td>
                <td className="px-3 py-3 font-mono text-xs text-ink-secondary">{event.route}</td>
                <td className="px-3 py-3 font-mono text-xs text-ink-muted">{event.fingerprint}</td>
                <td className="px-3 py-3 font-mono text-sm text-ink-secondary">{event.sampleCount}</td>
                <td className="px-3 py-3 text-xs text-ink-muted">{formatAdminTime(event.lastSeenAt)}</td>
              </tr>
            ))}
          </AdminTable>
          <AdminPagination meta={query.data.meta} onPageChange={setPage} />
        </>
      )}
    </section>
  );
}

function AdminField({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs font-medium text-ink-secondary">{label}<span className="mt-2 block">{children}</span></label>;
}

function ReasonDialog({
  open,
  title,
  loading,
  error,
  showReviewAt = false,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  title: string;
  loading: boolean;
  error: unknown;
  showReviewAt?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string, reviewAt: string) => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [reviewAt, setReviewAt] = useState('');
  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setReason('');
          setReviewAt('');
        }
        onOpenChange(nextOpen);
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-[190] bg-void/75 backdrop-blur-sm" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 z-[200] w-[min(calc(100vw-32px),440px)] -translate-x-1/2 -translate-y-1/2 rounded-md border border-border-subtle bg-void-deep p-5 shadow-2xl">
          <AlertDialog.Title className="text-base font-bold text-ink-primary">{title}</AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-xs leading-5 text-ink-muted">{t('admin.action.reasonHint')}</AlertDialog.Description>
          <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} maxLength={500} className="skynet-input mt-4 w-full resize-none rounded-md px-3 py-2 text-sm" />
          {showReviewAt && (
            <label className="mt-4 block text-xs text-ink-secondary">{t('admin.featureFlags.reviewAtLabel')}<input type="datetime-local" value={reviewAt} onChange={(event) => setReviewAt(event.target.value)} className="skynet-input mt-2 w-full rounded-md px-3 py-2 text-sm" /></label>
          )}
          {error !== null && error !== undefined && (
            <p className="mt-3 text-xs text-ochre">
              {error instanceof ApiError && error.statusCode === 409
                ? t('admin.action.conflict')
                : t('admin.action.failed')}
            </p>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <AlertDialog.Cancel asChild><button type="button" disabled={loading} className="rounded-md border border-border-subtle px-4 py-2 text-sm text-ink-secondary">{t('admin.action.cancel')}</button></AlertDialog.Cancel>
            <AlertDialog.Action asChild><button type="button" disabled={loading || reason.trim().length < 4} onClick={(event) => { event.preventDefault(); onConfirm(reason.trim(), reviewAt); }} className="rounded-md bg-ochre px-4 py-2 text-sm font-bold text-void disabled:opacity-50">{loading ? t('admin.action.running') : t('admin.action.confirm')}</button></AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
