'use client';

import { useDeferredValue, useRef, useState } from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import * as Dialog from '@radix-ui/react-dialog';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  CalendarClock,
  Pencil,
  Plus,
  Send,
  ShieldAlert,
  ToggleLeft,
  ToggleRight,
  Trash2,
  X,
} from 'lucide-react';
import { AnnouncementMarkdown } from '@/components/system/AnnouncementMarkdown';
import { ComposerTextarea } from '@/components/ui/ComposerTextarea';
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
import { AdminSelect } from './AdminSelect';

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
  const editorOpenerRef = useRef<HTMLElement | null>(null);
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
    mutationFn: async () => {
      if (!action) throw new Error('Announcement action is missing');
      if (action.kind === 'publish') {
        await adminApi.publishAnnouncement(action.item.id, action.item.updatedAt);
        return;
      }
      if (action.kind === 'withdraw') {
        await adminApi.withdrawAnnouncement(action.item.id, action.item.updatedAt);
        return;
      }
      await adminApi.deleteAnnouncement(action.item.id, action.item.updatedAt);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'announcements'] });
      await queryClient.invalidateQueries({ queryKey: ['system', 'activeAnnouncements'] });
      toast.success(t('admin.announcements.actionSuccess'));
      setAction(null);
    },
  });
  const openEditor = (nextEditor: AdminAnnouncement | 'new') => {
    editorOpenerRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    setEditor(nextEditor);
  };
  const closeEditor = () => {
    setEditor(null);
    window.requestAnimationFrame(() => editorOpenerRef.current?.focus());
  };

  return (
    <section>
      <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <h2 className="text-sm font-bold text-ink-primary">{t('admin.announcements.title')}</h2>
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
          <AdminSelect
            value={status}
            onValueChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
            ariaLabel={t('admin.announcements.statusLabel')}
            options={[
              { value: '', label: t('admin.announcements.allStatuses') },
              { value: 'DRAFT', label: t('admin.announcements.status.DRAFT') },
              { value: 'PUBLISHED', label: t('admin.announcements.status.PUBLISHED') },
              { value: 'WITHDRAWN', label: t('admin.announcements.status.WITHDRAWN') },
            ]}
          />
          <AdminSelect
            value={kind}
            onValueChange={(value) => {
              setKind(value);
              setPage(1);
            }}
            ariaLabel={t('admin.announcements.kindLabel')}
            options={[
              { value: '', label: t('admin.announcements.allKinds') },
              ...ANNOUNCEMENT_KINDS.map((value) => ({ value, label: t(`admin.announcements.kind.${value}`) })),
            ]}
          />
          <button
            type="button"
            onClick={() => openEditor('new')}
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
          onClose={closeEditor}
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
                  <div className="font-medium text-ink-primary">{item.title}</div>
                  <AnnouncementMarkdown
                    content={item.body}
                    className="mt-2 line-clamp-2 max-w-xl text-xs text-ink-muted"
                    compact
                  />
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
                        <ActionButton onClick={() => openEditor(item)}>
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

      <AnnouncementActionDialog
        key={action ? `${action.item.id}:${action.kind}` : 'announcement-action'}
        open={Boolean(action)}
        title={action ? t(`admin.announcements.confirm.${action.kind}`) : ''}
        loading={actionMutation.isPending}
        error={actionMutation.error}
        onOpenChange={(open) => {
          if (!open && !actionMutation.isPending) setAction(null);
        }}
        onConfirm={() => actionMutation.mutate()}
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
  const [title, setTitle] = useState(item?.title ?? '');
  const [body, setBody] = useState(item?.body ?? '');
  const [kind, setKind] = useState<AdminAnnouncementKind>(item?.kind ?? 'INFO');
  const [startsAt, setStartsAt] = useState(
    toLocalDateTime(item?.startsAt ?? new Date().toISOString()),
  );
  const [endsAt, setEndsAt] = useState(toLocalDateTime(item?.endsAt ?? null));
  const [dismissible, setDismissible] = useState(item?.dismissible ?? true);
  const [linkUrl, setLinkUrl] = useState(item?.linkUrl ?? '');
  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        title,
        body,
        kind,
        startsAt: toIsoDateTime(startsAt),
        endsAt: endsAt ? toIsoDateTime(endsAt) : null,
        dismissible,
        linkUrl: linkUrl || null,
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
    title.trim() && body.trim() && startsAt,
  );

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="skynet-dialog-overlay fixed inset-0 z-[190] bg-void/75 backdrop-blur-sm" />
        <Dialog.Content className="skynet-dialog-content fixed left-1/2 top-1/2 z-[200] max-h-[calc(100dvh-32px)] w-[min(calc(100vw-32px),1120px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-md border border-border-subtle bg-void-deep shadow-2xl">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (valid) mutation.mutate();
            }}
          >
            <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-5 py-4">
              <div>
                <Dialog.Title className="text-sm font-bold text-ink-primary">
                  {item ? t('admin.announcements.editTitle') : t('admin.announcements.createTitle')}
                </Dialog.Title>
                <Dialog.Description className="sr-only">
                  {t('admin.announcements.editorDescription')}
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button
                  type="button"
                  disabled={mutation.isPending}
                  aria-label={t('admin.action.cancel')}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-surface-1 hover:text-ink-primary disabled:opacity-50"
                >
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </div>

            <div className="space-y-5 px-5 py-5">
              <AdminField label={t('admin.announcements.titleLabel')}>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={120}
                  className="skynet-input w-full rounded-md px-3 py-2 text-sm"
                />
              </AdminField>

              <div className="grid min-h-[320px] gap-4 lg:grid-cols-2">
                <AdminField label={t('admin.announcements.bodyLabel')}>
                  <ComposerTextarea
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    maxLength={1000}
                    rows={14}
                    className="min-h-[300px] max-h-none"
                  />
                </AdminField>
                <section aria-label={t('admin.announcements.preview')}>
                  <div className="text-xs font-medium text-ink-secondary">
                    {t('admin.announcements.preview')}
                  </div>
                  <div className="mt-2 min-h-[300px] overflow-auto rounded-md border border-border-subtle bg-surface-1/50 px-4 py-3 text-sm text-ink-secondary">
                    {body.trim() ? (
                      <AnnouncementMarkdown content={body} />
                    ) : (
                      <p className="text-ink-muted">{t('admin.announcements.emptyPreview')}</p>
                    )}
                  </div>
                </section>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <AdminField label={t('admin.announcements.kindLabel')}>
                  <AdminSelect
                    value={kind}
                    ariaLabel={t('admin.announcements.kindLabel')}
                    className="w-full text-sm"
                    options={ANNOUNCEMENT_KINDS.map((value) => ({
                      value,
                      label: t(`admin.announcements.kind.${value}`),
                    }))}
                    onValueChange={(value) => setKind(value as AdminAnnouncementKind)}
                  />
                </AdminField>
                <AdminField label={t('admin.announcements.link')}>
                  <input
                    value={linkUrl}
                    onChange={(event) => setLinkUrl(event.target.value)}
                    placeholder={t('admin.announcements.linkPlaceholder')}
                    maxLength={500}
                    className="skynet-input w-full rounded-md px-3 py-2 text-sm"
                  />
                </AdminField>
                <AnnouncementDateTimeField
                  label={t('admin.announcements.startsAt')}
                  value={startsAt}
                  onChange={setStartsAt}
                />
                <AnnouncementDateTimeField
                  label={t('admin.announcements.endsAt')}
                  value={endsAt}
                  onChange={setEndsAt}
                  clearable
                />
              </div>

              <div className="flex flex-col gap-4 border-t border-border-subtle pt-4 sm:flex-row sm:items-center sm:justify-between">
                <label className="inline-flex items-center gap-2 text-xs text-ink-secondary">
                  <input
                    type="checkbox"
                    checked={dismissible}
                    onChange={(event) => setDismissible(event.target.checked)}
                    className="h-4 w-4 accent-copper"
                  />
                  {t('admin.announcements.dismissible')}
                </label>
                <button
                  type="submit"
                  disabled={!valid || mutation.isPending}
                  className="h-10 rounded-md bg-copper px-5 text-sm font-bold text-void disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {mutation.isPending ? t('admin.action.running') : t('admin.announcements.saveDraft')}
                </button>
              </div>
              {mutation.isError && <p className="text-xs text-ochre">{t('admin.action.failed')}</p>}
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function AnnouncementDateTimeField({
  label,
  value,
  onChange,
  clearable = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  clearable?: boolean;
}) {
  const { t } = useTranslation();
  const formattedValue = value
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(value),
      )
    : t('admin.announcements.notSet');

  return (
    <div>
      <span className="block text-xs font-medium text-ink-secondary">{label}</span>
      <div className="mt-2 flex gap-2">
        <label className="relative flex h-10 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md border border-border-subtle bg-surface-1/40 px-3 text-sm text-ink-primary transition-colors hover:border-border-accent focus-within:border-copper focus-within:ring-2 focus-within:ring-copper/25">
          <CalendarClock className="h-4 w-4 shrink-0 text-copper" />
          <span className="truncate">{formattedValue}</span>
          <input
            type="datetime-local"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            aria-label={label}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </label>
        {clearable && value && (
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label={t('admin.announcements.clearEnd')}
            title={t('admin.announcements.clearEnd')}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border-subtle text-ink-muted hover:border-border-accent hover:text-ink-primary"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function AnnouncementActionDialog({
  open,
  title,
  loading,
  error,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  title: string;
  loading: boolean;
  error: unknown;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="skynet-dialog-overlay fixed inset-0 z-[190] bg-void/75 backdrop-blur-sm" />
        <AlertDialog.Content className="skynet-dialog-content fixed left-1/2 top-1/2 z-[200] w-[min(calc(100vw-32px),400px)] -translate-x-1/2 -translate-y-1/2 rounded-md border border-border-subtle bg-void-deep p-5 shadow-2xl">
          <AlertDialog.Title className="text-base font-bold text-ink-primary">{title}</AlertDialog.Title>
          <AlertDialog.Description className="sr-only">{title}</AlertDialog.Description>
          {error !== null && error !== undefined && (
            <p className="mt-3 text-xs text-ochre">
              {error instanceof ApiError && error.statusCode === 409
                ? t('admin.action.conflict')
                : t('admin.action.failed')}
            </p>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <button
                type="button"
                disabled={loading}
                className="rounded-md border border-border-subtle px-4 py-2 text-sm text-ink-secondary"
              >
                {t('admin.action.cancel')}
              </button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button
                type="button"
                disabled={loading}
                onClick={(event) => {
                  event.preventDefault();
                  onConfirm();
                }}
                className="rounded-md bg-ochre px-4 py-2 text-sm font-bold text-void disabled:opacity-50"
              >
                {loading ? t('admin.action.running') : t('admin.action.confirm')}
              </button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

export function FeatureFlagsSection() {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['admin', 'featureFlags'], queryFn: adminApi.featureFlags });
  const mutation = useMutation({
    mutationFn: (flag: AdminFeatureFlag) => {
      return adminApi.updateFeatureFlag(flag.key, {
        enabled: !flag.enabled,
        expectedUpdatedAt: flag.updatedAt,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'featureFlags'] });
      toast.success(t('admin.featureFlags.success'));
    },
    onError: () => toast.error(t('admin.featureFlags.failed')),
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
                {flag.updatedAt ? t('admin.featureFlags.updatedAt', { time: formatAdminTime(flag.updatedAt) }) : t('admin.featureFlags.notChanged')}
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={flag.enabled}
                aria-label={t(`admin.featureFlags.items.${flag.key}.title`)}
                disabled={mutation.isPending}
                onClick={() => mutation.mutate(flag)}
                className={`inline-flex h-9 items-center gap-2 rounded-md border px-3 text-xs font-bold ${flag.enabled ? 'border-moss/30 text-moss' : 'border-ochre/30 text-ochre'}`}
              >
                {flag.enabled ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
                {flag.enabled ? t('admin.featureFlags.enabled') : t('admin.featureFlags.disabled')}
              </button>
            </div>
          ))}
        </div>
      )}
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
          <AdminSelect value={type} ariaLabel={t('admin.security.allTypes')} options={[{ value: '', label: t('admin.security.allTypes') }, ...SECURITY_EVENT_TYPES.map((value) => ({ value, label: t(`admin.security.types.${value}`) }))]} onValueChange={(value) => { setType(value); setPage(1); }} />
          <AdminSelect value={severity} ariaLabel={t('admin.security.allSeverities')} options={[{ value: '', label: t('admin.security.allSeverities') }, ...SECURITY_SEVERITIES.map((value) => ({ value, label: t(`admin.security.severities.${value}`) }))]} onValueChange={(value) => { setSeverity(value); setPage(1); }} />
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
