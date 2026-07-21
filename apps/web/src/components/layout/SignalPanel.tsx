'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import Link from 'next/link';
import { BatteryCharging, CheckCircle2, RotateCw, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { TelemetryValue } from '@/components/home/terminal/TelemetryValue';
import { PortalTooltip } from '@/components/ui/FloatingPortal';
import { TSkeleton } from '@/components/ui/terminal/TSkeleton';
import { Timecode } from '@/components/ui/terminal/Timecode';
import { useAuth } from '@/contexts/AuthContext';
import { useAutoHideScrollbar } from '@/hooks/useAutoHideScrollbar';
import { forumApi, userApi } from '@/lib/api';
import { appEvents } from '@/lib/events';
import { forumKeys, userKeys } from '@/lib/query-keys';
import type { DailyTaskProgress, PostPanelLatestPost } from '@skynet/shared';

const POST_PANEL_REFRESH_MS = 60_000;

function joinClasses(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

function formatInteger(value: number): string {
  return String(Math.round(value));
}

const STEPS_SPIN_CLASS = '[animation:t-spin-step_0.8s_steps(8)_infinite]';

/**
 * 信号面板（右栏）：遥测面板化——等宽 10px 标签 + TelemetryValue 微跳动 + 1px hairline 分区。
 * 禁止卡片套卡片：外框仅一层 t-corner，内部全靠 hairline 分层。
 */
export function SignalPanelContent() {
  const { t } = useTranslation();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { isScrolling, handleScroll } = useAutoHideScrollbar();
  const postPanelQuery = useQuery({
    queryKey: forumKeys.postPanel(),
    queryFn: () => forumApi.getPostPanelSummary(),
    refetchInterval: POST_PANEL_REFRESH_MS,
    enabled: !authLoading && isAuthenticated,
  });
  const activeAgentsQuery = useQuery({
    queryKey: forumKeys.activeAgentsToday(),
    queryFn: () => forumApi.getActiveAgentsToday(),
    refetchInterval: POST_PANEL_REFRESH_MS,
    enabled: !authLoading && !isAuthenticated,
  });
  const postPanel = postPanelQuery.data ?? null;

  if (!authLoading && !isAuthenticated) {
    return (
      <div className="flex h-full min-h-0 flex-col p-3">
        <div className="t-corner relative flex h-full min-h-0 flex-col border border-[var(--t-noise)] bg-[var(--t-panel)]">
          <header className="flex flex-none items-center justify-between gap-2 border-b border-[var(--t-noise)] px-3 py-2">
            <span className="truncate font-mono text-[10px] uppercase tracking-[0.15em] text-white">
              {t('sidebar.signalPanel')}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-faint)]">
              SIG.MON
            </span>
          </header>
          <section className="border-b border-[var(--t-noise)] p-3">
            <PanelMetric
              label={t('postPanel.activeAgentsToday')}
              value={activeAgentsQuery.data?.value}
              loading={activeAgentsQuery.isLoading}
            />
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col p-3">
      <div className="t-corner relative flex h-full min-h-0 flex-col border border-[var(--t-noise)] bg-[var(--t-panel)]">
        <header className="flex flex-none items-center justify-between gap-2 border-b border-[var(--t-noise)] px-3 py-2">
          <span className="truncate font-mono text-[10px] uppercase tracking-[0.15em] text-white">
            {t('sidebar.signalPanel')}
          </span>
          <span className="flex flex-none items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-faint)]">
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 ${
                postPanelQuery.isFetching
                  ? 't-anim-blink bg-[var(--t-accent)]'
                  : 'bg-[var(--t-faint)]'
              }`}
            />
            SIG.MON
          </span>
        </header>
        <div
          onScroll={handleScroll}
          className={`skynet-auto-hide-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain ${
            isScrolling ? 'is-scrolling' : ''
          }`}
        >
          <AgentStatusPanel />

          {/* 数据概览：gap-px 发丝网格，两格遥测读数 */}
          <section className="border-b border-[var(--t-noise)] p-3">
            <div className="grid grid-cols-2 gap-px border border-[var(--t-noise)] bg-[var(--t-noise)]">
              <PanelMetric
                label={t('postPanel.postsToday')}
                value={postPanel?.postsToday.value}
                loading={postPanelQuery.isLoading}
              />
              <PanelMetric
                label={t('postPanel.activeAgentsToday')}
                value={postPanel?.activeAgentsToday.value}
                loading={postPanelQuery.isLoading}
              />
            </div>
          </section>

          {postPanelQuery.isError ? (
            <section className="border-b border-[var(--t-hazard-dim)] px-3 py-3">
              <p className="font-mono text-[11px] tracking-[0.08em] text-[var(--t-hazard)]/80">
                {t('postPanel.summarySyncFailed')}
              </p>
              <button
                type="button"
                onClick={() => void postPanelQuery.refetch()}
                className="mt-2 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-sub)] transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:text-[var(--t-accent)]"
              >
                <RotateCw className="h-3 w-3" />
                {t('app.retry')}
              </button>
            </section>
          ) : null}

          {/* 最新帖子：行式信号记录 */}
          <section className="flex-1 px-3 py-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Zap className="h-3.5 w-3.5 text-[var(--t-faint)]" />
                <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-faint)]">
                  {t('postPanel.latestPosts')}
                </span>
              </div>
              {postPanelQuery.isFetching ? (
                <RotateCw className={`h-3 w-3 text-[var(--t-faint)] ${STEPS_SPIN_CLASS}`} />
              ) : null}
            </div>
            {postPanelQuery.isLoading && !postPanel ? (
              <TSkeleton rows={3} />
            ) : postPanel && postPanel.latestPosts.items.length === 0 ? (
              <p className="border border-dashed border-[var(--t-noise)] px-3 py-4 text-center font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-faint)]">
                {t('postPanel.noLatestPosts')}
              </p>
            ) : (
              <div className="divide-y divide-[var(--t-noise2)] border-y border-[var(--t-noise2)]">
                {postPanel?.latestPosts.items.map((post) => (
                  <LatestPostItem key={post.id} post={post} t={t} />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

export function SignalPanel() {
  return (
    <aside className="flex h-full min-h-0 w-[220px] shrink-0 flex-col border-l border-[var(--t-noise)] bg-black md:w-[240px] xl:w-[280px]">
      <SignalPanelContent />
    </aside>
  );
}

function PanelMetric({
  label,
  value,
  loading,
}: {
  label: string;
  value: number | undefined;
  loading: boolean;
}) {
  return (
    <div className="bg-black p-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--t-faint)]">
        {label}
      </p>
      <p className="mt-2 font-mono text-xl font-bold tabular-nums leading-none text-[var(--t-accent)]">
        {typeof value === 'number' ? (
          <TelemetryValue value={value} format={formatInteger} />
        ) : (
          <span className="text-[var(--t-faint)]">{loading ? '...' : '--'}</span>
        )}
      </p>
    </div>
  );
}

function LatestPostItem({ post, t }: { post: PostPanelLatestPost; t: TFunction }) {
  return (
    <Link
      href={`/post/${post.id}`}
      className="group relative block px-2 py-2.5 transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:bg-black"
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[2px] bg-[var(--t-accent)] opacity-0 transition-opacity duration-100 [transition-timing-function:steps(2,end)] group-hover:opacity-100"
      />
      <span className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.12em] text-[var(--t-faint)]">
        <Timecode date={post.createdAt} />
        <span aria-hidden>·</span>
        <span className="truncate text-[var(--t-accent)]/70 transition-colors duration-100 [transition-timing-function:steps(2,end)] group-hover:text-[var(--t-accent)]">
          {post.author.name}
        </span>
      </span>
      <span className="mt-1 line-clamp-2 block text-xs font-medium leading-relaxed text-[var(--t-text)]/85 transition-colors duration-100 [transition-timing-function:steps(2,end)] group-hover:text-white">
        {post.title}
      </span>
      <span className="mt-1 block font-mono text-[9px] uppercase tracking-[0.15em] text-[var(--t-faint)] transition-colors duration-100 [transition-timing-function:steps(2,end)] group-hover:text-[var(--t-accent)]">
        {t('postPanel.openPost')}
      </span>
    </Link>
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

  if (!isAuthenticated && !isLoading) {
    return null;
  }

  if (isLoading) {
    return (
      <section className="border-b border-[var(--t-noise)] px-3 py-3">
        <TSkeleton rows={3} />
      </section>
    );
  }

  if (!agent) {
    return (
      <section className="border-b border-[var(--t-noise)] px-3 py-3 font-mono text-[11px] tracking-[0.08em] text-[var(--t-faint)]">
        {t('postPanel.noAgent')}
      </section>
    );
  }

  if (loading && !progression) {
    return (
      <section className="border-b border-[var(--t-noise)] px-3 py-3">
        <TSkeleton rows={3} />
      </section>
    );
  }

  if (errorKey && !progression) {
    return (
      <section className="border-b border-[var(--t-hazard-dim)] px-3 py-3">
        <p className="font-mono text-[11px] tracking-[0.08em] text-[var(--t-hazard)]/80">
          {t(errorKey)}
        </p>
        <button
          type="button"
          onClick={() => void progressionQuery.refetch()}
          className="mt-2 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-sub)] transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:text-[var(--t-accent)]"
        >
          <RotateCw className="h-3 w-3" />
          {t('app.retry')}
        </button>
      </section>
    );
  }

  if (!progression) return null;

  const stamina = progression.stamina;
  const tasks = progression.dailyTasks;
  const visibleTasks = tasks.items;

  return (
    <section className="border-b border-[var(--t-noise)] px-3 py-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BatteryCharging className="h-3.5 w-3.5 text-[var(--t-accent)]" />
          <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-faint)]">
            {t('postPanel.myStatus')}
          </span>
        </div>
        <button
          type="button"
          onClick={() => void progressionQuery.refetch()}
          disabled={loading}
          aria-label={t('postPanel.refreshStatus')}
          className="text-[var(--t-sub)] transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:text-[var(--t-accent)] disabled:opacity-50"
        >
          <RotateCw className={`h-3.5 w-3.5 ${loading ? STEPS_SPIN_CLASS : ''}`} />
        </button>
      </div>

      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--t-faint)]">
          {t('postPanel.stamina')}
        </span>
        <span className="font-mono text-sm font-bold tabular-nums text-[var(--t-accent)]">
          <TelemetryValue value={stamina.current} format={formatInteger} />
          <span className="text-[var(--t-faint)]">/{stamina.max}</span>
        </span>
      </div>
      <progress
        value={stamina.current}
        max={stamina.max}
        aria-label={t('postPanel.staminaLabel')}
        className="agent-stamina-progress mt-2 h-1 w-full border border-[var(--t-noise)]"
      />
      <p className="mt-2 font-mono text-[10px] leading-relaxed tracking-[0.08em] text-[var(--t-faint)]">
        {t('postPanel.staminaRecovery', {
          daily: stamina.dailyRecovery,
          hour: stamina.recoveryPerHour.toFixed(1),
        })}
      </p>

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--t-faint)]">
          {t('postPanel.dailyTasks')}
        </span>
        <span className="font-mono text-[11px] font-bold tabular-nums text-[var(--t-accent)]">
          {t('postPanel.remaining', {
            remaining: tasks.remainingCount,
            total: tasks.totalCount,
          })}
        </span>
      </div>

      <div className="mt-2 divide-y divide-[var(--t-noise2)] border-y border-[var(--t-noise2)]">
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
          <p className="py-2 font-mono text-[10px] tracking-[0.08em] text-[var(--t-faint)]">
            {t('postPanel.noDailyTasks')}
          </p>
        )}
      </div>
    </section>
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
      <div className="font-bold text-text-primary">{task.title}</div>
      <div className="leading-relaxed text-text-secondary">{task.description}</div>
      <div className="leading-relaxed text-text-secondary">{taskDetail}</div>
      <div className="font-mono text-[11px] text-text-tertiary">
        {t('postPanel.progress', { progress: task.progress, target: task.target })}
      </div>
      <div className="font-mono text-[11px] text-accent">
        {t('postPanel.reward', { xp: task.rewardXp })}
      </div>
      <div className="border-t border-border-subtle pt-1 text-[11px] text-text-tertiary">
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
        className={joinClasses(
          'flex w-full items-center justify-between gap-2 px-1.5 py-1.5 text-left text-[11px]',
          'transition-colors duration-100 [transition-timing-function:steps(2,end)]',
          completed
            ? 'text-[var(--t-accent)]'
            : 'text-[var(--t-text)]/70 hover:bg-black hover:text-white',
        )}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          {completed ? <CheckCircle2 className="h-3 w-3 shrink-0" /> : null}
          <span className="truncate">{task.title}</span>
        </span>
        <span className="shrink-0 font-mono tabular-nums text-[var(--t-faint)]">
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
