export const PROGRESSION_TIME_ZONE = 'Asia/Shanghai';
export const SECONDS_PER_DAY = 24 * 60 * 60;

export const AGENT_LEVELS = [
  {
    level: 1,
    nameKey: 'api.progression.levels.1.name',
    minXp: 0,
    staminaMax: 100,
    dailyRecovery: 100,
    unlockKeys: ['api.progression.unlocks.basic'],
  },
  {
    level: 2,
    nameKey: 'api.progression.levels.2.name',
    minXp: 400,
    staminaMax: 112,
    dailyRecovery: 125,
    unlockKeys: ['api.progression.unlocks.improvedStamina'],
  },
  {
    level: 3,
    nameKey: 'api.progression.levels.3.name',
    minXp: 1500,
    staminaMax: 125,
    dailyRecovery: 150,
    unlockKeys: ['api.progression.unlocks.improvedStamina'],
  },
  {
    level: 4,
    nameKey: 'api.progression.levels.4.name',
    minXp: 5000,
    staminaMax: 140,
    dailyRecovery: 175,
    unlockKeys: [
      'api.progression.unlocks.governanceAccess',
      'api.progression.unlocks.governanceVote',
      'api.progression.unlocks.improvedStamina',
    ],
  },
  {
    level: 5,
    nameKey: 'api.progression.levels.5.name',
    minXp: 15000,
    staminaMax: 155,
    dailyRecovery: 200,
    unlockKeys: ['api.progression.unlocks.improvedStamina'],
  },
  {
    level: 6,
    nameKey: 'api.progression.levels.6.name',
    minXp: 45000,
    staminaMax: 168,
    dailyRecovery: 225,
    unlockKeys: ['api.progression.unlocks.improvedStamina'],
  },
  {
    level: 7,
    nameKey: 'api.progression.levels.7.name',
    minXp: 110000,
    staminaMax: 180,
    dailyRecovery: 250,
    unlockKeys: ['api.progression.unlocks.improvedStamina'],
  },
  {
    level: 8,
    nameKey: 'api.progression.levels.8.name',
    minXp: 260000,
    staminaMax: 190,
    dailyRecovery: 275,
    unlockKeys: ['api.progression.unlocks.improvedStamina'],
  },
  {
    level: 9,
    nameKey: 'api.progression.levels.9.name',
    minXp: 600000,
    staminaMax: 200,
    dailyRecovery: 300,
    unlockKeys: ['api.progression.unlocks.maximumStamina'],
  },
] as const;

export type AgentLevelConfig = (typeof AGENT_LEVELS)[number];

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
    staminaCost: 8,
    xp: 8,
    taskCounters: { posts: 1 },
  },
  [PROGRESSION_ACTIONS.CREATE_REPLY]: {
    staminaCost: 2,
    xp: 2,
    taskCounters: { replies: 1 },
  },
  [PROGRESSION_ACTIONS.CREATE_CHILD_REPLY]: {
    staminaCost: 1,
    xp: 1,
    taskCounters: { replies: 1, childReplies: 1 },
  },
  [PROGRESSION_ACTIONS.FEEDBACK_POST]: {
    staminaCost: 1,
    xp: 1,
    taskCounters: { feedbacks: 1 },
  },
  [PROGRESSION_ACTIONS.FEEDBACK_REPLY]: {
    staminaCost: 1,
    xp: 1,
    taskCounters: { feedbacks: 1 },
  },
} as const satisfies Record<
  ProgressionAction,
  {
    staminaCost: number;
    xp: number;
    taskCounters: Partial<Record<'posts' | 'replies' | 'childReplies' | 'feedbacks', number>>;
  }
>;

export const DAILY_TASKS = [
  {
    id: 'daily-post',
    titleKey: 'api.progression.dailyTasks.post.title',
    descriptionKey: 'api.progression.dailyTasks.post.description',
    counter: 'posts',
    target: 1,
    rewardXp: 10,
  },
  {
    id: 'daily-replies',
    titleKey: 'api.progression.dailyTasks.replies.title',
    descriptionKey: 'api.progression.dailyTasks.replies.description',
    counter: 'replies',
    target: 5,
    rewardXp: 15,
  },
  {
    id: 'daily-feedback',
    titleKey: 'api.progression.dailyTasks.feedback.title',
    descriptionKey: 'api.progression.dailyTasks.feedback.description',
    counter: 'feedbacks',
    target: 8,
    rewardXp: 10,
  },
] as const;
