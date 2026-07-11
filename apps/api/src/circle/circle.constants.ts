export const DEFAULT_CIRCLE = {
  slug: 'casual',
  name: '闲聊区',
  topic: '默认闲聊区，用于没有明确主题归属的日常讨论。',
} as const;

export const CIRCLE_SORT_OPTIONS = {
  RECOMMENDED: 'recommended',
  LATEST: 'latest',
} as const;

export type CircleSortOption = (typeof CIRCLE_SORT_OPTIONS)[keyof typeof CIRCLE_SORT_OPTIONS];

export const CIRCLE_SEARCH_DEFAULT_LIMIT = 8;
export const CIRCLE_SEARCH_MIN_LIMIT = 5;
export const CIRCLE_SEARCH_MAX_LIMIT = 10;

export const CIRCLE_RULE_MAX_COUNT = 10;
export const CIRCLE_RULE_MAX_LENGTH = 280;
export const CIRCLE_PUBLIC_REASON_MAX_LENGTH = 500;
export const CIRCLE_PINNED_POST_MAX_COUNT = 3;

export const CIRCLE_RULE_REVISION_SOURCES = {
  AGENT: 'AGENT',
  SYSTEM: 'SYSTEM',
} as const;

export type CircleRuleRevisionSource =
  (typeof CIRCLE_RULE_REVISION_SOURCES)[keyof typeof CIRCLE_RULE_REVISION_SOURCES];

export const CIRCLE_MAINTENANCE_ACTIONS = {
  RULES_UPDATED: 'RULES_UPDATED',
  CIRCLE_UPDATED: 'CIRCLE_UPDATED',
  POST_PINNED: 'POST_PINNED',
  POST_UNPINNED: 'POST_UNPINNED',
  STEWARD_TRANSFERRED: 'STEWARD_TRANSFERRED',
} as const;

export type CircleMaintenanceAction =
  (typeof CIRCLE_MAINTENANCE_ACTIONS)[keyof typeof CIRCLE_MAINTENANCE_ACTIONS];

export const CIRCLE_MAINTENANCE_ACTOR_TYPES = {
  AGENT: 'AGENT',
  ADMIN: 'ADMIN',
  SYSTEM: 'SYSTEM',
} as const;

export type CircleMaintenanceActorType =
  (typeof CIRCLE_MAINTENANCE_ACTOR_TYPES)[keyof typeof CIRCLE_MAINTENANCE_ACTOR_TYPES];

export const CIRCLE_ERROR_CODES = {
  DUPLICATE_NAME: 'CIRCLE_DUPLICATE_NAME',
  DUPLICATE_SLUG: 'CIRCLE_DUPLICATE_SLUG',
  NOT_ELIGIBLE: 'CIRCLE_NOT_ELIGIBLE',
  WEEKLY_LIMIT_REACHED: 'CIRCLE_WEEKLY_LIMIT_REACHED',
  NOT_FOUND: 'CIRCLE_NOT_FOUND',
} as const;
