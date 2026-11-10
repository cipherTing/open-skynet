export const STORY_PHASES = {
  OPENING: 'opening',
  SETTING: 'setting',
  PLANNING: 'planning',
  SERIALIZING: 'serializing',
  REVISING: 'revising',
  COMPLETED: 'completed',
} as const;

export type StoryPhase = (typeof STORY_PHASES)[keyof typeof STORY_PHASES];

export const STORY_DOCUMENT_KINDS = {
  OVERVIEW: 'overview',
  WORLD_SETTING: 'world_setting',
  CHARACTER: 'character',
  RELATIONSHIP: 'relationship',
  LOCATION: 'location',
  ORGANIZATION: 'organization',
  OBJECT: 'object',
  TIMELINE_EVENT: 'timeline_event',
  PLOTLINE: 'plotline',
  FORESHADOW: 'foreshadow',
  OUTLINE: 'outline',
  VOLUME: 'volume',
  CHAPTER: 'chapter',
  SCENE: 'scene',
} as const;

export type StoryDocumentKind = (typeof STORY_DOCUMENT_KINDS)[keyof typeof STORY_DOCUMENT_KINDS];

export const STORY_DOCUMENT_RELATIONS = {
  REFERENCES: 'references',
  FEATURES: 'features',
  OCCURS_AT: 'occurs_at',
  FORESHADOWS: 'foreshadows',
} as const;

export type StoryDocumentRelation =
  (typeof STORY_DOCUMENT_RELATIONS)[keyof typeof STORY_DOCUMENT_RELATIONS];

export const STORY_COLLABORATION_CASE_TYPES = {
  REVISION_REVIEW: 'REVISION_REVIEW',
  WRITE_RESTRICTION: 'WRITE_RESTRICTION',
  RESTRICTION_APPEAL: 'RESTRICTION_APPEAL',
} as const;

export type StoryCollaborationCaseType =
  (typeof STORY_COLLABORATION_CASE_TYPES)[keyof typeof STORY_COLLABORATION_CASE_TYPES];

export const STORY_COLLABORATION_CASE_STATUSES = {
  OPEN: 'OPEN',
  UPHELD: 'UPHELD',
  DISMISSED: 'DISMISSED',
} as const;

export type StoryCollaborationCaseStatus =
  (typeof STORY_COLLABORATION_CASE_STATUSES)[keyof typeof STORY_COLLABORATION_CASE_STATUSES];

export const STORY_COLLABORATION_VOTE_DECISIONS = {
  UPHOLD: 'UPHOLD',
  DISMISS: 'DISMISS',
} as const;

export type StoryCollaborationVoteDecision =
  (typeof STORY_COLLABORATION_VOTE_DECISIONS)[keyof typeof STORY_COLLABORATION_VOTE_DECISIONS];

export const STORY_ENFORCEMENT_EVENT_ACTIONS = {
  RESTRICT: 'RESTRICT',
  REVOKE: 'REVOKE',
} as const;

export type StoryEnforcementEventAction =
  (typeof STORY_ENFORCEMENT_EVENT_ACTIONS)[keyof typeof STORY_ENFORCEMENT_EVENT_ACTIONS];

export const STORY_RESTRICTION_HOURS = [1, 24, 168] as const;
export type StoryCollaborationRestrictionHours = (typeof STORY_RESTRICTION_HOURS)[number];
export const STORY_COLLABORATION_MIN_RESTRICTION_EVIDENCE = 2;
export const STORY_COLLABORATION_MAX_EVIDENCE = 8;
export const STORY_COLLABORATION_MAX_VOTES = 3;
export const STORY_EDIT_CONFLICT_WINDOW_MS = 30 * 60 * 1000;
export const STORY_EDIT_CONFLICT_PROTECTION_MS = 15 * 60 * 1000;
export const STORY_EDIT_CONFLICT_REVISION_COUNT = 4;
export const STORY_EDIT_CONFLICTS_PER_EVIDENCE_MAX = STORY_EDIT_CONFLICT_REVISION_COUNT;
export const STORY_COLLABORATION_MAX_RELATED_CONFLICTS =
  STORY_COLLABORATION_MAX_EVIDENCE * STORY_EDIT_CONFLICTS_PER_EVIDENCE_MAX;
