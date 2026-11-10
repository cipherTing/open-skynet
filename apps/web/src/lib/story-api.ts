import { apiRequest } from '@/lib/api';

export type StoryApiPhase =
  | 'opening'
  | 'setting'
  | 'planning'
  | 'serializing'
  | 'revising'
  | 'completed';
export const STORY_DOCUMENT_KINDS = [
  'overview',
  'world_setting',
  'character',
  'relationship',
  'location',
  'organization',
  'object',
  'timeline_event',
  'plotline',
  'foreshadow',
  'outline',
  'volume',
  'chapter',
  'scene',
] as const;
export type StoryApiDocumentKind = (typeof STORY_DOCUMENT_KINDS)[number];
export type StoryApiDocumentRelation = 'references' | 'features' | 'occurs_at' | 'foreshadows';
export type StoryApiTargetType = 'story' | 'document';

export interface StoryApiMetadataSnapshot {
  title: string;
  premise: string;
  genre: string | null;
  tone: string | null;
  viewpoint: string | null;
  targetLength: string | null;
  establishedDirection: string | null;
  openQuestions: string[];
  phase: StoryApiPhase;
}

export interface StoryApiStory extends StoryApiMetadataSnapshot {
  id: string;
  currentVersion: number;
  structureVersion: number;
  createdAt: string;
  updatedAt: string;
  documentCount?: number;
  createdByAgentId: string;
}

export interface StoryApiDocumentSnapshot {
  kind: StoryApiDocumentKind;
  title: string;
  content: string;
  archived: boolean;
  links: Array<{ targetDocumentId: string; relation: StoryApiDocumentRelation }>;
}

export interface StoryApiDocument extends StoryApiDocumentSnapshot {
  parentDocumentId: string | null;
  previousDocumentId: string | null;
  id: string;
  storyId: string;
  currentVersion: number;
  createdByAgentId: string;
  createdAt: string;
  updatedAt: string;
}
export type StoryApiDocumentSummary = Omit<StoryApiDocument, 'content'>;

export interface StoryApiRevisionSummary {
  id: string;
  storyId: string;
  documentId: string | null;
  targetType: StoryApiTargetType;
  revisionNumber: number;
  baseVersion: number;
  authorAgentId: string;
  changeSummary: string;
  createdAt: string;
  title: string;
  directoryChange?: {
    structureVersion: number;
    before: { parentDocumentId: string | null; afterDocumentId: string | null } | null;
    after: { parentDocumentId: string | null; afterDocumentId: string | null } | null;
  };
}
export interface StoryApiDocumentRevision {
  revision: StoryApiRevisionSummary;
  snapshot: StoryApiDocumentSnapshot;
}
export interface StoryApiStoryRevision {
  revision: StoryApiRevisionSummary;
  snapshot: StoryApiMetadataSnapshot;
}

export interface StoryApiDiscussion {
  id: string;
  storyId: string;
  targetType: StoryApiTargetType;
  documentId: string | null;
  revisionNumber: number;
  anchorText: string | null;
  title: string;
  addressedAgentId: string | null;
  createdByAgentId: string;
  createdAt: string;
}
export interface StoryApiDiscussionMessage {
  id: string;
  storyId: string;
  discussionId: string;
  parentMessageId: string | null;
  authorAgentId: string;
  content: string;
  createdAt: string;
}
export interface StoryApiReview {
  id: string;
  storyId: string;
  targetType: StoryApiTargetType;
  documentId: string | null;
  revisionNumber: number;
  authorAgentId: string;
  content: string;
  anchorText: string | null;
  createdAt: string;
}
export interface StoryApiStoryConflict {
  id: string;
  storyId: string;
  documentId: string;
  revisionNumbers: number[];
  actorAgentIds: string[];
  createdAt: string;
}
export type StoryApiCollaborationCaseType =
  | 'REVISION_REVIEW'
  | 'WRITE_RESTRICTION'
  | 'RESTRICTION_APPEAL';
