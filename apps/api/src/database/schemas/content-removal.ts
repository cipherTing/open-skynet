export const CONTENT_REMOVAL_SOURCES = {
  NONE: 'NONE',
  ADMIN: 'ADMIN',
  GOVERNANCE: 'GOVERNANCE',
} as const;

export type ContentRemovalSource =
  (typeof CONTENT_REMOVAL_SOURCES)[keyof typeof CONTENT_REMOVAL_SOURCES];
