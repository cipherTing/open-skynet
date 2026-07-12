import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, type ClientSession } from 'mongoose';
import {
  AgentProgress,
  type AgentProgressDocument,
  type DailyCounters,
} from '@/database/schemas/agent-progress.schema';
import { AgentXpEvent } from '@/database/schemas/agent-xp-event.schema';
import { DatabaseService } from '@/database/database.service';
import { InsufficientStaminaException } from './insufficient-stamina.exception';
import {
  AGENT_LEVELS,
  DAILY_TASKS,
  PROGRESSION_ACTION_CONFIG,
  PROGRESSION_TIME_ZONE,
  SECONDS_PER_DAY,
  type AgentLevelConfig,
  type ProgressionAction,
} from './progression.constants';

export interface AgentLevelSummary {
  level: number;
  name: string;
  xpTotal: number;
  currentLevelMinXp: number;
  nextLevelXp: number | null;
  progressToNextLevel: number;
  unlocks: string[];
}

export interface AgentStamina {
  current: number;
  max: number;
  dailyRecovery: number;
  recoveryPerHour: number;
  nextPointAt: string | null;
  secondsUntilFull: number | null;
  settledAt: string;
}

interface DailyTaskProgress {
  id: string;
  title: string;
  description: string;
  progress: number;
  target: number;
  rewardXp: number;
  completed: boolean;
  awarded: boolean;
}

interface AgentDailyTasks {
  remainingCount: number;
  totalCount: number;
  resetAt: string;
  items: DailyTaskProgress[];
}

export interface AgentProgressionSummary {
  level: AgentLevelSummary;
  stamina: AgentStamina;
  dailyTasks: AgentDailyTasks;
}

export interface ActionProgressDelta {
  xpGained: number;
  staminaCost: number;
  levelBefore: number;
  levelAfter: number;
  dailyTaskUpdates: DailyTaskProgress[];
  progression: AgentProgressionSummary;
}

export interface AgentScorePoint {
  date: string;
  value: number;
}

interface ApplySuccessfulActionParams {
  agentId: string;
  action: ProgressionAction;
  sourceId: string;
  occurredAt?: Date;
}

interface XpEventKey {
  agentId: string;
  sourceType: string;
  sourceId: string;
  reasonKey: string;
}

type CounterKey = keyof DailyCounters;

const EMPTY_COUNTERS: DailyCounters = {
  posts: 0,
  replies: 0,
  childReplies: 0,
  feedbacks: 0,
};

function cloneEmptyCounters(): DailyCounters {
  return { ...EMPTY_COUNTERS };
}

function isDuplicateKeyError(error: unknown): error is { code: 11000 } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 11000
  );
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function getShanghaiDayKey(date: Date): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: PROGRESSION_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}

export function getShanghaiDayStart(dayKey: string): Date {
  const [year, month, day] = dayKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, -8, 0, 0, 0));
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function formatChartDate(dayKey: string): string {
  return dayKey.slice(5);
}

function getLevelByXp(xpTotal: number): AgentLevelConfig {
  const safeXp = Number.isFinite(xpTotal) ? Math.max(0, xpTotal) : 0;
  for (let index = AGENT_LEVELS.length - 1; index >= 0; index -= 1) {
    const level = AGENT_LEVELS[index];
    if (safeXp >= level.minXp) return level;
  }
  return AGENT_LEVELS[0];
}

function getNextLevel(level: number): AgentLevelConfig | null {
  return AGENT_LEVELS.find((item) => item.level === level + 1) ?? null;
}

function normalizeCounters(counters?: Partial<DailyCounters> | null): DailyCounters {
  return {
    posts: counters?.posts ?? 0,
    replies: counters?.replies ?? 0,
    childReplies: counters?.childReplies ?? 0,
    feedbacks: counters?.feedbacks ?? 0,
  };
}

@Injectable()
export class ProgressionService {
  constructor(
    @InjectModel(AgentProgress.name)
    private readonly progressModel: Model<AgentProgress>,
    @InjectModel(AgentXpEvent.name)
    private readonly xpEventModel: Model<AgentXpEvent>,
    private readonly databaseService: DatabaseService,
  ) {}

  private buildLevelSummary(xpTotal: number): AgentLevelSummary {
    const level = getLevelByXp(xpTotal);
    const nextLevel = getNextLevel(level.level);
    const nextLevelXp = nextLevel?.minXp ?? null;
    const span =
      nextLevelXp === null ? 1 : Math.max(1, nextLevelXp - level.minXp);
    const rawProgress =
      nextLevelXp === null ? 1 : (xpTotal - level.minXp) / span;

    return {
      level: level.level,
      name: level.name,
      xpTotal,
      currentLevelMinXp: level.minXp,
      nextLevelXp,
      progressToNextLevel: clampNumber(rawProgress, 0, 1),
      unlocks: [...level.unlocks],
    };
  }

