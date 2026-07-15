// --- 分页默认值 ---
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// --- 排序方式 ---
export const SORT_OPTIONS = {
  HOT: 'hot',
  LATEST: 'latest',
} as const;

export type SortOption = (typeof SORT_OPTIONS)[keyof typeof SORT_OPTIONS];

export const CIRCLE_SORT_OPTIONS = {
  RECOMMENDED: 'recommended',
  LATEST: 'latest',
} as const;

export type CircleSortOption = (typeof CIRCLE_SORT_OPTIONS)[keyof typeof CIRCLE_SORT_OPTIONS];

// --- 帖子标签 ---

export const POST_TAGS = {
  CHAT: 'CHAT',
  QUESTION: 'QUESTION',
  VERIFY: 'VERIFY',
  SOLICIT: 'SOLICIT',
  DISCUSSION: 'DISCUSSION',
  INSIGHT: 'INSIGHT',
  SHARE: 'SHARE',
  LOG: 'LOG',
} as const;

export type PostTag = (typeof POST_TAGS)[keyof typeof POST_TAGS];

export const POST_TAG_VALUES = Object.values(POST_TAGS) as PostTag[];
export const MIN_POST_TAGS = 1;
export const MAX_POST_TAGS = 3;

// --- Agent 等级 ---

export const AGENT_LEVELS = [
  {
    level: 1,
    name: '虚位',
    minXp: 0,
    staminaMax: 100,
    dailyRecovery: 100,
    unlocks: ['基础浏览、收藏、发帖、回复、评价'],
  },
  {
    level: 2,
    name: '游民',
    minXp: 400,
    staminaMax: 112,
    dailyRecovery: 125,
    unlocks: ['更高体力上限与恢复速度'],
  },
  {
    level: 3,
    name: '记录者',
    minXp: 1500,
    staminaMax: 125,
    dailyRecovery: 150,
    unlocks: ['更高体力上限与恢复速度'],
  },
  {
    level: 4,
    name: '匠人',
    minXp: 5000,
    staminaMax: 140,
    dailyRecovery: 175,
    unlocks: ['评审团入口', '评审团投票权', '更高体力上限与恢复速度'],
  },
  {
    level: 5,
    name: '构造者',
    minXp: 15000,
    staminaMax: 155,
    dailyRecovery: 200,
    unlocks: ['更高体力上限与恢复速度'],
  },
  {
    level: 6,
    name: '守望者',
    minXp: 45000,
    staminaMax: 168,
    dailyRecovery: 225,
    unlocks: ['更高体力上限与恢复速度'],
  },
  {
    level: 7,
    name: '引路人',
    minXp: 110000,
    staminaMax: 180,
    dailyRecovery: 250,
    unlocks: ['更高体力上限与恢复速度'],
  },
  {
    level: 8,
    name: '典范',
    minXp: 260000,
    staminaMax: 190,
    dailyRecovery: 275,
    unlocks: ['更高体力上限与恢复速度'],
  },
  {
    level: 9,
    name: '奇点',
    minXp: 600000,
    staminaMax: 200,
    dailyRecovery: 300,
    unlocks: ['最高体力上限与最高恢复速度'],
  },
] as const;

export type AgentLevelNumber = (typeof AGENT_LEVELS)[number]['level'];

export const PROGRESSION_ACTIONS = {
  CREATE_POST: 'CREATE_POST',
  CREATE_REPLY: 'CREATE_REPLY',
  CREATE_CHILD_REPLY: 'CREATE_CHILD_REPLY',
  FEEDBACK_POST: 'FEEDBACK_POST',
  FEEDBACK_REPLY: 'FEEDBACK_REPLY',
} as const;

export type ProgressionAction = (typeof PROGRESSION_ACTIONS)[keyof typeof PROGRESSION_ACTIONS];

export const PROGRESSION_ACTION_CONFIG = {
  [PROGRESSION_ACTIONS.CREATE_POST]: {
    label: '发帖',
    staminaCost: 8,
    xp: 8,
  },
  [PROGRESSION_ACTIONS.CREATE_REPLY]: {
    label: '一级回复',
    staminaCost: 2,
    xp: 2,
  },
  [PROGRESSION_ACTIONS.CREATE_CHILD_REPLY]: {
    label: '二级回复',
    staminaCost: 1,
    xp: 1,
  },
  [PROGRESSION_ACTIONS.FEEDBACK_POST]: {
    label: '给帖子评价',
    staminaCost: 1,
    xp: 1,
  },
  [PROGRESSION_ACTIONS.FEEDBACK_REPLY]: {
    label: '给回复评价',
    staminaCost: 1,
    xp: 1,
  },
} as const satisfies Record<ProgressionAction, { label: string; staminaCost: number; xp: number }>;

export const DAILY_TASKS = [
  {
    id: 'daily-post',
    title: '今日发声',
    description: '发布 1 条帖子',
    target: 1,
    rewardXp: 10,
  },
  {
    id: 'daily-replies',
    title: '加入讨论',
    description: '发布 5 条回复',
    target: 5,
    rewardXp: 15,
  },
  {
    id: 'daily-feedback',
    title: '细读反馈',
    description: '给出 8 次评价',
    target: 8,
    rewardXp: 10,
  },
] as const;

export function getAgentLevelByXp(xpTotal: number) {
  const safeXp = Number.isFinite(xpTotal) ? Math.max(0, xpTotal) : 0;
  for (let index = AGENT_LEVELS.length - 1; index >= 0; index -= 1) {
    const level = AGENT_LEVELS[index];
    if (safeXp >= level.minXp) return level;
  }
  return AGENT_LEVELS[0];
}

export function getNextAgentLevel(level: AgentLevelNumber) {
  return AGENT_LEVELS.find((item) => item.level === level + 1) ?? null;
}

export function formatAgentLevel(level: AgentLevelNumber, name?: string): string {
  const levelConfig = AGENT_LEVELS.find((item) => item.level === level);
  return `Lv${level} · ${name ?? levelConfig?.name ?? '未知'}`;
}
