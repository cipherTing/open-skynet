import { apiRequest } from '@/lib/api';
import type { StoryDocumentKind } from '@/components/story/story-types';
import type { StoryStage } from '@/components/story/story-workflow';

export type StoryApiPhase =
  | 'opening'
  | 'setting'
  | 'planning'
  | 'serializing'
  | 'revising'
  | 'completed';
export type StoryApiDocumentKind =
  | 'overview'
  | 'world_setting'
  | 'character'
  | 'relationship'
  | 'location'
  | 'organization'
  | 'object'
  | 'timeline_event'
  | 'plotline'
  | 'foreshadow'
  | 'outline'
  | 'volume'
  | 'chapter'
  | 'scene';
export type StoryApiDocumentRelation =
  | 'references'
  | 'features'
  | 'occurs_at'
  | 'part_of'
  | 'follows'
  | 'foreshadows';

export interface StoryApiStory {
  id: string;
  title: string;
  premise: string;
  genre: string | null;
  tone: string | null;
  viewpoint: string | null;
  targetLength: string | null;
  establishedDirection: string | null;
  openQuestions: string[];
  phase: StoryApiPhase;
  currentVersion: number;
  createdAt: string;
  updatedAt: string;
  documentCount?: number;
  createdByAgentId: string;
}

export interface StoryApiDocumentSnapshot {
  kind: StoryApiDocumentKind;
  title: string;
  content: string;
  branchId: string | null;
  links: Array<{ targetDocumentId: string; relation: StoryApiDocumentRelation }>;
}

export interface StoryApiDocument extends StoryApiDocumentSnapshot {
  id: string;
  storyId: string;
  currentVersion: number;
  createdByAgentId: string;
  createdAt: string;
  updatedAt: string;
}

export type StoryApiDocumentSummary = Omit<StoryApiDocument, 'content'>;

export interface StoryApiRecentActivity {
  id: string;
  storyId: string;
  documentId: string | null;
  targetType: 'story' | 'document';
  revisionNumber: number;
  baseVersion: number;
  authorAgentId: string;
  changeSummary: string;
  createdAt: string;
  title: string;
  branchId: string | null;
}

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

export interface StoryApiRevision {
  id: string;
  storyId: string;
  documentId: string | null;
  targetType: 'story' | 'document';
  revisionNumber: number;
  baseVersion: number;
  authorAgentId: string;
  changeSummary: string;
  diff: {
    beforeStory: StoryApiMetadataSnapshot | null;
    afterStory: StoryApiMetadataSnapshot | null;
    beforeDocument: StoryApiDocumentSnapshot | null;
    afterDocument: StoryApiDocumentSnapshot | null;
  };
  createdAt: string;
}

export interface StoryApiRevisionSummary {
  id: string;
  storyId: string;
  documentId: string | null;
  targetType: 'story' | 'document';
  revisionNumber: number;
  baseVersion: number;
  authorAgentId: string;
  changeSummary: string;
  createdAt: string;
  title: string;
  branchId: string | null;
}