  private getStaminaConfig(xpTotal: number): AgentLevelConfig {
    return getLevelByXp(xpTotal);
  }

  private getSecondsPerStaminaPoint(dailyRecovery: number): number {
    return SECONDS_PER_DAY / dailyRecovery;
  }

  private buildStaminaSummary(progress: AgentProgressDocument, now: Date): AgentStamina {
    const level = this.getStaminaConfig(progress.xpTotal);
    const current = clampNumber(
      progress.staminaCurrent,
      0,
      level.staminaMax,
    );
    const recoveryPerHour = level.dailyRecovery / 24;
    const secondsPerPoint = this.getSecondsPerStaminaPoint(level.dailyRecovery);
    const remaining = Math.max(0, level.staminaMax - current);
    const elapsedSinceSettlement = Math.max(
      0,
      (now.getTime() - progress.staminaLastSettledAt.getTime()) / 1000,
    );
    const secondsUntilNextPoint = Math.max(
      0,
      Math.ceil(secondsPerPoint - elapsedSinceSettlement),
    );
    const secondsUntilFull =
      remaining === 0
        ? null
        : secondsUntilNextPoint +
          Math.ceil(Math.max(0, remaining - 1) * secondsPerPoint);
    const nextPointAt =
      remaining === 0
        ? null
        : new Date(now.getTime() + secondsUntilNextPoint * 1000).toISOString();

    return {
      current,
      max: level.staminaMax,
      dailyRecovery: level.dailyRecovery,
      recoveryPerHour,
      nextPointAt,
      secondsUntilFull,
      settledAt: now.toISOString(),
    };
  }

  private buildDailyTasks(
    progress: AgentProgressDocument,
    now: Date,
  ): AgentDailyTasks {
    const counters = normalizeCounters(progress.dailyCounters);
    const awarded = new Set(progress.awardedDailyTaskIds);
    const items = DAILY_TASKS.map((task) => {
      const value = counters[task.counter as CounterKey] ?? 0;
      const taskProgress = Math.min(value, task.target);
      const completed = value >= task.target;
      return {
        id: task.id,
        title: task.title,
        description: task.description,
        progress: taskProgress,
        target: task.target,
        rewardXp: task.rewardXp,
        completed,
        awarded: awarded.has(task.id),
      };
    });
    const remainingCount = items.filter((item) => !item.completed).length;
    const todayStart = getShanghaiDayStart(getShanghaiDayKey(now));
    const resetAt = addDays(todayStart, 1).toISOString();

    return {
      remainingCount,
      totalCount: items.length,
      resetAt,
      items,
    };
  }

  private buildProgressionSummary(
    progress: AgentProgressDocument,
    now: Date,
  ): AgentProgressionSummary {
    return {
      level: this.buildLevelSummary(progress.xpTotal),
      stamina: this.buildStaminaSummary(progress, now),
      dailyTasks: this.buildDailyTasks(progress, now),
    };
  }

  private async getOrCreateProgress(
    agentId: string,
    now: Date,
    session?: ClientSession,
  ): Promise<AgentProgressDocument> {
    const existing = await this.progressModel.findOne(
      { agentId },
      null,
      { session },
    );
    if (existing) return existing;

    const dayKey = getShanghaiDayKey(now);
    const created = new this.progressModel({
      agentId,
      xpTotal: 0,
      staminaCurrent: AGENT_LEVELS[0].staminaMax,
      staminaLastSettledAt: now,
      dailyProgressDate: dayKey,
      dailyCounters: cloneEmptyCounters(),
      awardedDailyTaskIds: [],
    });
    try {
      await created.save({ session });
      return created;
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      const raced = await this.progressModel.findOne(
        { agentId },
        null,
        { session },
      );
      if (!raced) throw error;
      return raced;
    }
  }

  private resetDailyProgressIfNeeded(
    progress: AgentProgressDocument,
    now: Date,
  ): boolean {
    const dayKey = getShanghaiDayKey(now);
    if (progress.dailyProgressDate === dayKey) return false;
    progress.dailyProgressDate = dayKey;
    progress.dailyCounters = cloneEmptyCounters();
    progress.awardedDailyTaskIds = [];
    return true;
  }

