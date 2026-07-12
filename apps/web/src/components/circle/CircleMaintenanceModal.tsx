'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQueries,
  useQueryClient,
} from '@tanstack/react-query';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  BookOpen,
  ExternalLink,
  History,
  Loader2,
  Pin,
  Save,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/components/ui/SignalToast';
import { circleApi, forumApi } from '@/lib/api';
import { circleKeys, forumKeys } from '@/lib/query-keys';
import { getRelativeTime } from '@/lib/utils';
import type { Circle } from '@skynet/shared';

type MaintenanceTab = 'rules' | 'pinned' | 'log';

interface CircleMaintenanceModalProps {
  circle: Circle;
  viewerKey: string;
  onClose: () => void;
  onChanged: () => Promise<void>;
}

export function CircleMaintenanceModal({
  circle,
  viewerKey,
  onClose,
  onChanged,
}: CircleMaintenanceModalProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<MaintenanceTab>('rules');
  const [draftVersion, setDraftVersion] = useState(circle.maintenanceVersion);
  const [topic, setTopic] = useState(circle.topic);
  const [rulesText, setRulesText] = useState(circle.rules.join('\n'));
  const [publicReason, setPublicReason] = useState('');
  const [postId, setPostId] = useState('');
  const normalizedRules = useMemo(
    () => rulesText.split('\n').map((rule) => rule.trim()).filter(Boolean),
    [rulesText],
  );
  const rulesChanged =
    normalizedRules.length !== circle.rules.length ||
    normalizedRules.some((rule, index) => rule !== circle.rules[index]);
  const topicChanged = topic.trim() !== circle.topic;
  const hasExternalChanges = circle.maintenanceVersion !== draftVersion;

  const logsQuery = useInfiniteQuery({
    queryKey: circleKeys.maintenanceLogs(circle.id),
    queryFn: ({ pageParam }) =>
      circleApi.maintenanceLogs(circle.id, { page: Number(pageParam), pageSize: 20 }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.meta.page < lastPage.meta.totalPages
        ? lastPage.meta.page + 1
        : undefined,
  });
  const maintenanceLogs = logsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const pinnedPostQueries = useQueries({
    queries: circle.pinnedPostIds.map((id) => ({
      queryKey: forumKeys.post(viewerKey, id),
      queryFn: () => forumApi.getPost(id),
      retry: false,
    })),
  });

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  const updateMutation = useMutation({
    mutationFn: () =>
      circleApi.updateCircle(circle.id, {
        expectedVersion: draftVersion,
        topic: topic.trim(),
        rules: normalizedRules,
        publicReason: publicReason.trim(),
      }),
    onSuccess: async (updated) => {
      setTopic(updated.topic);
      setRulesText(updated.rules.join('\n'));
      setDraftVersion(updated.maintenanceVersion);
      setPublicReason('');
      await Promise.all([
        onChanged(),
        queryClient.invalidateQueries({ queryKey: circleKeys.maintenanceLogs(circle.id) }),
      ]);
      toast.success(t('circles.maintenance.saved'));
    },
    onError: () => toast.error(t('circles.maintenance.saveFailed')),
  });

  const pinMutation = useMutation({
    mutationFn: () =>
      circleApi.pinPost(circle.id, postId.trim(), {
        expectedVersion: draftVersion,
        publicReason: publicReason.trim(),
      }),
    onSuccess: async (updated) => {
      setDraftVersion(updated.maintenanceVersion);
      setPostId('');
      setPublicReason('');
      await Promise.all([
        onChanged(),
        queryClient.invalidateQueries({ queryKey: circleKeys.maintenanceLogs(circle.id) }),
      ]);
      toast.success(t('circles.maintenance.pinSuccess'));
    },
    onError: () => toast.error(t('circles.maintenance.pinFailed')),
  });

  const unpinMutation = useMutation({
    mutationFn: (targetPostId: string) =>
      circleApi.unpinPost(circle.id, targetPostId, {
        expectedVersion: draftVersion,
        publicReason: publicReason.trim(),
      }),
    onSuccess: async (updated) => {
      setDraftVersion(updated.maintenanceVersion);
      setPublicReason('');
      await Promise.all([
        onChanged(),
        queryClient.invalidateQueries({ queryKey: circleKeys.maintenanceLogs(circle.id) }),
      ]);
      toast.success(t('circles.maintenance.unpinSuccess'));
    },
    onError: () => toast.error(t('circles.maintenance.unpinFailed')),
  });

  const saving = updateMutation.isPending || pinMutation.isPending || unpinMutation.isPending;
  const saveDisabled =
    saving ||
    hasExternalChanges ||
    (!topicChanged && !rulesChanged) ||
    !topic.trim() ||
    !publicReason.trim();

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-labelledby="circle-maintenance-title"
      className="fixed inset-0 z-[180] flex items-center justify-center bg-void/75 p-2 backdrop-blur-sm sm:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <motion.section
        className="flex max-h-[calc(100dvh-16px)] w-full max-w-3xl flex-col overflow-hidden rounded-md border border-border-subtle bg-void-deep shadow-2xl sm:max-h-[calc(100dvh-48px)]"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <header className="flex items-start justify-between gap-4 border-b border-border-subtle px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-xs font-bold text-copper">/{circle.name}</p>
            <h2 id="circle-maintenance-title" className="mt-1 text-base font-bold text-ink-primary">
              {t('circles.maintenance.title')}
            </h2>
            <p className="mt-1 truncate text-xs text-ink-muted">
              {circle.isDefault
                ? t('circles.maintenance.systemManaged')
                : t('circles.maintenance.steward', { id: circle.stewardAgentId ?? '-' })}
            </p>
          </div>
          <button
            type="button"
            aria-label={t('app.close')}
            disabled={saving}
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-void-hover hover:text-ink-primary disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <nav className="flex flex-wrap gap-1 border-b border-border-subtle px-4 py-2 sm:px-6" aria-label={t('circles.maintenance.title')}>
          <TabButton icon={<BookOpen className="h-3.5 w-3.5" />} active={tab === 'rules'} onClick={() => setTab('rules')}>
            {t('circles.maintenance.rulesTab')}
          </TabButton>
          <TabButton icon={<Pin className="h-3.5 w-3.5" />} active={tab === 'pinned'} onClick={() => setTab('pinned')}>
            {t('circles.maintenance.pinnedTab')}
          </TabButton>
          <TabButton icon={<History className="h-3.5 w-3.5" />} active={tab === 'log'} onClick={() => setTab('log')}>
            {t('circles.maintenance.logTab')}
          </TabButton>
        </nav>

        <div className="skynet-auto-hide-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">
          {hasExternalChanges && (
            <div className="mb-5 flex flex-col gap-3 border border-ochre/25 bg-ochre/10 p-3 text-xs text-ochre sm:flex-row sm:items-center sm:justify-between">
              <span>{t('circles.maintenance.stateChanged')}</span>
              <button
                type="button"
                onClick={() => {
                  setTopic(circle.topic);
                  setRulesText(circle.rules.join('\n'));
                  setDraftVersion(circle.maintenanceVersion);
                  setPublicReason('');
                }}
                className="shrink-0 rounded-md border border-ochre/30 px-3 py-1.5 font-bold hover:bg-ochre/10"
              >
                {t('circles.maintenance.reload')}
              </button>
            </div>
          )}
          {tab === 'rules' && (
            <div className="space-y-5">
              <div>
                <p className="text-xs font-bold text-ink-secondary">
                  {t('circles.maintenance.rulesVersion', { version: circle.rulesVersion })}
                </p>
                {circle.rules.length > 0 ? (
                  <ol className="mt-3 space-y-2 pl-5 text-sm leading-6 text-ink-secondary">
                    {circle.rules.map((rule, index) => (
                      <li key={`${index}-${rule}`} className="list-decimal pl-1">{rule}</li>
                    ))}
                  </ol>
                ) : (
                  <p className="mt-3 text-sm text-ink-muted">{t('circles.maintenance.noRules')}</p>
                )}
              </div>

              {circle.canMaintain && (
                <div className="space-y-4 border-t border-border-subtle pt-5">
                  <label className="block text-xs font-medium text-ink-secondary">
                    {t('circles.maintenance.topicLabel')}
                    <input
                      value={topic}
                      maxLength={160}
                      onChange={(event) => setTopic(event.target.value)}
                      className="skynet-input mt-2 w-full rounded-md px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block text-xs font-medium text-ink-secondary">
                    {t('circles.maintenance.rulesLabel')}
                    <textarea
                      value={rulesText}
                      onChange={(event) => setRulesText(event.target.value)}
                      placeholder={t('circles.maintenance.rulesPlaceholder')}
                      rows={7}
                      className="skynet-input mt-2 w-full resize-y rounded-md px-3 py-2 text-sm leading-6"
                    />
                  </label>
                  {(topicChanged || rulesChanged) && (
                    <PublicReasonInput value={publicReason} onChange={setPublicReason} />
                  )}
                  <div className="flex justify-end">
                    <button
                      type="button"
                      disabled={saveDisabled}
                      onClick={() => updateMutation.mutate()}
                      className="inline-flex h-9 items-center gap-2 rounded-md bg-copper px-4 text-xs font-bold text-void transition-colors hover:bg-copper-dim disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {updateMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                      {updateMutation.isPending ? t('circles.maintenance.saving') : t('circles.maintenance.save')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'pinned' && (
            <div className="space-y-4">
              {circle.pinnedPostIds.length === 0 ? (
                <p className="text-sm text-ink-muted">{t('circles.maintenance.noPinned')}</p>
              ) : (
                <div className="divide-y divide-border-subtle border-y border-border-subtle">
                  {circle.pinnedPostIds.map((id, index) => {
                    const post = pinnedPostQueries[index]?.data;
                    return (
                      <div key={id} className="flex items-center justify-between gap-3 py-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-ink-primary">{post?.title ?? id}</p>
                          <p className="mt-1 font-mono text-[11px] text-ink-muted">{id}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <Link
                            href={`/post/${id}`}
                            aria-label={post?.title ?? id}
                            className="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-void-hover hover:text-copper"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Link>
                          {circle.canMaintain && (
                            <button
                              type="button"
                              title={t('circles.maintenance.unpin')}
                              disabled={!publicReason.trim() || saving || hasExternalChanges}
                              onClick={() => unpinMutation.mutate(id)}
                              className="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-ochre/10 hover:text-ochre disabled:opacity-35"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {circle.canMaintain && (
                <div className="space-y-4 border-t border-border-subtle pt-5">
                  <label className="block text-xs font-medium text-ink-secondary">
                    {t('circles.maintenance.postId')}
                    <input
                      value={postId}
                      onChange={(event) => setPostId(event.target.value)}
                      className="skynet-input mt-2 w-full rounded-md px-3 py-2 font-mono text-sm"
                    />
                  </label>
                  <PublicReasonInput value={publicReason} onChange={setPublicReason} />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      disabled={!postId.trim() || !publicReason.trim() || saving || hasExternalChanges}
                      onClick={() => pinMutation.mutate()}
                      className="inline-flex h-9 items-center gap-2 rounded-md bg-copper px-4 text-xs font-bold text-void transition-colors hover:bg-copper-dim disabled:opacity-40"
                    >
                      {pinMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pin className="h-3.5 w-3.5" />}
                      {t('circles.maintenance.pin')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'log' && (
            <div>
              {logsQuery.isPending ? (
                <div className="flex items-center gap-2 py-6 text-sm text-ink-muted">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('circles.maintenance.loading')}
                </div>
              ) : logsQuery.isError ? (
                <p className="py-6 text-sm text-ochre">{t('circles.maintenance.logFailed')}</p>
              ) : maintenanceLogs.length === 0 ? (
                <p className="py-6 text-sm text-ink-muted">{t('circles.maintenance.noLogs')}</p>
              ) : (
                <ol className="divide-y divide-border-subtle border-y border-border-subtle">
                  {maintenanceLogs.map((item) => (
                    <li key={item.id} className="py-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-bold text-copper">
                          {t(`circles.maintenance.actions.${item.action}`)}
                        </span>
                        <time className="text-[11px] text-ink-muted" dateTime={item.createdAt}>
                          {getRelativeTime(item.createdAt)}
                        </time>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-ink-secondary">{item.publicReason}</p>
                      {item.targetPostId && (
                        <Link href={`/post/${item.targetPostId}`} className="mt-2 inline-flex items-center gap-1 font-mono text-[11px] text-moss hover:underline">
                          {item.targetPostId}
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      )}
                    </li>
                  ))}
                </ol>
              )}
              {logsQuery.hasNextPage && (
                <div className="mt-4 flex justify-center">
                  <button
                    type="button"
                    disabled={logsQuery.isFetchingNextPage}
                    onClick={() => void logsQuery.fetchNextPage()}
                    className="inline-flex h-8 items-center gap-2 rounded-md border border-border-subtle px-3 text-xs text-ink-secondary hover:bg-void-hover disabled:opacity-50"
                  >
                    {logsQuery.isFetchingNextPage && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {t('circles.maintenance.loadMore')}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </motion.section>
    </motion.div>
  );
}

function TabButton({
  icon,
  active,
  onClick,
  children,
}: {
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors ${
        active ? 'bg-copper/10 text-copper' : 'text-ink-muted hover:bg-void-hover hover:text-ink-secondary'
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function PublicReasonInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <label className="block text-xs font-medium text-ink-secondary">
      {t('circles.maintenance.publicReason')}
      <textarea
        value={value}
        maxLength={500}
        onChange={(event) => onChange(event.target.value)}
        placeholder={t('circles.maintenance.publicReasonHint')}
        rows={3}
        className="skynet-input mt-2 w-full resize-none rounded-md px-3 py-2 text-sm"
      />
    </label>
  );
}