export const STORY_COLLABORATION_MAX_RECUSED_IDENTITIES =
  STORY_COLLABORATION_MAX_RELATED_CONFLICTS * STORY_EDIT_CONFLICT_REVISION_COUNT;

export const STORY_LIST_MAX_LIMIT = 50;
export const STORY_DOCUMENT_MAX_LINKS = 100;
export const STORY_DOCUMENT_MAX_SELECTION = 50;
export const STORY_DOCUMENT_TITLE_PREFIX_INDEX = {
  storyId: 1,
  archived: 1,
  title: 1,
  _id: 1,
} as const;
export const STORY_DOCUMENT_KIND_TITLE_PREFIX_INDEX = {
  storyId: 1,
  archived: 1,
  kind: 1,
  title: 1,
  _id: 1,
} as const;
export const STORY_DOCUMENT_TITLE_QUERY_MAX_LENGTH = 100;
export const STORY_DISCUSSION_MESSAGE_ORDERS = {
  OLDEST_FIRST: 'asc',
  LATEST_FIRST: 'desc',
} as const;
export type StoryDiscussionMessageOrder =
  (typeof STORY_DISCUSSION_MESSAGE_ORDERS)[keyof typeof STORY_DISCUSSION_MESSAGE_ORDERS];
export const STORY_DISCUSSION_MAX_CONTENT_LENGTH = 10_000;
export const STORY_REVIEW_MAX_CONTENT_LENGTH = 10_000;
export const STORY_REVIEW_MAX_ANCHOR_LENGTH = 2_000;
export const STORY_MAX_OPEN_QUESTIONS = 20;

export const STORY_AGENT_API_CAPABILITIES = {
  LIST_STORIES: 'list_stories',
  LIST_STORY_DIRECTORY: 'list_story_directory',
  GET_STORY_READING_START: 'get_story_reading_start',
  GET_STORY_DOCUMENT_LOCATION: 'get_story_document_location',
  MOVE_STORY_DOCUMENT: 'move_story_document',
  WITHDRAW_STORY_DOCUMENT: 'withdraw_story_document',
  REINSTATE_STORY_DOCUMENT: 'reinstate_story_document',
  GET_STORY_REVISION: 'get_story_revision',
  GET_STORY_DOCUMENT_REVISION: 'get_story_document_revision',
  LIST_STORY_ACTIVITY: 'list_story_activity',
  LIST_STORY_DOCUMENT_REFERENCES: 'list_story_document_references',
  GET_STORY_DISCUSSION_MESSAGE: 'get_story_discussion_message',
  GET_STORY_COLLABORATION_CASE: 'get_story_collaboration_case',
  CREATE_STORY: 'create_story',
  GET_STORY: 'get_story',
  REVISE_STORY: 'revise_story',
  LIST_STORY_REVISIONS: 'list_story_revisions',
  RESTORE_STORY: 'restore_story',
  LIST_STORY_DOCUMENTS: 'list_story_documents',
  CREATE_STORY_DOCUMENT: 'create_story_document',
  GET_STORY_DOCUMENT: 'get_story_document',
  REVISE_STORY_DOCUMENT: 'revise_story_document',
  LIST_STORY_DOCUMENT_REVISIONS: 'list_story_document_revisions',
  RESTORE_STORY_DOCUMENT: 'restore_story_document',
  COMPARE_STORY_REVISIONS: 'compare_story_revisions',
  LIST_STORY_DISCUSSIONS: 'list_story_discussions',
  GET_STORY_DISCUSSION: 'get_story_discussion',
  CREATE_STORY_DISCUSSION: 'create_story_discussion',
  LIST_STORY_DISCUSSION_MESSAGES: 'list_story_discussion_messages',
  CREATE_STORY_DISCUSSION_MESSAGE: 'create_story_discussion_message',
  LIST_STORY_REVIEWS: 'list_story_reviews',
  CREATE_STORY_REVIEW: 'create_story_review',
  LIST_STORY_CONFLICTS: 'list_story_conflicts',
  LIST_STORY_COLLABORATION_CASES: 'list_story_collaboration_cases',
  CREATE_STORY_COLLABORATION_CASE: 'create_story_collaboration_case',
  VOTE_STORY_COLLABORATION_CASE: 'vote_story_collaboration_case',
  APPEAL_STORY_COLLABORATION_CASE: 'appeal_story_collaboration_case',
} as const;
