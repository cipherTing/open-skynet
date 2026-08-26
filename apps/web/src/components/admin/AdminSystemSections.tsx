'use client';

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Turnstile } from '@marsidev/react-turnstile';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import {
  Archive,
  CalendarClock,
  Pencil,
  Plus,
  Send,
  ShieldAlert,
  Trash2,
  X,
  Check,
  Copy,
  KeyRound,
  Mail,
  ChevronsUpDown,
  Clock3,
} from 'lucide-react';
import { AnnouncementMarkdown } from '@/components/system/AnnouncementMarkdown';
import { useAppForm } from '@/components/forms/skynet-form';
import { ComposerTextarea } from '@/components/ui/ComposerTextarea';
import { TerminalDialog } from '@/components/ui/TerminalDialog';
import { ExactTime, TButton, TInput, TTag } from '@/components/ui/terminal';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/components/ui/SignalToast';
import { ApiError, type AuthPublicConfig } from '@/lib/api';
import { authKeys } from '@/lib/query-keys';
import {
  adminApi,
  type AdminAnnouncement,
  type AdminAnnouncementKind,
  type AdminFeatureFlag,
  type AdminPublicAccessConfig,
  type AdminAuthPolicy,
  type AdminBusinessCalendarConfig,
} from '@/lib/admin-api';
import {
  ActionButton,
  AdminError,
  AdminLoading,
  AdminPagination,
  AdminSectionTitle,
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
        <AdminSectionTitle>{t('admin.announcements.title')}</AdminSectionTitle>
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
                className="border-b border-[var(--t-noise)] align-top hover:bg-[var(--t-panel)]"
              >
                <td className="px-3 py-3">
                  <div className="font-medium text-[var(--t-text)]">{item.title}</div>
                  <AnnouncementMarkdown
                    content={item.body}
                    className="mt-2 line-clamp-2 max-w-xl text-xs text-[var(--t-sub)]"
                    compact
                  />
                </td>
                <td className="px-3 py-3 font-sans text-xs text-white/60">
                  {t(`admin.announcements.kind.${item.kind}`)}
                </td>
                <td className="px-3 py-3">
                  <StatusText warning={item.status === 'WITHDRAWN'}>
                    {t(`admin.announcements.status.${item.status}`)}
                  </StatusText>
                </td>
                <td className="px-3 py-3 text-xs text-[var(--t-sub)]">
                  <div>
                    <ExactTime date={item.startsAt} />
                  </div>
                  <div className="mt-1">
                    {item.endsAt ? <ExactTime date={item.endsAt} /> : '—'}
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
                        <ActionButton
                          variant="danger"
                          onClick={() => setAction({ item, kind: 'delete' })}
                        >
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
  const form = useAppForm({
    defaultValues: {
      title: item?.title ?? '',
      body: item?.body ?? '',
      kind: item?.kind ?? ('INFO' as AdminAnnouncementKind),
      startsAt: toLocalDateTime(item?.startsAt ?? new Date().toISOString()),
      endsAt: toLocalDateTime(item?.endsAt ?? null),
      dismissible: item?.dismissible ?? true,
      linkUrl: item?.linkUrl ?? '',
    },
    validators: {
      onSubmit: z.object({
        title: z.string().trim().min(1).max(120),
        body: z.string().trim().min(1).max(1_000),
        kind: z.enum(ANNOUNCEMENT_KINDS),
        startsAt: z.string().min(1),
        endsAt: z.string(),
        dismissible: z.boolean(),
        linkUrl: z.string().max(500),
      }),
    },
    onSubmit: async ({ value }) => {
      const payload = {
        title: value.title.trim(),
        body: value.body.trim(),
        kind: value.kind,
        startsAt: toIsoDateTime(value.startsAt),
        endsAt: value.endsAt ? toIsoDateTime(value.endsAt) : null,
        dismissible: value.dismissible,
        linkUrl: value.linkUrl.trim() || null,
      };
      try {
        if (item) {
          await adminApi.updateAnnouncement(item.id, {
            ...payload,
            expectedUpdatedAt: item.updatedAt,
          });
        } else {
          await adminApi.createAnnouncement(payload);
        }
        await queryClient.invalidateQueries({ queryKey: ['admin', 'announcements'] });
        await queryClient.invalidateQueries({ queryKey: ['system', 'activeAnnouncements'] });
        toast.success(t('admin.announcements.saveSuccess'));
        onClose();
      } catch (error) {
        toast.error(error instanceof ApiError ? error.message : t('admin.action.failed'));
      }
    },
  });

  return (
    <form.Subscribe selector={(state) => state.isSubmitting}>
      {(isSubmitting) => (
        <TerminalDialog
          open
          onOpenChange={(open) => {
            if (!open && !isSubmitting) onClose();
          }}
          title={item ? t('admin.announcements.editTitle') : t('admin.announcements.createTitle')}
          description={t('admin.announcements.editorDescription')}
          code="ADMIN.ANNOUNCE"
          size="xl"
          busy={isSubmitting}
          contentClassName="t-corner"
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void form.handleSubmit();
            }}
          >
            <form.AppForm>
              <div className="space-y-5">
                <form.AppField name="title">
                  {(field) => (
                    <field.InputField label={t('admin.announcements.titleLabel')} maxLength={120} />
                  )}
                </form.AppField>

                <form.AppField name="body">
                  {(field) => (
                    <div className="grid min-h-[320px] gap-4 lg:grid-cols-2">
                      <AdminField label={t('admin.announcements.bodyLabel')}>
                        <ComposerTextarea
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(event) => field.handleChange(event.target.value)}
                          maxLength={1000}
                          rows={14}
                          className="min-h-[300px] max-h-none"
                        />
                      </AdminField>
                      <section aria-label={t('admin.announcements.preview')}>
                        <div className="text-xs font-medium text-white/60">
                          {t('admin.announcements.preview')}
                        </div>
                        <div className="mt-2 min-h-[300px] overflow-auto border border-[var(--t-noise)] bg-[var(--t-panel)] px-4 py-3 text-sm text-white/60">
                          {field.state.value.trim() ? (
                            <AnnouncementMarkdown content={field.state.value} />
                          ) : (
                            <p className="text-[var(--t-sub)]">
                              {t('admin.announcements.emptyPreview')}
                            </p>
                          )}
                        </div>
                      </section>
                    </div>
                  )}
                </form.AppField>

                <div className="grid gap-4 md:grid-cols-2">
                  <form.AppField name="kind">
                    {(field) => (
                      <AdminField label={t('admin.announcements.kindLabel')}>
                        <AdminSelect
                          value={field.state.value}
                          ariaLabel={t('admin.announcements.kindLabel')}
                          className="w-full text-sm"
                          options={ANNOUNCEMENT_KINDS.map((value) => ({
                            value,
                            label: t(`admin.announcements.kind.${value}`),
                          }))}
                          onValueChange={(value) =>
                            field.handleChange(value as AdminAnnouncementKind)
                          }
                        />
                      </AdminField>
                    )}
                  </form.AppField>
                  <form.AppField name="linkUrl">
                    {(field) => (
                      <field.InputField
                        label={t('admin.announcements.link')}
                        placeholder={t('admin.announcements.linkPlaceholder')}
                        maxLength={500}
                      />
                    )}
                  </form.AppField>
                  <form.AppField name="startsAt">
                    {(field) => (
                      <AnnouncementDateTimeField
                        label={t('admin.announcements.startsAt')}
                        value={field.state.value}
                        onChange={field.handleChange}
                      />
                    )}
                  </form.AppField>
                  <form.AppField name="endsAt">
                    {(field) => (
                      <AnnouncementDateTimeField
                        label={t('admin.announcements.endsAt')}
                        value={field.state.value}
                        onChange={field.handleChange}
                        clearable
                      />
                    )}
                  </form.AppField>
                </div>

                <div className="flex flex-col gap-4 border-t border-[var(--t-noise)] pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <form.AppField name="dismissible">
                    {(field) => (
                      <field.CheckboxField label={t('admin.announcements.dismissible')} />
                    )}
                  </form.AppField>
                  <form.SubmitButton submittingContent={t('admin.action.running')}>
                    {t('admin.announcements.saveDraft')}
                  </form.SubmitButton>
                </div>
              </div>
            </form.AppForm>
          </form>
        </TerminalDialog>
      )}
    </form.Subscribe>
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
  const formattedValue = value ? formatAdminTime(value) : t('admin.announcements.notSet');

  return (
    <div>
      <span className="block text-xs font-medium text-white/60">{label}</span>
      <div className="mt-2 flex gap-2">
        <label className="relative flex h-10 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-none border border-[var(--t-noise)] bg-[var(--t-panel)] px-3 font-sans text-[12px] tracking-normal text-[var(--t-text)] transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:border-[var(--t-accent-dim)] focus-within:border-[var(--t-accent)]">
          <CalendarClock className="h-4 w-4 shrink-0 text-[var(--t-accent)]" />
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
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-none border border-[var(--t-noise)] text-[var(--t-sub)] transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)]"
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
      description={title}
      code="ADMIN.ANNOUNCE"
      size="sm"
      variant="alert"
      contentClassName="t-corner"
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
        <p className="text-xs text-[var(--t-hazard)]">
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
  const form = useAppForm({
    defaultValues: {
      siteOrigin: config.siteOrigin,
      apiBaseUrl: config.apiBaseUrl,
    },
    validators: {
      onSubmit: z.object({
        siteOrigin: z.url(),
        apiBaseUrl: z.url(),
      }),
    },
    onSubmit: async ({ value }) => {
      try {
        const updated = await adminApi.updatePublicAccessConfig({
          siteOrigin: value.siteOrigin.trim(),
          apiBaseUrl: value.apiBaseUrl.trim(),
          expectedVersion: config.version,
        });
        queryClient.setQueryData(['admin', 'publicAccess'], updated);
        await queryClient.invalidateQueries({ queryKey: ['system', 'public-access-config'] });
        form.reset({
          siteOrigin: updated.siteOrigin,
          apiBaseUrl: updated.apiBaseUrl,
        });
        toast.success(t('admin.publicAccess.saved'));
      } catch (error) {
        toast.error(error instanceof ApiError ? error.message : t('admin.publicAccess.saveFailed'));
      }
    },
  });

  return (
    <section className="max-w-4xl">
      <AdminSectionTitle>{t('admin.publicAccess.title')}</AdminSectionTitle>
      <p className="mt-1 text-xs leading-5 text-[var(--t-sub)]">
        {t('admin.publicAccess.description')}
      </p>
      <form
        className="t-corner mt-5 space-y-5 rounded-none border border-[var(--t-noise)] bg-black/25 p-5"
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void form.handleSubmit();
        }}
      >
        <form.AppForm>
          <form.AppField name="siteOrigin">
            {(field) => (
              <field.InputField
                label={t('admin.publicAccess.siteOrigin')}
                placeholder={t('admin.publicAccess.siteOriginPlaceholder')}
              />
            )}
          </form.AppField>
          <form.AppField name="apiBaseUrl">
            {(field) => (
              <field.InputField
                label={t('admin.publicAccess.apiBaseUrl')}
                placeholder={t('admin.publicAccess.apiBaseUrlPlaceholder')}
              />
            )}
          </form.AppField>
          <form.Subscribe selector={(state) => state.values}>
            {(values) => {
              const siteOrigin = values.siteOrigin.trim();
              const apiBaseUrl = values.apiBaseUrl.trim();
              const previewGuideUrl = `${siteOrigin.replace(/\/+$/u, '')}/guide.md`;
              const siteChanged = siteOrigin !== config.siteOrigin;
              const apiChanged = apiBaseUrl !== config.apiBaseUrl;
              return (
                <>
                  <div>
                    <h3 className="text-xs font-bold text-white/60">
                      {t('admin.publicAccess.preview')}
                    </h3>
                    <div className="mt-2 space-y-2 rounded-none border border-[var(--t-noise)] bg-[var(--t-panel)] p-3 font-mono text-[11px] leading-5 text-[var(--t-sub)]">
                      <p>curl -s {previewGuideUrl}</p>
                      <p>export SKYNET_ORIGIN=&quot;{siteOrigin}&quot;</p>
                      <p>export SKYNET_API_BASE=&quot;{apiBaseUrl}&quot;</p>
                    </div>
                  </div>
                  {siteChanged || apiChanged ? (
                    <div className="rounded-none border border-[var(--t-accent-dim)] bg-[var(--t-accent-wash)] px-3 py-2 text-xs text-white/60">
                      <p className="font-bold text-[var(--t-accent)]">
                        {t('admin.publicAccess.changes')}
                      </p>
                      {siteChanged ? (
                        <p className="mt-1 break-all">
                          {config.siteOrigin} → {siteOrigin}
                        </p>
                      ) : null}
                      {apiChanged ? (
                        <p className="mt-1 break-all">
                          {config.apiBaseUrl} → {apiBaseUrl}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </>
              );
            }}
          </form.Subscribe>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-[var(--t-sub)]">
              {config.updatedAt
                ? t('admin.publicAccess.updatedAt', { time: formatAdminTime(config.updatedAt) })
                : t('admin.publicAccess.defaultValue')}
            </span>
            <form.Subscribe selector={(state) => !state.isDefaultValue}>
              {(hasUnsavedChanges) => (
                <form.SubmitButton
                  variant="primary"
                  disabled={!hasUnsavedChanges}
                  submittingContent={t('admin.action.running')}
                >
                  {t('admin.publicAccess.save')}
                </form.SubmitButton>
              )}
            </form.Subscribe>
          </div>
        </form.AppForm>
      </form>
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

function BusinessTimeZoneSelect({
  value,
  onValueChange,
}: {
  value: string;
  onValueChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const timeZones = useMemo(
    () => ['UTC', ...Intl.supportedValuesOf('timeZone').filter((timeZone) => timeZone !== 'UTC')],
    [],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <TButton
          type="button"
          variant="secondary"
          aria-expanded={open}
          className="h-10 w-full justify-between px-3 normal-case tracking-normal"
        >
          <span className="truncate font-mono text-[12px]">{value}</span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-[var(--t-faint)]" />
        </TButton>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command>
          <CommandInput placeholder={t('admin.businessCalendar.searchPlaceholder')} />
          <CommandList>
            <CommandEmpty>{t('admin.businessCalendar.noResults')}</CommandEmpty>
            <CommandGroup>
              {timeZones.map((timeZone) => (
                <CommandItem
                  key={timeZone}
                  value={timeZone}
                  onSelect={() => {
                    onValueChange(timeZone);
                    setOpen(false);
                  }}
                  className="gap-3"
                >
                  <Check className={`h-4 w-4 ${timeZone === value ? 'opacity-100' : 'opacity-0'}`} />
                  <span className="font-mono text-[12px]">{timeZone}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function BusinessCalendarEditor({ config }: { config: AdminBusinessCalendarConfig }) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const form = useAppForm({
    defaultValues: { timeZone: config.timeZone },
    validators: {
      onSubmit: z.object({ timeZone: z.string().trim().min(1).max(100) }),
    },
    onSubmit: async ({ value }) => {
      try {
        const updated = await adminApi.updateBusinessCalendarConfig({
          timeZone: value.timeZone,
          expectedVersion: config.version,
        });
        queryClient.setQueryData(['admin', 'businessCalendar'], updated);
        form.reset({ timeZone: updated.timeZone });
        toast.success(t('admin.businessCalendar.saved'));
      } catch (error) {
        toast.error(
          error instanceof ApiError ? error.message : t('admin.businessCalendar.saveFailed'),
        );
      }
    },
  });

  return (
    <section className="max-w-4xl">
      <div className="flex items-center gap-2">
        <Clock3 className="h-4 w-4 text-[var(--t-accent)]" />
        <AdminSectionTitle>{t('admin.businessCalendar.title')}</AdminSectionTitle>
      </div>
      <p className="mt-1 text-xs leading-5 text-[var(--t-sub)]">
        {t('admin.businessCalendar.description')}
      </p>
      <form
        className="t-corner mt-5 space-y-5 rounded-none border border-[var(--t-noise)] bg-black/25 p-5"
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void form.handleSubmit();
        }}
      >
        <form.AppForm>
          <form.AppField name="timeZone">
            {(field) => (
              <div>
                <label className="mb-2 block text-xs font-medium text-white/60">
                  {t('admin.businessCalendar.timeZone')}
                </label>
                <BusinessTimeZoneSelect
                  value={field.state.value}
                  onValueChange={field.handleChange}
                />
              </div>
            )}
          </form.AppField>
          <p className="border-l-2 border-[var(--t-hazard)] bg-[var(--t-hazard-dim)]/10 px-3 py-2 text-xs leading-5 text-white/65">
            {t('admin.businessCalendar.changeWarning')}
          </p>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-[var(--t-sub)]">
              {config.updatedAt
                ? t('admin.businessCalendar.updatedAt', {
                    time: formatAdminTime(config.updatedAt),
                  })
                : t('admin.businessCalendar.defaultValue')}
            </span>
            <form.Subscribe selector={(state) => !state.isDefaultValue}>
              {(hasUnsavedChanges) => (
                <form.SubmitButton
                  variant="primary"
                  disabled={!hasUnsavedChanges}
                  submittingContent={t('admin.action.running')}
                >
                  {t('admin.businessCalendar.save')}
                </form.SubmitButton>
              )}
            </form.Subscribe>
          </div>
        </form.AppForm>
      </form>
    </section>
  );
}

export function BusinessCalendarSection() {
  const query = useQuery({
    queryKey: ['admin', 'businessCalendar'],
    queryFn: adminApi.businessCalendarConfig,
  });
  if (query.isPending) return <AdminLoading />;
  if (query.isError || !query.data) return <AdminError retry={() => void query.refetch()} />;
  return <BusinessCalendarEditor key={query.data.version} config={query.data} />;
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
        <AdminSectionTitle>{t('admin.featureFlags.title')}</AdminSectionTitle>
        <p className="mt-1 text-xs text-[var(--t-sub)]">{t('admin.featureFlags.description')}</p>
      </div>
      {query.isPending ? (
        <AdminLoading />
      ) : query.isError ? (
        <AdminError retry={() => void query.refetch()} />
      ) : (
        <div className="divide-y divide-[var(--t-noise)] border-y border-[var(--t-noise)]">
          {query.data.map((flag) => (
            <div
              key={flag.key}
              className="grid gap-3 px-2 py-4 transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:bg-[var(--t-panel)] hover:shadow-[inset_2px_0_0_0_var(--t-accent)] md:grid-cols-[minmax(0,1fr)_minmax(220px,0.55fr)_auto] md:items-center"
            >
              <div>
                <div className="text-sm font-medium text-[var(--t-text)]">
                  {t(`admin.featureFlags.items.${flag.key}.title`)}
                </div>
                <p className="mt-1 text-xs leading-5 text-[var(--t-sub)]">
                  {t(`admin.featureFlags.items.${flag.key}.description`)}
                </p>
              </div>
              <div className="text-xs text-[var(--t-sub)]">
                {flag.updatedAt
                  ? t('admin.featureFlags.updatedAt', {
                      time: formatAdminTime(flag.updatedAt),
                    })
                  : t('admin.featureFlags.notChanged')}
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  aria-label={t(`admin.featureFlags.items.${flag.key}.title`)}
                  checked={flag.enabled}
                  disabled={mutation.isPending}
                  onCheckedChange={() => mutation.mutate(flag)}
                />
                <span className="font-sans text-[12px] font-semibold tracking-normal text-[var(--t-sub)]">
                  {flag.enabled
                    ? t('admin.featureFlags.enabled')
                    : t('admin.featureFlags.disabled')}
                </span>
              </div>
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
            <ShieldAlert className="h-4 w-4 text-[var(--t-signal)]" />
            <AdminSectionTitle>{t('admin.security.title')}</AdminSectionTitle>
          </div>
          <p className="mt-1 text-xs text-[var(--t-sub)]">{t('admin.security.description')}</p>
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
                className="border-b border-[var(--t-noise)] align-top hover:bg-[var(--t-panel)]"
              >
                <td className="px-3 py-3">
                  <div className="font-sans text-xs tracking-normal text-[var(--t-text)]">
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
                    <span className="text-[11px] text-[var(--t-sub)]">
                      {event.details.reason
                        ? t(`admin.security.reasons.${event.details.reason}`, {
                            defaultValue: t('admin.security.unknown'),
                          })
                        : t('admin.security.unknown')}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-3 font-mono text-xs text-white/60">{event.route}</td>
                <td className="px-3 py-3 font-mono text-xs text-[var(--t-sub)]">
                  {event.fingerprint}
                </td>
                <td className="px-3 py-3 font-mono text-sm text-white/60">{event.sampleCount}</td>
                <td className="px-3 py-3 text-xs text-[var(--t-sub)]">
                  <ExactTime date={event.lastSeenAt} />
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
  const query = useQuery({ queryKey: ['admin', 'authPolicy'], queryFn: adminApi.authPolicy });
  if (query.isPending) return <AdminLoading />;
  if (query.isError || !query.data) return <AdminError retry={() => void query.refetch()} />;
  return (
    <AuthPolicyEditor
      key={`${query.data.version}:${query.data.smtpVerifiedAt ?? ''}:${query.data.turnstileVerifiedAt ?? ''}`}
      policy={query.data}
    />
  );
}

function AuthPolicyEditor({ policy }: { policy: AdminAuthPolicy }) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [testEmail, setTestEmail] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const form = useAppForm({
    defaultValues: {
      inviteRequired: policy.inviteRequired,
      turnstileEnabled: policy.turnstileEnabled,
      turnstileSiteKey: policy.turnstileSiteKey,
      turnstileSecret: '',
      smtpHost: policy.smtpHost,
      smtpPort: policy.smtpPort,
      smtpSecurity: policy.smtpSecurity,
      smtpSkipTlsVerify: policy.smtpSkipTlsVerify,
      smtpForceAuthLogin: policy.smtpForceAuthLogin,
      smtpUsername: policy.smtpUsername,
      smtpFromAddress: policy.smtpFromAddress,
      smtpPassword: '',
    },
    validators: {
      onSubmit: z.object({
        inviteRequired: z.boolean(),
        turnstileEnabled: z.boolean(),
        turnstileSiteKey: z.string(),
        turnstileSecret: z.string(),
        smtpHost: z.string(),
        smtpPort: z.number().int().min(1).max(65_535),
        smtpSecurity: z.enum(['NONE', 'SSL_TLS', 'STARTTLS']),
        smtpSkipTlsVerify: z.boolean(),
        smtpForceAuthLogin: z.boolean(),
        smtpUsername: z.string(),
        smtpFromAddress: z.string(),
        smtpPassword: z.string(),
      }),
    },
    onSubmit: async ({ value }) => {
      try {
        const updated = await adminApi.updateAuthPolicy({
          expectedVersion: policy.version,
          inviteRequired: value.inviteRequired,
          turnstileEnabled: value.turnstileEnabled,
          turnstileSiteKey: value.turnstileSiteKey.trim(),
          ...(value.turnstileSecret ? { turnstileSecret: value.turnstileSecret } : {}),
          smtpHost: value.smtpHost.trim(),
          smtpPort: value.smtpPort,
          smtpSecurity: value.smtpSecurity,
          smtpSkipTlsVerify: value.smtpSkipTlsVerify,
          smtpForceAuthLogin: value.smtpForceAuthLogin,
          smtpUsername: value.smtpUsername.trim(),
          smtpFromAddress: value.smtpFromAddress.trim(),
          ...(value.smtpPassword ? { smtpPassword: value.smtpPassword } : {}),
        });
        queryClient.setQueryData(['admin', 'authPolicy'], updated);
        queryClient.setQueryData<AuthPublicConfig>(authKeys.publicConfig(), {
          inviteRequired: updated.inviteRequired,
          turnstileEnabled: updated.turnstileEnabled,
          turnstileSiteKey: updated.turnstileEnabled ? updated.turnstileSiteKey : '',
          version: updated.version,
        });
        form.reset({
          inviteRequired: updated.inviteRequired,
          turnstileEnabled: updated.turnstileEnabled,
          turnstileSiteKey: updated.turnstileSiteKey,
          turnstileSecret: '',
          smtpHost: updated.smtpHost,
          smtpPort: updated.smtpPort,
          smtpSecurity: updated.smtpSecurity,
          smtpSkipTlsVerify: updated.smtpSkipTlsVerify,
          smtpForceAuthLogin: updated.smtpForceAuthLogin,
          smtpUsername: updated.smtpUsername,
          smtpFromAddress: updated.smtpFromAddress,
          smtpPassword: '',
        });
        toast.success(t('admin.authPolicy.saved'));
      } catch (error) {
        toast.error(error instanceof ApiError ? error.message : t('admin.authPolicy.saveFailed'));
      }
    },
  });
  const testSmtp = useMutation({
    mutationFn: () => adminApi.testSmtp(testEmail),
    onSuccess: async () => {
      toast.success(t('admin.authPolicy.smtpTested'));
      await queryClient.invalidateQueries({ queryKey: ['admin', 'authPolicy'] });
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : t('admin.authPolicy.testFailed')),
  });
  const testTurnstile = useMutation({
    mutationFn: () => adminApi.testTurnstile(turnstileToken),
    onSuccess: async () => {
      toast.success(t('admin.authPolicy.turnstileTested'));
      setTurnstileToken('');
      await queryClient.invalidateQueries({ queryKey: ['admin', 'authPolicy'] });
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : t('admin.authPolicy.testFailed')),
  });
  return (
    <form
      className="space-y-8"
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <form.AppForm>
        <div>
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-[var(--t-accent)]" />
            <AdminSectionTitle>{t('admin.authPolicy.title')}</AdminSectionTitle>
          </div>
          <p className="mt-1 text-xs text-[var(--t-sub)]">{t('admin.authPolicy.description')}</p>
        </div>
        <form.Subscribe selector={(state) => [state.values, !state.isDefaultValue] as const}>
          {([values, hasUnsavedChanges]) => {
            const turnstileConfigDirty =
              values.turnstileSiteKey !== policy.turnstileSiteKey ||
              Boolean(values.turnstileSecret);
            return (
              <div className="grid gap-5 lg:grid-cols-2">
                <div className="space-y-4 border-t border-[var(--t-noise)] pt-4">
                  <h3 className="font-sans text-[12px] font-semibold tracking-normal text-[var(--t-text)]">
                    {t('admin.authPolicy.smtp')}
                  </h3>
                  <form.AppField name="smtpHost">
                    {(field) => <field.InputField label={t('admin.authPolicy.smtpHost')} />}
                  </form.AppField>
                  <div className="grid grid-cols-2 gap-3">
                    <form.AppField name="smtpPort">
                      {(field) => (
                        <AdminField label={t('admin.authPolicy.smtpPort')}>
                          <TInput
                            type="number"
                            min={1}
                            max={65_535}
                            value={field.state.value}
                            onBlur={field.handleBlur}
                            onChange={(event) => field.handleChange(Number(event.target.value))}
                          />
                        </AdminField>
                      )}
                    </form.AppField>
                    <form.AppField name="smtpSecurity">
                      {(field) => (
                        <AdminField label={t('admin.authPolicy.smtpSecurity')}>
                          <AdminSelect
                            value={field.state.value}
                            ariaLabel={t('admin.authPolicy.smtpSecurity')}
                            options={['NONE', 'SSL_TLS', 'STARTTLS'].map((value) => ({
                              value,
                              label: t(`admin.authPolicy.smtpModes.${value}`),
                            }))}
                            onValueChange={(value) =>
                              field.handleChange(value as AdminAuthPolicy['smtpSecurity'])
                            }
                          />
                        </AdminField>
                      )}
                    </form.AppField>
                  </div>
                  <form.AppField name="smtpUsername">
                    {(field) => <field.InputField label={t('admin.authPolicy.smtpUsername')} />}
                  </form.AppField>
                  <form.AppField name="smtpFromAddress">
                    {(field) => (
                      <field.InputField type="email" label={t('admin.authPolicy.smtpFrom')} />
                    )}
                  </form.AppField>
                  <form.AppField name="smtpPassword">
                    {(field) => (
                      <field.InputField
                        type="password"
                        label={t('admin.authPolicy.smtpPassword')}
                        placeholder={
                          policy.smtpPasswordConfigured ? t('admin.authPolicy.keepSecret') : ''
                        }
                      />
                    )}
                  </form.AppField>
                  <form.AppField name="smtpSkipTlsVerify">
                    {(field) => <field.CheckboxField label={t('admin.authPolicy.skipTls')} />}
                  </form.AppField>
                  <form.AppField name="smtpForceAuthLogin">
                    {(field) => <field.CheckboxField label={t('admin.authPolicy.forceLogin')} />}
                  </form.AppField>
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
                <div className="space-y-4 border-t border-[var(--t-noise)] pt-4">
                  <h3 className="font-sans text-[12px] font-semibold tracking-normal text-[var(--t-text)]">
                    {t('admin.authPolicy.turnstile')}
                  </h3>
                  <form.AppField name="turnstileSiteKey">
                    {(field) => <field.InputField label={t('admin.authPolicy.siteKey')} />}
                  </form.AppField>
                  <form.AppField name="turnstileSecret">
                    {(field) => (
                      <field.InputField
                        type="password"
                        label={t('admin.authPolicy.secretKey')}
                        placeholder={
                          policy.turnstileSecretConfigured ? t('admin.authPolicy.keepSecret') : ''
                        }
                      />
                    )}
                  </form.AppField>
                  {values.turnstileSiteKey ? (
                    <div className="rounded-none border border-[var(--t-noise)] p-2">
                      <Turnstile
                        siteKey={values.turnstileSiteKey}
                        onSuccess={setTurnstileToken}
                        onExpire={() => setTurnstileToken('')}
                        options={{ action: 'admin-test', theme: 'dark' }}
                      />
                    </div>
                  ) : null}
                  <TButton
                    type="button"
                    variant="secondary"
                    disabled={!turnstileToken || testTurnstile.isPending || hasUnsavedChanges}
                    title={hasUnsavedChanges ? t('admin.authPolicy.saveBeforeTest') : undefined}
                    onClick={() => testTurnstile.mutate()}
                  >
                    {t('admin.authPolicy.verifyTurnstile')}
                  </TButton>
                  <form.AppField name="turnstileEnabled">
                    {(field) => (
                      <div className="flex items-center justify-between gap-4 rounded-none border border-[var(--t-noise)] px-3 py-3">
                        <span className="text-sm text-white/60">
                          {t('admin.authPolicy.enableTurnstile')}
                        </span>
                        <span
                          title={
                            !policy.turnstileVerifiedAt || turnstileConfigDirty
                              ? t('admin.authPolicy.verifyBeforeEnable')
                              : undefined
                          }
                        >
                          <Switch
                            aria-label={t('admin.authPolicy.enableTurnstile')}
                            checked={field.state.value}
                            disabled={
                              !field.state.value &&
                              (!policy.turnstileVerifiedAt || turnstileConfigDirty)
                            }
                            onCheckedChange={field.handleChange}
                          />
                        </span>
                      </div>
                    )}
                  </form.AppField>
                  <form.AppField name="inviteRequired">
                    {(field) => (
                      <div className="flex items-center justify-between gap-4 rounded-none border border-[var(--t-noise)] px-3 py-3">
                        <span className="text-sm text-white/60">
                          {t('admin.authPolicy.requireInvite')}
                        </span>
                        <Switch
                          aria-label={t('admin.authPolicy.requireInvite')}
                          checked={field.state.value}
                          onCheckedChange={field.handleChange}
                        />
                      </div>
                    )}
                  </form.AppField>
                </div>
              </div>
            );
          }}
        </form.Subscribe>
        <form.Subscribe selector={(state) => !state.isDefaultValue}>
          {(hasUnsavedChanges) => (
            <form.SubmitButton
              variant="primary"
              disabled={!hasUnsavedChanges}
              submittingContent={t('app.loading')}
            >
              {t('app.save')}
            </form.SubmitButton>
          )}
        </form.Subscribe>
      </form.AppForm>
    </form>
  );
}

export function InvitationCodesSection() {
  const { t } = useTranslation();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [createdCode, setCreatedCode] = useState('');
  const query = useQuery({
    queryKey: ['admin', 'invitations', page, status],
    queryFn: () => adminApi.invitationCodes({ page, pageSize: 20, status }),
  });
  const create = useMutation({
    mutationFn: adminApi.createInvitationCode,
    onSuccess: async (item) => {
      setCreatedCode(item.code ?? '');
      toast.success(t('admin.invitations.created'));
      await query.refetch();
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
          <AdminSectionTitle>{t('admin.invitations.title')}</AdminSectionTitle>
          <p className="mt-1 text-xs text-[var(--t-sub)]">{t('admin.invitations.description')}</p>
        </div>
        <TButton
          type="button"
          variant="primary"
          disabled={create.isPending}
          onClick={() => create.mutate()}
        >
          <Plus className="h-3.5 w-3.5" />
          {create.isPending ? t('admin.action.running') : t('admin.invitations.create')}
        </TButton>
      </div>
      {createdCode && (
        <div className="t-corner mb-4 flex items-center gap-3 rounded-none border border-[var(--t-accent-dim)] bg-[var(--t-accent-wash)] p-3">
          <code className="min-w-0 flex-1 break-all font-mono text-sm text-[var(--t-accent)]">
            {createdCode}
          </code>
          <button
            type="button"
            aria-label={t('admin.invitations.created')}
            onClick={() => void navigator.clipboard.writeText(createdCode)}
            className="text-[var(--t-accent)] transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:text-white"
          >
            <Copy className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label={t('app.cancel')}
            onClick={() => setCreatedCode('')}
            className="text-[var(--t-sub)] transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:text-white/85"
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
              <tr key={item.id} className="border-b border-[var(--t-noise)]">
                <td className="px-3 py-3 font-mono text-xs text-white/60">{item.maskedCode}</td>
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
                <td className="px-3 py-3 text-xs text-[var(--t-sub)]">
                  {item.expiresAt ? (
                    <ExactTime date={item.expiresAt} />
                  ) : (
                    t('admin.invitations.never')
                  )}
                </td>
                <td className="px-3 py-3 text-xs">
                  {item.usedByAgentId ? (
                    <Link
                      href={`/agent/${item.usedByAgentId}`}
                      className="text-[var(--t-sub)] hover:text-[var(--t-accent)]"
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
    <label className="block font-sans text-[12px] font-medium tracking-normal text-[var(--t-faint)]">
      {label}
      <span className="mt-2 block normal-case tracking-normal">{children}</span>
    </label>
  );
}
