'use client';

import { useDeferredValue, useEffect, useRef, useState } from 'react';
import { Turnstile } from '@marsidev/react-turnstile';
import Link from 'next/link';
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
  Check,
  Copy,
  KeyRound,
  Mail,
} from 'lucide-react';
import { AnnouncementMarkdown } from '@/components/system/AnnouncementMarkdown';
import { ComposerTextarea } from '@/components/ui/ComposerTextarea';
import { TerminalDialog } from '@/components/ui/TerminalDialog';
import {
  TButton,
  TInput,
  TRadarNode,
  TTag,
  Timecode,
  formatTimecode,
} from '@/components/ui/terminal';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/components/ui/SignalToast';
import { ApiError } from '@/lib/api';
import {
  adminApi,
  type AdminAnnouncement,
  type AdminAnnouncementKind,
  type AdminFeatureFlag,
  type AdminPublicAccessConfig,
  type AdminAuthPolicy,
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

const ANNOUNCEMENT_KINDS: AdminAnnouncementKind[] = ['INFO', 'MAINTENANCE', 'SECURITY', 'INCIDENT'];
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
    editorOpenerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setEditor(nextEditor);
  };
  const closeEditor = () => {
    setEditor(null);
    window.requestAnimationFrame(() => editorOpenerRef.current?.focus());
  };

  return (
    <section>
      <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.15em] text-[#EDF3ED]">
          {t('admin.announcements.title')}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <TInput
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder={t('admin.search')}
            className="h-8 w-52"
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
              ...ANNOUNCEMENT_KINDS.map((value) => ({
                value,
                label: t(`admin.announcements.kind.${value}`),
              })),
            ]}
          />
          <TButton type="button" variant="primary" onClick={() => openEditor('new')}>
            <Plus className="h-3.5 w-3.5" />
            {t('admin.announcements.create')}
          </TButton>
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
              <tr
                key={item.id}
                className="border-b border-[#1A2E1A] align-top hover:bg-[#040704]"
              >
                <td className="px-3 py-3">
                  <div className="font-medium text-[#EDF3ED]">{item.title}</div>
                  <AnnouncementMarkdown
                    content={item.body}
                    className="mt-2 line-clamp-2 max-w-xl text-xs text-[#3A5A3A]"
                    compact
                  />
                </td>
                <td className="px-3 py-3 font-mono text-xs text-white/60">
                  {t(`admin.announcements.kind.${item.kind}`)}
                </td>
                <td className="px-3 py-3">
                  <StatusText warning={item.status === 'WITHDRAWN'}>
                    {t(`admin.announcements.status.${item.status}`)}
                  </StatusText>
                </td>
                <td className="px-3 py-3 text-xs text-[#3A5A3A]">
                  <div>
                    <Timecode date={item.startsAt} withDate />
                  </div>
                  <div className="mt-1">
                    {item.endsAt ? <Timecode date={item.endsAt} withDate /> : '—'}
                  </div>
                </td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    {item.status === 'DRAFT' && (
                      <>
                        <ActionButton onClick={() => openEditor(item)}>
                          <span className="inline-flex items-center gap-1">
                            <Pencil className="h-3 w-3" />
                            {t('admin.announcements.edit')}
                          </span>
                        </ActionButton>
                        <ActionButton onClick={() => setAction({ item, kind: 'publish' })}>
                          <span className="inline-flex items-center gap-1">
                            <Send className="h-3 w-3" />
                            {t('admin.announcements.publish')}
                          </span>
                        </ActionButton>
                        <ActionButton variant="danger" onClick={() => setAction({ item, kind: 'delete' })}>
                          <span className="inline-flex items-center gap-1">
                            <Trash2 className="h-3 w-3" />
                            {t('admin.announcements.delete')}
                          </span>
                        </ActionButton>
                      </>
                    )}
                    {item.status === 'PUBLISHED' && (
                      <ActionButton onClick={() => setAction({ item, kind: 'withdraw' })}>
                        <span className="inline-flex items-center gap-1">
                          <Archive className="h-3 w-3" />
                          {t('admin.announcements.withdraw')}
                        </span>
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
  const valid = Boolean(title.trim() && body.trim() && startsAt);

  return (
    <TerminalDialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) onClose();
      }}
      title={item ? t('admin.announcements.editTitle') : t('admin.announcements.createTitle')}
      code="ADMIN.ANNOUNCE"
      size="xl"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) mutation.mutate();
        }}
      >
        <div className="space-y-5">
          <AdminField label={t('admin.announcements.titleLabel')}>
            <TInput
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={120}
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
              <div className="text-xs font-medium text-white/60">
                {t('admin.announcements.preview')}
              </div>
              <div className="mt-2 min-h-[300px] overflow-auto border border-[#1A2E1A] bg-[#040704] px-4 py-3 text-sm text-white/60">
                {body.trim() ? (
                  <AnnouncementMarkdown content={body} />
                ) : (
                  <p className="text-[#3A5A3A]">{t('admin.announcements.emptyPreview')}</p>
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
              <TInput
                value={linkUrl}
                onChange={(event) => setLinkUrl(event.target.value)}
                placeholder={t('admin.announcements.linkPlaceholder')}
                maxLength={500}
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

          <div className="flex flex-col gap-4 border-t border-[#1A2E1A] pt-4 sm:flex-row sm:items-center sm:justify-between">
            <TRadarNode
              checked={dismissible}
              onChange={setDismissible}
              label={t('admin.announcements.dismissible')}
            />
            <button
              type="submit"
              disabled={!valid || mutation.isPending}
              className="t-btn t-btn--primary"
            >
              {mutation.isPending ? t('admin.action.running') : t('admin.announcements.saveDraft')}
            </button>
          </div>
          {mutation.isError && <p className="text-xs text-[#EF4444]">{t('admin.action.failed')}</p>}
        </div>
      </form>
    </TerminalDialog>
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
      <span className="block text-xs font-medium text-white/60">{label}</span>
      <div className="mt-2 flex gap-2">
        <label className="relative flex h-10 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-none border border-[#1A2E1A] bg-[#040704] px-3 font-mono text-[12px] text-[#EDF3ED] transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:border-[#3A5A3A] focus-within:border-[#ADFF2F]">
          <CalendarClock className="h-4 w-4 shrink-0 text-[#ADFF2F]" />
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
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-none border border-[#1A2E1A] text-[#3A5A3A] transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:border-[#ADFF2F] hover:text-[#ADFF2F]"
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
            {t('admin.action.cancel')}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={onConfirm}
            className="t-btn t-btn--danger"
          >
            {loading ? t('admin.action.running') : t('admin.action.confirm')}
          </button>
        </>
      }
    >
      {error !== null && error !== undefined && (
        <p className="text-xs text-[#EF4444]">
          {error instanceof ApiError && error.statusCode === 409
            ? t('admin.action.conflict')
            : t('admin.action.failed')}
        </p>
      )}
    </TerminalDialog>
  );
}

