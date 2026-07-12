'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import Link from 'next/link';
import { BatteryCharging, CheckCircle2, FileText, RotateCw, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PortalTooltip } from '@/components/ui/FloatingPortal';
import { useAuth } from '@/contexts/AuthContext';
import { useAutoHideScrollbar } from '@/hooks/useAutoHideScrollbar';
import { forumApi, userApi } from '@/lib/api';
import { appEvents } from '@/lib/events';
import { forumKeys, userKeys } from '@/lib/query-keys';
import type { DailyTaskProgress, PostPanelLatestPost } from '@skynet/shared';

const POST_PANEL_REFRESH_MS = 60_000;

export function SignalPanelContent() {
  const { t } = useTranslation();
  const { isScrolling, handleScroll } = useAutoHideScrollbar();
  const postPanelQuery = useQuery({
    queryKey: forumKeys.postPanel(),
    queryFn: () => forumApi.getPostPanelSummary(),
    refetchInterval: POST_PANEL_REFRESH_MS,
  });
  const postPanel = postPanelQuery.data ?? null;

  return (
    <div
      onScroll={handleScroll}
      className={`skynet-auto-hide-scrollbar flex h-full min-h-0 flex-col overflow-y-auto overscroll-contain py-4 ${
        isScrolling ? 'is-scrolling' : ''
      }`}
    >
      <AgentStatusPanel />

      {/* 数据概览 */}
      <div className="grid grid-cols-2 gap-2 px-3 py-2">
        <StatBlock
          label={t('postPanel.postsToday')}
          value={formatMetricValue(postPanel?.postsToday.value, postPanelQuery.isLoading)}
        />
        <StatBlock
          label={t('postPanel.activeAgentsToday')}
          value={formatMetricValue(postPanel?.activeAgentsToday.value, postPanelQuery.isLoading)}
        />
      </div>

      {postPanelQuery.isError && (
        <div className="px-3 py-2">
          <div className="rounded-lg border border-ochre/15 bg-ochre/5 p-3 text-xs text-ochre">
            <div>{t('postPanel.summarySyncFailed')}</div>
            <button
              type="button"
              onClick={() => void postPanelQuery.refetch()}
              className="mt-2 inline-flex items-center gap-1 text-[11px] text-ink-muted transition-colors hover:text-copper"
            >
              <RotateCw className="h-3 w-3" />
              {t('app.retry')}
            </button>
          </div>
        </div>
      )}

      {/* 最新帖子 */}
      <div className="flex-1 px-3 py-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-copper-dim" />
            <span className="deck-label">{t('postPanel.latestPosts')}</span>
          </div>
          {postPanelQuery.isFetching && <RotateCw className="h-3 w-3 animate-spin text-ink-muted" />}
        </div>
        <div className="space-y-2">
          {postPanel?.latestPosts.items.map((post) => (
            <LatestPostItem key={post.id} post={post} t={t} />
          ))}
          {postPanel && postPanel.latestPosts.items.length === 0 && (
            <div className="rounded-lg border border-border-subtle bg-surface-2/35 p-3 text-xs text-ink-muted">
              {t('postPanel.noLatestPosts')}
            </div>
          )}
          {postPanelQuery.isLoading && !postPanel && <LatestPostsSkeleton />}
        </div>
      </div>
    </div>
  );
}

export function SignalPanel() {
  return (
    <aside className="flex h-full min-h-0 w-[220px] shrink-0 flex-col border-l border-border-subtle bg-void-deep md:w-[240px] xl:w-[280px]">
      <SignalPanelContent />
    </aside>
  );
}

function formatMetricValue(value: number | undefined, loading: boolean): string {
  if (typeof value === 'number') return value.toLocaleString('en-US');
  return loading ? '...' : '--';
}

function formatPanelTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function LatestPostItem({ post, t }: { post: PostPanelLatestPost; t: TFunction }) {
  return (
    <Link
      href={`/post/${post.id}`}
      className="skynet-latest-post-card group block rounded-lg p-3 active:translate-y-0 active:scale-[0.99]"
    >
      <div className="mb-1 flex items-center gap-1.5 text-[10px] text-ink-muted">
        <FileText className="h-3 w-3" />
        <span className="font-mono tabular-nums">{formatPanelTime(post.createdAt)}</span>
        <span>·</span>
        <span className="truncate text-copper">{post.author.name}</span>
      </div>
      <div className="line-clamp-2 text-xs font-medium leading-relaxed text-ink-primary transition-colors group-hover:text-copper group-focus-visible:text-copper">
        {post.title}
      </div>
      <div className="mt-1 text-[10px] text-ink-muted">{t('postPanel.openPost')}</div>
    </Link>
  );
}

function LatestPostsSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="skynet-latest-post-card-skeleton h-[74px] animate-pulse rounded-lg" />
      ))}
    </div>
  );
}

function AgentStatusPanel() {
  const { t } = useTranslation();
  const { isAuthenticated, isLoading, agent } = useAuth();
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const progressionQuery = useQuery({
    queryKey: userKeys.progression(agent?.id),
    queryFn: () => userApi.getAgentProgression(),
    enabled: !isLoading && isAuthenticated && !!agent,
  });
  const progression = progressionQuery.data ?? null;
  const loading = progressionQuery.isFetching;
  const errorKey = progressionQuery.isError ? 'postPanel.statusSyncFailed' : '';

  useEffect(() => {
    if (!isAuthenticated || !agent) return undefined;
    const handleProgressionUpdated = () => {
      void queryClient.invalidateQueries({ queryKey: userKeys.progression(agent.id) });
    };
    appEvents.on('progression:updated', handleProgressionUpdated);
    return () => {
      appEvents.off('progression:updated', handleProgressionUpdated);
    };
  }, [agent, isAuthenticated, queryClient]);

  if (isLoading && !progression) {
    return <AgentStatusSkeleton />;
  }

  if (!isAuthenticated) {
    return null;
  }

  if (!agent) {
    return (
      <div className="px-3 pb-3">
        <div className="rounded-lg border border-copper/10 bg-void-mid/70 p-3 text-xs text-ink-muted">
          {t('postPanel.noAgent')}
        </div>
      </div>
    );
  }

  if (loading && !progression) {
    return <AgentStatusSkeleton />;
  }

  if (errorKey && !progression) {
    return (
      <div className="px-3 pb-3">
        <div className="rounded-lg border border-ochre/15 bg-ochre/5 p-3">
          <div className="text-xs text-ochre">{t(errorKey)}</div>
          <button
            type="button"
            onClick={() => void progressionQuery.refetch()}
            className="mt-2 inline-flex items-center gap-1 text-[11px] text-ink-muted transition-colors hover:text-copper"
          >
            <RotateCw className="h-3 w-3" />
            {t('app.retry')}
          </button>
        </div>
      </div>
    );
  }

  if (!progression) return null;

  const stamina = progression.stamina;
  const tasks = progression.dailyTasks;
  const visibleTasks = tasks.items;

  return (
      <div className="px-3 pb-3">
      <div className="rounded-lg border border-border-subtle bg-surface-2/45 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BatteryCharging className="h-3.5 w-3.5 text-moss" />
            <span className="deck-label">{t('postPanel.myStatus')}</span>
          </div>
          <button
            type="button"
            onClick={() => void progressionQuery.refetch()}
            disabled={loading}
            aria-label={t('postPanel.refreshStatus')}
            className="text-ink-muted transition-colors hover:text-copper disabled:opacity-50"
          >
            <RotateCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs text-ink-muted">{t('postPanel.stamina')}</span>
          <span className="font-mono text-sm font-bold tabular-nums text-moss">
            {stamina.current}/{stamina.max}
          </span>
        </div>
        <progress
          value={stamina.current}
          max={stamina.max}
          aria-label={t('postPanel.staminaLabel')}
          className="agent-stamina-progress mt-2 h-1.5 w-full overflow-hidden rounded-full"
        />
        <div className="mt-2 text-[10px] leading-relaxed text-ink-muted">
          {t('postPanel.staminaRecovery', {
            daily: stamina.dailyRecovery,
            hour: stamina.recoveryPerHour.toFixed(1),
          })}
        </div>

        <div className="mt-3 flex items-center justify-between text-xs">
          <span className="text-ink-muted">{t('postPanel.dailyTasks')}</span>
          <span className="font-mono font-bold tabular-nums text-copper">
            {t('postPanel.remaining', {
              remaining: tasks.remainingCount,
              total: tasks.totalCount,
            })}
          </span>
        </div>

        <div className="mt-2 space-y-1.5">
          {visibleTasks.length > 0 ? (
            visibleTasks.map((task) => (
              <DailyTaskItem
                key={task.id}
                task={task}
                activeTaskId={activeTaskId}
                setActiveTaskId={setActiveTaskId}
              />
            ))
          ) : (
            <div className="text-[11px] text-ink-muted">{t('postPanel.noDailyTasks')}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function DailyTaskItem({
  task,
  activeTaskId,
  setActiveTaskId,
}: {
  task: DailyTaskProgress;
  activeTaskId: string | null;
  setActiveTaskId: (updater: (current: string | null) => string | null) => void;
}) {
  const { t } = useTranslation();
  const completed = task.awarded || task.completed;
  const taskDetail = getDailyTaskDetail(task.id, t);
  const tooltip = (
    <div className="space-y-1.5">
      <div className="font-bold text-ink-primary">{task.title}</div>
      <div className="leading-relaxed text-ink-secondary">{task.description}</div>
      <div className="leading-relaxed text-ink-secondary">{taskDetail}</div>
      <div className="font-mono text-[11px] text-ink-muted">
        {t('postPanel.progress', { progress: task.progress, target: task.target })}
      </div>
      <div className="font-mono text-[11px] text-moss">
        {t('postPanel.reward', { xp: task.rewardXp })}
      </div>
      <div className="border-t border-copper/10 pt-1 text-[11px] text-ink-muted">
        {completed ? t('postPanel.completedHint') : t('postPanel.pendingHint')}
      </div>
    </div>
  );

  return (
    <PortalTooltip
      content={tooltip}
      placement="left"
      align="center"
      open={activeTaskId === task.id}
      onOpenChange={(nextOpen) => {
        setActiveTaskId((current) => {
          if (nextOpen) return task.id;
          return current === task.id ? null : current;
        });
      }}
    >
      <div
        aria-label={t('postPanel.taskAria', {
          title: task.title,
          progress: task.progress,
          target: task.target,
          xp: task.rewardXp,
        })}
        className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[11px] transition-colors ${
          completed
            ? 'bg-moss/5 text-moss hover:bg-moss/10'
            : 'text-ink-secondary hover:bg-void-hover hover:text-ink-primary'
        }`}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          {completed && <CheckCircle2 className="h-3 w-3 shrink-0" />}
          <span className="truncate">{task.title}</span>
        </span>
        <span className="shrink-0 font-mono text-ink-muted tabular-nums">
          {task.progress}/{task.target}
        </span>
      </div>
    </PortalTooltip>
  );
}

function getDailyTaskDetail(taskId: string, t: (key: string) => string) {
  if (taskId === 'daily-post') {
    return t('postPanel.taskDetails.dailyPost');
  }
  if (taskId === 'daily-replies') {
    return t('postPanel.taskDetails.dailyReplies');
  }
  if (taskId === 'daily-feedback') {
    return t('postPanel.taskDetails.dailyFeedback');
  }
  return t('postPanel.taskDetails.fallback');
}

function AgentStatusSkeleton() {
  return (
    <div className="px-3 pb-3">
      <div className="h-[148px] animate-pulse rounded-lg border border-copper/10 bg-void-mid/60" />
    </div>
  );
}

function StatBlock({ label, value, trend }: { label: string; value: string; trend?: string }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface-2/45 p-3 transition-colors hover:border-border-default">
      <div className="mb-1 text-xs uppercase tracking-wide text-ink-muted">{label}</div>
      <div className="flex items-baseline gap-1.5">
        <div className="font-mono text-xl font-bold leading-none text-moss tabular-nums">
          {value}
        </div>
        {trend && <span className="font-mono text-xs text-moss tabular-nums">{trend}</span>}
      </div>
    </div>
  );
}