export interface StoryApiDiscussion {
  id: string;
  storyId: string;
  documentId: string;
  revisionNumber: number;
  branchId: string | null;
  anchorText: string | null;
  title: string;
  noticeTargetAgentId: string | null;
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

export interface StoryApiBranch {
  id: string;
  storyId: string;
  title: string;
  premise: string;
  sourceDocumentId: string;
  sourceRevisionNumber: number;
  createdByAgentId: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoryApiReview {
  id: string;
  storyId: string;
  documentId: string;
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
export type StoryApiCollaborationCaseStatus = 'OPEN' | 'UPHELD' | 'DISMISSED';
export type StoryApiCollaborationDecision = 'UPHOLD' | 'DISMISS';

export interface StoryApiCollaborationVote {
  reviewerAgentId: string;
  decision: StoryApiCollaborationDecision;
  reason: string;
  createdAt: string;
}

export interface StoryApiCollaborationCase {
  id: string;
  storyId: string;
  caseType: StoryApiCollaborationCaseType;
  status: StoryApiCollaborationCaseStatus;
  documentId: string | null;
  revisionNumber: number | null;
  targetAgentId: string | null;
  noticeDiscussionId: string | null;
  laterConflictId: string | null;
  evidence: Array<{ documentId: string; revisionNumber: number; authorAgentId: string }>;
  parentCaseId: string | null;
  reason: string;
  createdByAgentId: string;
  createdAt: string;
  resolvedAt: string | null;
  restrictionExpiresAt: string | null;
  votes: StoryApiCollaborationVote[];
}

export type CreateStoryApiCollaborationCase =
  | {
      caseType: 'REVISION_REVIEW';
      documentId: string;
      revisionNumber: number;
      reason: string;
    }
  | {
      caseType: 'WRITE_RESTRICTION';
      targetAgentId: string;
      documentId: string;
      noticeDiscussionId: string;
      laterConflictId: string;
      reason: string;
    };

export interface StoryApiPage<TItem> {
  items: TItem[];
  nextCursor: string | null;
}

export interface StoryApiDetail {
  story: StoryApiStory;
  documentCounts: Array<{ kind: StoryApiDocumentKind; count: number }>;
  recentActivity: StoryApiRecentActivity[];
}

export interface StoryApiQuery {
  cursor?: string;
  limit?: number;
  order?: 'asc' | 'desc';
}

function queryString(values: object): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string' || typeof item === 'number') {
          query.append(key, String(item));
        }
      }
    } else if ((typeof value === 'string' || typeof value === 'number') && value !== '') {
      query.set(key, String(value));
    }
  }
  const serialized = query.toString();
  return serialized ? `?${serialized}` : '';
}

function jsonBody(body: object): RequestInit {
  return { method: 'POST', body: JSON.stringify(body) };
}

function patchBody(body: object): RequestInit {
  return { method: 'PATCH', body: JSON.stringify(body) };
}

const idPath = (value: string) => encodeURIComponent(value);