function PublicAccessEditor({ config }: { config: AdminPublicAccessConfig }) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [siteOrigin, setSiteOrigin] = useState(config.siteOrigin);
  const [apiBaseUrl, setApiBaseUrl] = useState(config.apiBaseUrl);

  const mutation = useMutation({
    mutationFn: () =>
      adminApi.updatePublicAccessConfig({
        siteOrigin: siteOrigin.trim(),
        apiBaseUrl: apiBaseUrl.trim(),
        expectedVersion: config.version,
      }),
    onSuccess: async (updated) => {
      queryClient.setQueryData(['admin', 'publicAccess'], updated);
      await queryClient.invalidateQueries({ queryKey: ['system', 'public-access-config'] });
      toast.success(t('admin.publicAccess.saved'));
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : t('admin.publicAccess.saveFailed'));
    },
  });

  const changed =
    siteOrigin.trim() !== config.siteOrigin || apiBaseUrl.trim() !== config.apiBaseUrl;
  const previewGuideUrl = `${siteOrigin.trim().replace(/\/+$/u, '')}/guide.md`;

  return (
    <section className="max-w-4xl">
      <h2 className="text-sm font-bold text-[#EDF3ED]">{t('admin.publicAccess.title')}</h2>
      <p className="mt-1 text-xs leading-5 text-[#3A5A3A]">{t('admin.publicAccess.description')}</p>
      <div className="mt-5 space-y-5 rounded-none border border-[#1A2E1A] bg-black/25 p-5">
        <AdminField label={t('admin.publicAccess.siteOrigin')}>
          <TInput
            value={siteOrigin}
            onChange={(event) => setSiteOrigin(event.target.value)}
            placeholder={t('admin.publicAccess.siteOriginPlaceholder')}
          />
        </AdminField>
        <AdminField label={t('admin.publicAccess.apiBaseUrl')}>
          <TInput
            value={apiBaseUrl}
            onChange={(event) => setApiBaseUrl(event.target.value)}
            placeholder={t('admin.publicAccess.apiBaseUrlPlaceholder')}
          />
        </AdminField>
        <div>
          <h3 className="text-xs font-bold text-white/60">
            {t('admin.publicAccess.preview')}
          </h3>
          <div className="mt-2 space-y-2 rounded-none border border-[#1A2E1A] bg-[#040704] p-3 font-mono text-[11px] leading-5 text-[#3A5A3A]">
            <p>curl -s {previewGuideUrl}</p>
            <p>export SKYNET_ORIGIN=&quot;{siteOrigin.trim()}&quot;</p>
            <p>export SKYNET_API_BASE=&quot;{apiBaseUrl.trim()}&quot;</p>
          </div>
        </div>
        {changed ? (
          <div className="rounded-none border border-[#ADFF2F]/25 bg-[#ADFF2F]/5 px-3 py-2 text-xs text-white/60">
            <p className="font-bold text-[#ADFF2F]">{t('admin.publicAccess.changes')}</p>
            {siteOrigin.trim() !== config.siteOrigin ? (
              <p className="mt-1 break-all">
                {config.siteOrigin} → {siteOrigin.trim()}
              </p>
            ) : null}
            {apiBaseUrl.trim() !== config.apiBaseUrl ? (
              <p className="mt-1 break-all">
                {config.apiBaseUrl} → {apiBaseUrl.trim()}
              </p>
            ) : null}
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] text-[#3A5A3A]">
            {config.updatedAt
              ? t('admin.publicAccess.updatedAt', { time: formatAdminTime(config.updatedAt) })
              : t('admin.publicAccess.defaultValue')}
          </span>
          <TButton
            type="button"
            variant="primary"
            disabled={!changed || mutation.isPending || !siteOrigin.trim() || !apiBaseUrl.trim()}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? t('admin.action.running') : t('admin.publicAccess.save')}
          </TButton>
        </div>
      </div>
    </section>
  );
}

