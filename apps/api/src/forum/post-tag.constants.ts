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