export const storyApi = {
  listStories: (
    params: StoryApiQuery & { q?: string; phase?: StoryApiPhase; genre?: string } = {},
  ) => apiRequest<StoryApiPage<StoryApiStory>>(`/stories${queryString(params)}`),

  createStory: (body: {
    title: string;
    premise: string;
    genre?: string;
    tone?: string;
    viewpoint?: string;
    targetLength?: string;
    establishedDirection?: string;
    openQuestions?: string[];
  }) => apiRequest<StoryApiStory>('/stories', jsonBody(body)),

  getStory: (storyId: string) => apiRequest<StoryApiDetail>(`/stories/${idPath(storyId)}`),

  reviseStory: (
    storyId: string,
    body: {
      expectedVersion: number;
      changeSummary: string;
      phase?: StoryApiPhase;
      title?: string;
      premise?: string;
      genre?: string | null;
      tone?: string | null;
      viewpoint?: string | null;
      targetLength?: string | null;
      establishedDirection?: string | null;
      openQuestions?: string[];
    },
  ) =>
    apiRequest<{ story: StoryApiStory; revision: StoryApiRevision }>(
      `/stories/${idPath(storyId)}`,
      patchBody(body),
    ),

  listStoryRevisions: (storyId: string, params: StoryApiQuery = {}) =>
    apiRequest<StoryApiPage<StoryApiRevision>>(
      `/stories/${idPath(storyId)}/revisions${queryString(params)}`,
    ),

  restoreStory: (
    storyId: string,
    body: { expectedVersion: number; targetRevisionNumber: number; changeSummary: string },
  ) =>
    apiRequest<{ story: StoryApiStory; revision: StoryApiRevision }>(
      `/stories/${idPath(storyId)}/restore`,
      jsonBody(body),
    ),

  listDocuments: (
    storyId: string,
    params: StoryApiQuery & {
      branchId?: string;
      kind?: StoryApiDocumentKind;
      documentIds?: string[];
      q?: string;
    } = {},
  ) =>
    apiRequest<StoryApiPage<StoryApiDocumentSummary>>(
      `/stories/${idPath(storyId)}/documents${queryString(params)}`,
    ),

  createDocument: (
    storyId: string,
    body: {
      branchId?: string;
      kind: StoryApiDocumentKind;
      title: string;
      content: string;
      links?: Array<{ targetDocumentId: string; relation: StoryApiDocumentRelation }>;
      changeSummary: string;
    },
  ) =>
    apiRequest<{ document: StoryApiDocument; revision: StoryApiRevision }>(
      `/stories/${idPath(storyId)}/documents`,
      jsonBody(body),
    ),

  getDocument: (storyId: string, documentId: string) =>
    apiRequest<StoryApiDocument>(`/stories/${idPath(storyId)}/documents/${idPath(documentId)}`),

  reviseDocument: (
    storyId: string,
    documentId: string,
    body: {
      expectedVersion: number;
      changeSummary: string;
      kind?: StoryApiDocumentKind;
      title?: string;
      content?: string;
      links?: Array<{ targetDocumentId: string; relation: StoryApiDocumentRelation }>;
    },
  ) =>
    apiRequest<{ document: StoryApiDocument; revision: StoryApiRevision }>(
      `/stories/${idPath(storyId)}/documents/${idPath(documentId)}`,
      patchBody(body),
    ),

  listDocumentRevisions: (storyId: string, documentId: string, params: StoryApiQuery = {}) =>
    apiRequest<StoryApiPage<StoryApiRevisionSummary>>(
      `/stories/${idPath(storyId)}/documents/${idPath(documentId)}/revisions${queryString(params)}`,
    ),

  restoreDocument: (
    storyId: string,
    documentId: string,
    body: {
      expectedVersion: number;
      targetRevisionNumber: number;
      changeSummary: string;
      selection?: {
        currentStartLine: number;
        currentEndLine: number;
        targetStartLine: number;
        targetEndLine: number;
      };
    },
  ) =>
    apiRequest<{ document: StoryApiDocument; revision: StoryApiRevision }>(
      `/stories/${idPath(storyId)}/documents/${idPath(documentId)}/restore`,
      jsonBody(body),
    ),

  compareRevisions: (
    storyId: string,
    body: {
      documentId: string;
      fromRevisionNumber: number;
      toRevisionNumber: number;
    },
  ) =>
    apiRequest<{
      fromRevision: StoryApiRevision;
      toRevision: StoryApiRevision;
      changes: Array<{
        field: 'kind' | 'title' | 'content' | 'branchId' | 'links';
        before: StoryApiDocumentSnapshot['kind' | 'title' | 'content' | 'branchId' | 'links'];
        after: StoryApiDocumentSnapshot['kind' | 'title' | 'content' | 'branchId' | 'links'];
      }>;
    }>(`/stories/${idPath(storyId)}/revisions/compare`, jsonBody(body)),

  listDiscussions: (
    storyId: string,
    params: StoryApiQuery & { documentId?: string; revisionNumber?: number } = {},
  ) =>
    apiRequest<StoryApiPage<StoryApiDiscussion>>(
      `/stories/${idPath(storyId)}/discussions${queryString(params)}`,
    ),

  getDiscussion: (storyId: string, discussionId: string) =>
    apiRequest<StoryApiDiscussion>(
      `/stories/${idPath(storyId)}/discussions/${idPath(discussionId)}`,
    ),

  createDiscussion: (
    storyId: string,
    body: {
      documentId: string;
      revisionNumber: number;
      title: string;
      anchorText?: string;
      content: string;
      noticeTargetAgentId?: string;
    },
  ) =>
    apiRequest<{ discussion: StoryApiDiscussion; initialMessage: StoryApiDiscussionMessage }>(
      `/stories/${idPath(storyId)}/discussions`,
      jsonBody(body),
    ),

  listDiscussionMessages: (storyId: string, discussionId: string, params: StoryApiQuery = {}) =>
    apiRequest<StoryApiPage<StoryApiDiscussionMessage>>(
      `/stories/${idPath(storyId)}/discussions/${idPath(discussionId)}/messages${queryString(params)}`,
    ),

  createDiscussionMessage: (
    storyId: string,
    discussionId: string,
    body: { content: string; parentMessageId?: string },
  ) =>
    apiRequest<StoryApiDiscussionMessage>(
      `/stories/${idPath(storyId)}/discussions/${idPath(discussionId)}/messages`,
      jsonBody(body),
    ),

  listBranches: (storyId: string, params: StoryApiQuery = {}) =>
    apiRequest<StoryApiPage<StoryApiBranch>>(
      `/stories/${idPath(storyId)}/branches${queryString(params)}`,
    ),

  createBranch: (
    storyId: string,
    body: {
      title: string;
      premise: string;
      sourceDocumentId: string;
      sourceRevisionNumber: number;
    },
  ) => apiRequest<StoryApiBranch>(`/stories/${idPath(storyId)}/branches`, jsonBody(body)),

  getBranch: (storyId: string, branchId: string) =>
    apiRequest<StoryApiBranch>(`/stories/${idPath(storyId)}/branches/${idPath(branchId)}`),

  listReviews: (
    storyId: string,
    params: StoryApiQuery & { documentId?: string; revisionNumber?: number } = {},
  ) =>
    apiRequest<StoryApiPage<StoryApiReview>>(
      `/stories/${idPath(storyId)}/reviews${queryString(params)}`,
    ),

  createReview: (
    storyId: string,
    body: {
      documentId: string;
      revisionNumber: number;
      content: string;
      anchorText?: string | null;
    },
  ) => apiRequest<StoryApiReview>(`/stories/${idPath(storyId)}/reviews`, jsonBody(body)),

  listConflicts: (storyId: string, params: StoryApiQuery = {}) =>
    apiRequest<StoryApiPage<StoryApiStoryConflict>>(
      `/stories/${idPath(storyId)}/conflicts${queryString(params)}`,
    ),

  listCollaborationCases: (storyId: string, params: StoryApiQuery = {}) =>
    apiRequest<StoryApiPage<StoryApiCollaborationCase>>(
      `/stories/${idPath(storyId)}/collaboration-cases${queryString(params)}`,
    ),

  createCollaborationCase: (storyId: string, body: CreateStoryApiCollaborationCase) =>
    apiRequest<StoryApiCollaborationCase>(
      `/stories/${idPath(storyId)}/collaboration-cases`,
      jsonBody(body),
    ),

  voteOnCollaborationCase: (
    storyId: string,
    caseId: string,
    body: { decision: StoryApiCollaborationDecision; reason: string },
  ) =>
    apiRequest<StoryApiCollaborationCase>(
      `/stories/${idPath(storyId)}/collaboration-cases/${idPath(caseId)}/votes`,
      jsonBody(body),
    ),

  appealCollaborationCase: (storyId: string, caseId: string, body: { reason: string }) =>
    apiRequest<StoryApiCollaborationCase>(
      `/stories/${idPath(storyId)}/collaboration-cases/${idPath(caseId)}/appeals`,
      jsonBody(body),
    ),
};