export function PublicAccessSection() {
  const query = useQuery({
    queryKey: ['admin', 'publicAccess'],
    queryFn: adminApi.publicAccessConfig,
  });
  if (query.isPending) return <AdminLoading />;
  if (query.isError || !query.data) return <AdminError retry={() => void query.refetch()} />;
  return <PublicAccessEditor key={query.data.version} config={query.data} />;
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
        <h2 className="text-sm font-bold text-[#EDF3ED]">{t('admin.featureFlags.title')}</h2>
        <p className="mt-1 text-xs text-[#3A5A3A]">{t('admin.featureFlags.description')}</p>
      </div>
      {query.isPending ? (
        <AdminLoading />
      ) : query.isError ? (
        <AdminError retry={() => void query.refetch()} />
      ) : (
        <div className="divide-y divide-[#1A2E1A] border-y border-[#1A2E1A]">
          {query.data.map((flag) => (
            <div
              key={flag.key}
              className="grid gap-3 px-2 py-4 md:grid-cols-[minmax(0,1fr)_minmax(220px,0.55fr)_auto] md:items-center"
            >
              <div>
                <div className="text-sm font-medium text-[#EDF3ED]">
                  {t(`admin.featureFlags.items.${flag.key}.title`)}
                </div>
                <p className="mt-1 text-xs leading-5 text-[#3A5A3A]">
                  {t(`admin.featureFlags.items.${flag.key}.description`)}
                </p>
              </div>
              <div className="text-xs text-[#3A5A3A]">
                {flag.updatedAt
                  ? t('admin.featureFlags.updatedAt', {
                      time: formatTimecode(flag.updatedAt, true) ?? '',
                    })
                  : t('admin.featureFlags.notChanged')}
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={flag.enabled}
                aria-label={t(`admin.featureFlags.items.${flag.key}.title`)}
                disabled={mutation.isPending}
                onClick={() => mutation.mutate(flag)}
                className={`inline-flex h-8 items-center gap-2 rounded-none border px-3 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] transition-colors duration-100 [transition-timing-function:steps(2,end)] disabled:cursor-not-allowed disabled:opacity-45 ${
                  flag.enabled
                    ? 'border-[#ADFF2F]/60 text-[#ADFF2F] hover:bg-[#ADFF2F]/10'
                    : 'border-[#713F12] text-[#A16207] hover:bg-[#713F12]/20'
                }`}
              >
                {flag.enabled ? (
                  <ToggleRight className="h-4 w-4" />
                ) : (
                  <ToggleLeft className="h-4 w-4" />
                )}
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
            <ShieldAlert className="h-4 w-4 text-[#A16207]" />
            <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.15em] text-[#EDF3ED]">
              {t('admin.security.title')}
            </h2>
          </div>
          <p className="mt-1 text-xs text-[#3A5A3A]">{t('admin.security.description')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <AdminSelect
            value={type}
            ariaLabel={t('admin.security.allTypes')}
            options={[
              { value: '', label: t('admin.security.allTypes') },
              ...SECURITY_EVENT_TYPES.map((value) => ({
                value,
                label: t(`admin.security.types.${value}`),
              })),
            ]}
            onValueChange={(value) => {
              setType(value);
              setPage(1);
            }}
          />
          <AdminSelect
            value={severity}
            ariaLabel={t('admin.security.allSeverities')}
            options={[
              { value: '', label: t('admin.security.allSeverities') },
              ...SECURITY_SEVERITIES.map((value) => ({
                value,
                label: t(`admin.security.severities.${value}`),
              })),
            ]}
            onValueChange={(value) => {
              setSeverity(value);
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
              t('admin.security.event'),
              t('admin.security.route'),
              t('admin.security.fingerprint'),
              t('admin.security.samples'),
              t('admin.security.lastSeen'),
            ]}
          >
            {query.data.items.map((event) => (
              <tr
                key={event.id}
                className="border-b border-[#1A2E1A] align-top hover:bg-[#040704]"
              >
                <td className="px-3 py-3">
                  <div className="font-mono text-xs text-[#EDF3ED]">
                    {t(`admin.security.types.${event.type}`, {
                      defaultValue: t('admin.security.unknown'),
                    })}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <TTag
                      color={
                        event.severity === 'HIGH' || event.severity === 'CRITICAL'
                          ? 'red'
                          : event.severity === 'MEDIUM'
                            ? 'amber'
                            : 'default'
                      }
                    >
                      {t(`admin.security.severities.${event.severity}`, {
                        defaultValue: t('admin.security.unknown'),
                      })}
                    </TTag>
                    <span className="text-[11px] text-[#3A5A3A]">
                      {event.details.reason
                        ? t(`admin.security.reasons.${event.details.reason}`, {
                            defaultValue: t('admin.security.unknown'),
                          })
                        : t('admin.security.unknown')}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-3 font-mono text-xs text-white/60">{event.route}</td>
                <td className="px-3 py-3 font-mono text-xs text-[#3A5A3A]">{event.fingerprint}</td>
                <td className="px-3 py-3 font-mono text-sm text-white/60">
                  {event.sampleCount}
                </td>
                <td className="px-3 py-3 text-xs text-[#3A5A3A]">
                  <Timecode date={event.lastSeenAt} withDate />
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

export function AuthPolicySection() {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['admin', 'authPolicy'], queryFn: adminApi.authPolicy });
  const [overrides, setOverrides] = useState<Partial<AdminAuthPolicy>>({});
  const [turnstileSecret, setTurnstileSecret] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [testEmail, setTestEmail] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const form = query.data ? { ...query.data, ...overrides } : null;
  const save = useMutation({
    mutationFn: async () => {
      if (!form) throw new Error('missing form');
      return adminApi.updateAuthPolicy({
        expectedVersion: form.version,
        inviteRequired: form.inviteRequired,
        turnstileEnabled: form.turnstileEnabled,
        turnstileSiteKey: form.turnstileSiteKey,
        turnstileSecret: turnstileSecret || undefined,
        smtpHost: form.smtpHost,
        smtpPort: form.smtpPort,
        smtpSecurity: form.smtpSecurity,
        smtpSkipTlsVerify: form.smtpSkipTlsVerify,
        smtpForceAuthLogin: form.smtpForceAuthLogin,
        smtpUsername: form.smtpUsername,
        smtpFromAddress: form.smtpFromAddress,
        smtpPassword: smtpPassword || undefined,
      });
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['admin', 'authPolicy'], data);
      setOverrides({});
      setTurnstileSecret('');
      setSmtpPassword('');
      toast.success(t('admin.authPolicy.saved'));
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : t('admin.authPolicy.saveFailed')),
  });
  const testSmtp = useMutation({
    mutationFn: () => adminApi.testSmtp(testEmail),
    onSuccess: () => {
      toast.success(t('admin.authPolicy.smtpTested'));
      void query.refetch();
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : t('admin.authPolicy.testFailed')),
  });
  const testTurnstile = useMutation({
    mutationFn: () => adminApi.testTurnstile(turnstileToken),
    onSuccess: () => {
      toast.success(t('admin.authPolicy.turnstileTested'));
      setTurnstileToken('');
      void query.refetch();
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : t('admin.authPolicy.testFailed')),
  });
  if (query.isPending || !form) return <AdminLoading />;
  if (query.isError) return <AdminError retry={() => void query.refetch()} />;
  const update = <K extends keyof AdminAuthPolicy>(key: K, value: AdminAuthPolicy[K]) =>
    setOverrides((current) => ({ ...current, [key]: value }));
  const hasUnsavedChanges =
    Object.keys(overrides).length > 0 || Boolean(turnstileSecret || smtpPassword);
  const turnstileConfigDirty = 'turnstileSiteKey' in overrides || Boolean(turnstileSecret);
  return (
    <section className="space-y-8">
      <div>
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-[#ADFF2F]" />
          <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.15em] text-[#EDF3ED]">
            {t('admin.authPolicy.title')}
          </h2>
        </div>
        <p className="mt-1 text-xs text-[#3A5A3A]">{t('admin.authPolicy.description')}</p>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-4 border-t border-[#1A2E1A] pt-4">
          <h3 className="font-mono text-[11px] font-bold uppercase tracking-[0.15em] text-[#EDF3ED]">
            {t('admin.authPolicy.smtp')}
          </h3>
          <AdminField label={t('admin.authPolicy.smtpHost')}>
            <TInput
              value={form.smtpHost}
              onChange={(event) => update('smtpHost', event.target.value)}
            />
          </AdminField>
          <div className="grid grid-cols-2 gap-3">
            <AdminField label={t('admin.authPolicy.smtpPort')}>
              <TInput
                type="number"
                value={form.smtpPort}
                onChange={(event) => update('smtpPort', Number(event.target.value))}
              />
            </AdminField>
            <AdminField label={t('admin.authPolicy.smtpSecurity')}>
              <AdminSelect
                value={form.smtpSecurity}
                ariaLabel={t('admin.authPolicy.smtpSecurity')}
                options={['NONE', 'SSL_TLS', 'STARTTLS'].map((value) => ({
                  value,
                  label: t(`admin.authPolicy.smtpModes.${value}`),
                }))}
                onValueChange={(value) =>
                  update('smtpSecurity', value as AdminAuthPolicy['smtpSecurity'])
                }
              />
            </AdminField>
          </div>
          <AdminField label={t('admin.authPolicy.smtpUsername')}>
            <TInput
              value={form.smtpUsername}
              onChange={(event) => update('smtpUsername', event.target.value)}
            />
          </AdminField>
          <AdminField label={t('admin.authPolicy.smtpFrom')}>
            <TInput
              type="email"
              value={form.smtpFromAddress}
              onChange={(event) => update('smtpFromAddress', event.target.value)}
            />
          </AdminField>
          <AdminField label={t('admin.authPolicy.smtpPassword')}>
            <TInput
              type="password"
              value={smtpPassword}
              onChange={(event) => setSmtpPassword(event.target.value)}
              placeholder={form.smtpPasswordConfigured ? t('admin.authPolicy.keepSecret') : ''}
            />
          </AdminField>
          <TRadarNode
            checked={form.smtpSkipTlsVerify}
            onChange={(checked) => update('smtpSkipTlsVerify', checked)}
            label={t('admin.authPolicy.skipTls')}
          />
          <TRadarNode
            checked={form.smtpForceAuthLogin}
            onChange={(checked) => update('smtpForceAuthLogin', checked)}
            label={t('admin.authPolicy.forceLogin')}
          />
          <div className="flex gap-2">
            <TInput
              type="email"
              className="min-w-0 flex-1"
              value={testEmail}
              onChange={(event) => setTestEmail(event.target.value)}
              placeholder={t('admin.authPolicy.testEmail')}
            />
            <TButton
              type="button"
              variant="secondary"
              disabled={!testEmail || testSmtp.isPending || hasUnsavedChanges}
              title={hasUnsavedChanges ? t('admin.authPolicy.saveBeforeTest') : undefined}
              onClick={() => testSmtp.mutate()}
            >
              <Mail className="h-3.5 w-3.5" />
              {t('admin.authPolicy.sendTest')}
            </TButton>
          </div>
        </div>
        <div className="space-y-4 border-t border-[#1A2E1A] pt-4">
          <h3 className="font-mono text-[11px] font-bold uppercase tracking-[0.15em] text-[#EDF3ED]">
            {t('admin.authPolicy.turnstile')}
          </h3>
          <AdminField label={t('admin.authPolicy.siteKey')}>
            <TInput
              value={form.turnstileSiteKey}
              onChange={(event) => update('turnstileSiteKey', event.target.value)}
            />
          </AdminField>
          <AdminField label={t('admin.authPolicy.secretKey')}>
            <TInput
              type="password"
              value={turnstileSecret}
              onChange={(event) => setTurnstileSecret(event.target.value)}
              placeholder={form.turnstileSecretConfigured ? t('admin.authPolicy.keepSecret') : ''}
            />
          </AdminField>
          {form.turnstileSiteKey && (
            <div className="rounded-none border border-[#1A2E1A] p-2">
              <Turnstile
                siteKey={form.turnstileSiteKey}
                onSuccess={setTurnstileToken}
                onExpire={() => setTurnstileToken('')}
                options={{ action: 'admin-test', theme: 'auto' }}
              />
            </div>
          )}
          <TButton
            type="button"
            variant="secondary"
            disabled={!turnstileToken || testTurnstile.isPending || hasUnsavedChanges}
            title={hasUnsavedChanges ? t('admin.authPolicy.saveBeforeTest') : undefined}
            onClick={() => testTurnstile.mutate()}
          >
            {t('admin.authPolicy.verifyTurnstile')}
          </TButton>
          <div className="flex items-center justify-between gap-4 rounded-none border border-[#1A2E1A] px-3 py-3">
            <span className="text-sm text-white/60">{t('admin.authPolicy.enableTurnstile')}</span>
            <span
              title={
                !form.turnstileVerifiedAt || turnstileConfigDirty
                  ? t('admin.authPolicy.verifyBeforeEnable')
                  : undefined
              }
            >
              <TRadarNode
                checked={form.turnstileEnabled}
                disabled={
                  !form.turnstileEnabled && (!form.turnstileVerifiedAt || turnstileConfigDirty)
                }
                onChange={(checked) => update('turnstileEnabled', checked)}
                label={t('admin.authPolicy.enableTurnstile')}
                className="[&>span:last-child]:hidden"
              />
            </span>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-none border border-[#1A2E1A] px-3 py-3">
            <span className="text-sm text-white/60">{t('admin.authPolicy.requireInvite')}</span>
            <TRadarNode
              checked={form.inviteRequired}
              onChange={(checked) => update('inviteRequired', checked)}
              label={t('admin.authPolicy.requireInvite')}
              className="[&>span:last-child]:hidden"
            />
          </div>
        </div>
      </div>
      <TButton
        type="button"
        variant="primary"
        disabled={save.isPending || !hasUnsavedChanges}
        onClick={() => save.mutate()}
      >
        {save.isPending ? t('app.loading') : t('app.save')}
      </TButton>
    </section>
  );
}

export function InvitationCodesSection() {
  const { t } = useTranslation();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [createdCode, setCreatedCode] = useState('');
  const query = useQuery({
    queryKey: ['admin', 'invitations', page, status],
    queryFn: () => adminApi.invitationCodes({ page, pageSize: 20, status }),
  });
  const create = useMutation({
    mutationFn: () =>
      adminApi.createInvitationCode(expiresAt ? new Date(expiresAt).toISOString() : undefined),
    onSuccess: (item) => {
      setCreatedCode(item.code ?? '');
      setExpiresAt('');
      toast.success(t('admin.invitations.created'));
      void query.refetch();
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : t('admin.invitations.failed')),
  });
  const revoke = useMutation({
    mutationFn: adminApi.revokeInvitationCode,
    onSuccess: () => void query.refetch(),
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : t('admin.invitations.failed')),
  });
  return (
    <section>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.15em] text-[#EDF3ED]">
            {t('admin.invitations.title')}
          </h2>
          <p className="mt-1 text-xs text-[#3A5A3A]">{t('admin.invitations.description')}</p>
        </div>
        <div className="flex gap-2">
          <TInput
            type="datetime-local"
            value={expiresAt}
            onChange={(event) => setExpiresAt(event.target.value)}
            className="h-9 w-56"
            aria-label={t('admin.invitations.expires')}
          />
          <TButton
            type="button"
            variant="primary"
            onClick={() => create.mutate()}
            disabled={create.isPending}
          >
            <Plus className="h-3.5 w-3.5" />
            {t('admin.invitations.create')}
          </TButton>
        </div>
      </div>
      {createdCode && (
        <div className="t-corner mb-4 flex items-center gap-3 rounded-none border border-[#ADFF2F]/30 bg-[#ADFF2F]/5 p-3">
          <code className="min-w-0 flex-1 break-all font-mono text-sm text-[#ADFF2F]">
            {createdCode}
          </code>
          <button
            type="button"
            aria-label={t('admin.invitations.created')}
            onClick={() => void navigator.clipboard.writeText(createdCode)}
            className="text-[#ADFF2F] transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:text-white"
          >
            <Copy className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label={t('app.cancel')}
            onClick={() => setCreatedCode('')}
            className="text-[#3A5A3A] transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:text-white/85"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      <div className="mb-3">
        <AdminSelect
          value={status}
          ariaLabel={t('admin.invitations.status')}
          options={[
            { value: '', label: t('admin.invitations.all') },
            ...['AVAILABLE', 'USED', 'EXPIRED', 'REVOKED'].map((value) => ({
              value,
              label: t(`admin.invitations.statuses.${value}`),
            })),
          ]}
          onValueChange={(value) => {
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
              t('admin.invitations.code'),
              t('admin.invitations.status'),
              t('admin.invitations.expires'),
              t('admin.invitations.usedBy'),
              t('admin.invitations.actions'),
            ]}
            centeredColumns={[4]}
          >
            {query.data.items.map((item) => (
              <tr key={item.id} className="border-b border-[#1A2E1A]">
                <td className="px-3 py-3 font-mono text-xs text-white/60">
                  {item.maskedCode}
                </td>
                <td className="px-3 py-3 text-xs text-white/60">
                  <TTag
                    color={
                      item.status === 'AVAILABLE'
                        ? 'accent'
                        : item.status === 'REVOKED'
                          ? 'red'
                          : item.status === 'EXPIRED'
                            ? 'amber'
                            : 'default'
                    }
                  >
                    {t(`admin.invitations.statuses.${item.status}`)}
                  </TTag>
                </td>
                <td className="px-3 py-3 text-xs text-[#3A5A3A]">
                  {item.expiresAt ? (
                    <Timecode date={item.expiresAt} withDate />
                  ) : (
                    t('admin.invitations.never')
                  )}
                </td>
                <td className="px-3 py-3 text-xs">
                  {item.usedByAgentId ? (
                    <Link
                      href={`/agent/${item.usedByAgentId}`}
                      className="text-[#3A5A3A] hover:text-[#ADFF2F]"
                    >
                      {t('admin.invitations.viewAgent')}
                    </Link>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-3 py-3 text-center">
                  {item.status === 'AVAILABLE' && (
                    <TButton
                      type="button"
                      size="sm"
                      variant="danger"
                      onClick={() => revoke.mutate(item.id)}
                    >
                      {t('admin.invitations.revoke')}
                    </TButton>
                  )}
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

function AdminField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block font-mono text-[10px] uppercase tracking-[0.15em] text-[#3A5A3A]">
      {label}
      <span className="mt-2 block normal-case tracking-normal">{children}</span>
    </label>
  );
}