  private settleStamina(progress: AgentProgressDocument, now: Date): boolean {
    const level = this.getStaminaConfig(progress.xpTotal);
    const current = clampNumber(
      progress.staminaCurrent,
      0,
      level.staminaMax,
    );
    let changed = current !== progress.staminaCurrent;
    progress.staminaCurrent = current;

    if (progress.staminaCurrent >= level.staminaMax) {
      return changed;
    }

    const elapsedSeconds = Math.max(
      0,
      (now.getTime() - progress.staminaLastSettledAt.getTime()) / 1000,
    );
    const recovered = Math.floor(
      elapsedSeconds / this.getSecondsPerStaminaPoint(level.dailyRecovery),
    );

    if (recovered <= 0) return changed;

    progress.staminaCurrent = Math.min(
      level.staminaMax,
      progress.staminaCurrent + recovered,
    );
    progress.staminaLastSettledAt = new Date(
      progress.staminaLastSettledAt.getTime() +
        recovered * this.getSecondsPerStaminaPoint(level.dailyRecovery) * 1000,
    );
    changed = true;
    return changed;
  }

  private getActionEventKey(
    agentId: string,
    action: ProgressionAction,
    sourceId: string,
  ): XpEventKey {
    return {
      agentId,
      sourceType: action,
      sourceId,
      reasonKey: 'active-action',
    };
  }

  private async createXpEventIfAbsent(
    key: XpEventKey,
    xp: number,
    occurredAt: Date,
    session?: ClientSession,
  ): Promise<boolean> {
    const exists = await this.xpEventModel
      .findOne(
        {
          agentId: key.agentId,
          sourceType: key.sourceType,
          sourceId: key.sourceId,
          reasonKey: key.reasonKey,
        },
        null,
        { session },
      )
      .select('_id');
    if (exists) return false;

    try {
      await new this.xpEventModel({
        ...key,
        xp,
        occurredAt,
      }).save({ session });
      return true;
    } catch (error) {
      if (isDuplicateKeyError(error)) return false;
      throw error;
    }
  }

  private applyTaskCounters(
    progress: AgentProgressDocument,
    action: ProgressionAction,
  ): void {
    const counters = normalizeCounters(progress.dailyCounters);
    const actionConfig = PROGRESSION_ACTION_CONFIG[action];

    for (const [counter, delta] of Object.entries(actionConfig.taskCounters)) {
      const key = counter as CounterKey;
      counters[key] = (counters[key] ?? 0) + delta;
    }

    progress.dailyCounters = counters;
  }

  private async awardCompletedDailyTasks(
    progress: AgentProgressDocument,
    now: Date,
    session?: ClientSession,
  ): Promise<DailyTaskProgress[]> {
    const counters = normalizeCounters(progress.dailyCounters);
    const awarded = new Set(progress.awardedDailyTaskIds);
    const newlyAwarded: DailyTaskProgress[] = [];

    for (const task of DAILY_TASKS) {
      const value = counters[task.counter as CounterKey] ?? 0;
      if (value < task.target || awarded.has(task.id)) continue;

      const created = await this.createXpEventIfAbsent(
        {
          agentId: progress.agentId,
          sourceType: 'DAILY_TASK',
          sourceId: `${progress.dailyProgressDate}:${task.id}`,
          reasonKey: 'daily-task-reward',
        },
        task.rewardXp,
        now,
        session,
      );
      if (!created) {
        awarded.add(task.id);
        continue;
      }

      progress.xpTotal += task.rewardXp;
      awarded.add(task.id);
      newlyAwarded.push({
        id: task.id,
        title: task.title,
        description: task.description,
        progress: Math.min(value, task.target),
        target: task.target,
        rewardXp: task.rewardXp,
        completed: true,
        awarded: true,
      });
    }

    progress.awardedDailyTaskIds = [...awarded];
    return newlyAwarded;
  }

  async getCurrentAgentProgression(agentId: string): Promise<AgentProgressionSummary> {
    const now = new Date();
    return this.databaseService.$transaction(async (session) => {
      const progress = await this.getOrCreateProgress(agentId, now, session);
      const changedDaily = this.resetDailyProgressIfNeeded(progress, now);
      const changedStamina = this.settleStamina(progress, now);
      if (changedDaily || changedStamina) {
        await progress.save({ session });
      }
      return this.buildProgressionSummary(progress, now);
    });
  }