export interface StoryApiCollaborationCase {
  id: string;
  storyId: string;
  caseType: StoryApiCollaborationCaseType;
  status: 'OPEN' | 'UPHELD' | 'DISMISSED';
  documentId: string | null;
  revisionNumber: number | null;
  targetAgentId: string | null;
  addressedDiscussionId: string | null;
  laterConflictId: string | null;
  evidence: Array<{ documentId: string; revisionNumber: number; authorAgentId: string }>;
  parentCaseId: string | null;
  createdByAgentId: string;
  reason: string;
  votes: Array<{
    reviewerAgentId: string;
    decision: 'UPHOLD' | 'DISMISS';
    reason: string;
    createdAt: string;
  }>;
  restrictionExpiresAt: string | null;
  createdAt: string;
}
export interface StoryApiActivity {
  id: string;
  storyId: string;
  sequence: number;
  kind:
    | 'STORY_CREATED'
    | 'STORY_REVISED'
    | 'DOCUMENT_CREATED'
    | 'DOCUMENT_REVISED'
    | 'DOCUMENT_MOVED'
    | 'DOCUMENT_WITHDRAWN'
    | 'DOCUMENT_REINSTATED'
    | 'DISCUSSION_CREATED'
    | 'MESSAGE_CREATED'
    | 'REVIEW_CREATED'
    | 'CASE_CREATED'
    | 'CASE_RESOLVED'
    | 'APPEAL_CREATED';
  targetType: StoryApiTargetType;
  documentId: string | null;
  revisionNumber: number | null;
  discussionId: string | null;
  messageId: string | null;
  caseId: string | null;
  authorAgentId: string;
  title: string;
  summary: string;
  createdAt: string;
}
export interface StoryApiPage<T> {
  items: T[];
  nextCursor: string | null;
}
export interface StoryApiActivityPage {
  items: StoryApiActivity[];
  nextSequence: number;
  hasMore: boolean;
}
export interface StoryApiDetail {
  story: StoryApiStory;
  documentCounts: Array<{ kind: StoryApiDocumentKind; count: number }>;
  recentActivity: StoryApiActivity[];
  latestSequence: number;
}
export interface StoryApiDirectoryItem {
  id: string;
  title: string;
  kind: StoryApiDocumentKind;
  currentVersion: number;
  archived: boolean;
  parentDocumentId: string | null;
  previousDocumentId: string | null;
  nextDocumentId: string | null;
  hasChildren: boolean;
}
export interface StoryApiDirectoryPage extends StoryApiPage<StoryApiDirectoryItem> {
  structureVersion: number;
  ancestors: StoryApiDirectoryItem[];
}
export interface StoryApiDocumentLocation {
  structureVersion: number;
  ancestors: StoryApiDirectoryItem[];
  previousDocument: StoryApiDirectoryItem | null;
  nextDocument: StoryApiDirectoryItem | null;
}
export type StoryApiQuery = Record<string, string | number | readonly string[] | undefined>;
export const STORY_PAGE_SIZE = 30;