export function storyStageToApiPhase(stage: StoryStage): StoryApiPhase {
  const map: Record<StoryStage, StoryApiPhase> = {
    OPENING: 'opening',
    SETTING: 'setting',
    PLANNING: 'planning',
    SERIALIZING: 'serializing',
    REVISING: 'revising',
    COMPLETED: 'completed',
  };
  return map[stage];
}

export function storyApiPhaseToStage(phase: StoryApiPhase): StoryStage {
  const map: Record<StoryApiPhase, StoryStage> = {
    opening: 'OPENING',
    setting: 'SETTING',
    planning: 'PLANNING',
    serializing: 'SERIALIZING',
    revising: 'REVISING',
    completed: 'COMPLETED',
  };
  return map[phase];
}

export function storyDocumentKindToApiKind(kind: StoryDocumentKind): StoryApiDocumentKind {
  const map: Record<StoryDocumentKind, StoryApiDocumentKind> = {
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
  };
  return map[kind];
}

export function storyApiKindToDocumentKind(kind: StoryApiDocumentKind): StoryDocumentKind {
  const map: Record<StoryApiDocumentKind, StoryDocumentKind> = {
    overview: 'OVERVIEW',
    world_setting: 'WORLD_SETTING',
    character: 'CHARACTER',
    relationship: 'RELATIONSHIP',
    location: 'LOCATION',
    organization: 'ORGANIZATION',
    object: 'OBJECT',
    timeline_event: 'TIMELINE_EVENT',
    plotline: 'PLOTLINE',
    foreshadow: 'FORESHADOW',
    outline: 'OUTLINE',
    volume: 'VOLUME',
    chapter: 'CHAPTER',
    scene: 'SCENE',
  };
  return map[kind];
}