  async applySuccessfulAction(
    params: ApplySuccessfulActionParams,
    session?: ClientSession,
  ): Promise<ActionProgressDelta> {
    const now = params.occurredAt ?? new Date();
    const actionConfig = PROGRESSION_ACTION_CONFIG[params.action];
    const progress = await this.getOrCreateProgress(params.agentId, now, session);
    const changedDaily = this.resetDailyProgressIfNeeded(progress, now);
    const changedStamina = this.settleStamina(progress, now);

    const levelBefore = getLevelByXp(progress.xpTotal).level;
    const eventKey = this.getActionEventKey(
      params.agentId,
      params.action,
      params.sourceId,
    );
    const actionEventExists = await this.xpEventModel
      .findOne(
        {
          agentId: eventKey.agentId,
          sourceType: eventKey.sourceType,
          sourceId: eventKey.sourceId,
          reasonKey: eventKey.reasonKey,
        },
        null,
        { session },
      )
      .select('_id');

    if (actionEventExists) {
      if (changedDaily || changedStamina) {
        await progress.save({ session });
      }
      return {
        xpGained: 0,
        staminaCost: 0,
        levelBefore,
        levelAfter: levelBefore,
        dailyTaskUpdates: [],
        progression: this.buildProgressionSummary(progress, now),
      };
    }

    if (progress.staminaCurrent < actionConfig.staminaCost) {
      throw new InsufficientStaminaException({
        currentStamina: progress.staminaCurrent,
        requiredStamina: actionConfig.staminaCost,
        nextRecoverAt: this.buildStaminaSummary(progress, now).nextPointAt,
      });
    }

    const actionEventCreated = await this.createXpEventIfAbsent(
      eventKey,
      actionConfig.xp,
      now,
      session,
    );

    let xpGained = 0;
    const dailyTaskUpdates: DailyTaskProgress[] = [];
    if (actionEventCreated) {
      progress.staminaCurrent -= actionConfig.staminaCost;
      progress.staminaLastSettledAt = now;
      progress.xpTotal += actionConfig.xp;
      xpGained += actionConfig.xp;
      this.applyTaskCounters(progress, params.action);
      const taskAwards = await this.awardCompletedDailyTasks(
        progress,
        now,
        session,
      );
      dailyTaskUpdates.push(...taskAwards);
      xpGained += taskAwards.reduce((sum, task) => sum + task.rewardXp, 0);
    }

    await progress.save({ session });
    const levelAfter = getLevelByXp(progress.xpTotal).level;
    return {
      xpGained,
      staminaCost: actionEventCreated ? actionConfig.staminaCost : 0,
      levelBefore,
      levelAfter,
      dailyTaskUpdates,
      progression: this.buildProgressionSummary(progress, now),
    };
  }

  async getPublicLevelSummaries(
    agentIds: string[],
  ): Promise<Map<string, AgentLevelSummary>> {
    const uniqueIds = [...new Set(agentIds.filter(Boolean))];
    if (uniqueIds.length === 0) return new Map();

    const progresses = await this.progressModel
      .find({ agentId: { $in: uniqueIds } })
      .select('agentId xpTotal')
      .lean<Array<Pick<AgentProgress, 'agentId' | 'xpTotal'>>>();

    const summaries = new Map(
      uniqueIds.map((agentId) => [agentId, this.buildLevelSummary(0)]),
    );
    for (const progress of progresses) {
      summaries.set(
        progress.agentId,
        this.buildLevelSummary(progress.xpTotal),
      );
    }
    return summaries;
  }

  async getPublicLevelSummary(
    agentId: string,
  ): Promise<AgentLevelSummary | null> {
    const progress = await this.progressModel
      .findOne({ agentId })
      .select('xpTotal')
      .lean<Pick<AgentProgress, 'xpTotal'>>();
    if (!progress) return this.buildLevelSummary(0);
    return this.buildLevelSummary(progress.xpTotal);
  }

  async getScoreHistory(agentId: string, days = 30): Promise<AgentScorePoint[]> {
    const safeDays = clampNumber(Math.floor(days), 1, 90);
    const now = new Date();
    const todayKey = getShanghaiDayKey(now);
    const todayStart = getShanghaiDayStart(todayKey);
    const start = addDays(todayStart, -(safeDays - 1));
    const progress = await this.progressModel
      .findOne({ agentId })
      .select('xpTotal')
      .lean<Pick<AgentProgress, 'xpTotal'>>();
    if (!progress) return [];

    const events = await this.xpEventModel
      .find({ agentId, occurredAt: { $gte: start } })
      .select('xp occurredAt')
      .sort({ occurredAt: 1 })
      .lean<Array<Pick<AgentXpEvent, 'xp' | 'occurredAt'>>>();

    const perDay = new Map<string, number>();
    for (const event of events) {
      const dayKey = getShanghaiDayKey(event.occurredAt);
      perDay.set(dayKey, (perDay.get(dayKey) ?? 0) + event.xp);
    }

    const inWindowXp = events.reduce((sum, event) => sum + event.xp, 0);
    let running = Math.max(0, progress.xpTotal - inWindowXp);
    const points: AgentScorePoint[] = [];
    for (let index = 0; index < safeDays; index += 1) {
      const date = addDays(start, index);
      const dayKey = getShanghaiDayKey(date);
      running += perDay.get(dayKey) ?? 0;
      points.push({
        date: formatChartDate(dayKey),
        value: running,
      });
    }
    return points;
  }
}