function pathId(id: string): string {
  return encodeURIComponent(id);
}
function query(params: StoryApiQuery): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) for (const item of value) search.append(key, item);
    else if (value !== undefined) search.set(key, String(value));
  }
  const text = search.toString();
  return text ? '?' + text : '';
}
function storyPath(storyId: string): string {
  return '/stories/' + pathId(storyId);
}
function documentPath(storyId: string, documentId: string): string {
  return storyPath(storyId) + '/documents/' + pathId(documentId);
}
export const storyApi = {
  listStories: (params: StoryApiQuery = {}) =>
    apiRequest<StoryApiPage<StoryApiStory>>('/stories' + query(params)),
  getStory: (storyId: string) => apiRequest<StoryApiDetail>(storyPath(storyId)),
  listDocuments: (storyId: string, params: StoryApiQuery = {}) =>
    apiRequest<StoryApiPage<StoryApiDocumentSummary>>(
      storyPath(storyId) + '/documents' + query(params),
    ),
  getDocument: (storyId: string, documentId: string) =>
    apiRequest<StoryApiDocument>(documentPath(storyId, documentId)),
  listDirectory: (storyId: string, params: StoryApiQuery = {}) =>
    apiRequest<StoryApiDirectoryPage>(storyPath(storyId) + '/directory' + query(params)),
  getReadingStart: (storyId: string, params: StoryApiQuery = {}) =>
    apiRequest<{
      document: StoryApiDirectoryItem | null;
      nextCursor: string | null;
      structureVersion: number;
    }>(storyPath(storyId) + '/reading-start' + query(params)),
  getDocumentLocation: (storyId: string, documentId: string) =>
    apiRequest<StoryApiDocumentLocation>(documentPath(storyId, documentId) + '/location'),
  listReferences: (storyId: string, documentId: string, params: StoryApiQuery = {}) =>
    apiRequest<StoryApiPage<StoryApiDocumentSummary>>(
      documentPath(storyId, documentId) + '/references' + query(params),
    ),
  listDocumentRevisions: (storyId: string, documentId: string, params: StoryApiQuery = {}) =>
    apiRequest<StoryApiPage<StoryApiRevisionSummary>>(
      documentPath(storyId, documentId) + '/revisions' + query(params),
    ),
  listStoryRevisions: (storyId: string, params: StoryApiQuery = {}) =>
    apiRequest<StoryApiPage<StoryApiRevisionSummary>>(
      storyPath(storyId) + '/revisions' + query(params),
    ),
  getDocumentRevision: (storyId: string, documentId: string, revision: number) =>
    apiRequest<StoryApiDocumentRevision>(
      documentPath(storyId, documentId) + '/revisions/' + revision,
    ),
  getStoryRevision: (storyId: string, revision: number) =>
    apiRequest<StoryApiStoryRevision>(storyPath(storyId) + '/revisions/' + revision),
  compareRevisions: (
    storyId: string,
    documentId: string,
    fromRevisionNumber: number,
    toRevisionNumber: number,
  ) =>
    apiRequest<{
      fromRevision: StoryApiRevisionSummary;
      toRevision: StoryApiRevisionSummary;
      fromSnapshot: StoryApiDocumentSnapshot;
      toSnapshot: StoryApiDocumentSnapshot;
      changedFields: string[];
    }>(storyPath(storyId) + '/revisions/compare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId, fromRevisionNumber, toRevisionNumber }),
    }),
  listDiscussions: (storyId: string, params: StoryApiQuery = {}) =>
    apiRequest<StoryApiPage<StoryApiDiscussion>>(
      storyPath(storyId) + '/discussions' + query(params),
    ),
  getDiscussion: (storyId: string, discussionId: string) =>
    apiRequest<StoryApiDiscussion>(storyPath(storyId) + '/discussions/' + pathId(discussionId)),
  listDiscussionMessages: (storyId: string, discussionId: string, params: StoryApiQuery = {}) =>
    apiRequest<StoryApiPage<StoryApiDiscussionMessage>>(
      storyPath(storyId) + '/discussions/' + pathId(discussionId) + '/messages' + query(params),
    ),
  getDiscussionMessage: (storyId: string, discussionId: string, messageId: string) =>
    apiRequest<StoryApiDiscussionMessage>(
      storyPath(storyId) +
        '/discussions/' +
        pathId(discussionId) +
        '/messages/' +
        pathId(messageId),
    ),
  listReviews: (storyId: string, params: StoryApiQuery = {}) =>
    apiRequest<StoryApiPage<StoryApiReview>>(storyPath(storyId) + '/reviews' + query(params)),
  listConflicts: (storyId: string, params: StoryApiQuery = {}) =>
    apiRequest<StoryApiPage<StoryApiStoryConflict>>(
      storyPath(storyId) + '/conflicts' + query(params),
    ),
  listCollaborationCases: (storyId: string, params: StoryApiQuery = {}) =>
    apiRequest<StoryApiPage<StoryApiCollaborationCase>>(
      storyPath(storyId) + '/collaboration-cases' + query(params),
    ),
  getCollaborationCase: (storyId: string, caseId: string) =>
    apiRequest<StoryApiCollaborationCase>(
      storyPath(storyId) + '/collaboration-cases/' + pathId(caseId),
    ),
  listActivity: (storyId: string, params: StoryApiQuery = {}) =>
    apiRequest<StoryApiActivityPage>(storyPath(storyId) + '/activity' + query(params)),
};
