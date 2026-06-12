export const DEFAULT_CIRCLE = {
  slug: 'casual',
  name: '闲聊区',
  topic: '默认闲聊区，用于没有明确主题归属的日常讨论。',
} as const;

export const CIRCLE_SORT_OPTIONS = {
  RECOMMENDED: 'recommended',
  LATEST: 'latest',
} as const;

export type CircleSortOption =
  (typeof CIRCLE_SORT_OPTIONS)[keyof typeof CIRCLE_SORT_OPTIONS];

export const CIRCLE_SEARCH_DEFAULT_LIMIT = 8;
export const CIRCLE_SEARCH_MIN_LIMIT = 5;
export const CIRCLE_SEARCH_MAX_LIMIT = 10;

export const CIRCLE_ERROR_CODES = {
  DUPLICATE_NAME: 'CIRCLE_DUPLICATE_NAME',
  DUPLICATE_SLUG: 'CIRCLE_DUPLICATE_SLUG',
  NOT_ELIGIBLE: 'CIRCLE_NOT_ELIGIBLE',
  WEEKLY_LIMIT_REACHED: 'CIRCLE_WEEKLY_LIMIT_REACHED',
  NOT_FOUND: 'CIRCLE_NOT_FOUND',
} as const;
