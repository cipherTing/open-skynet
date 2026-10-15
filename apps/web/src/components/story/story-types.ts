import type { StoryDirectoryItem, StoryStage } from './story-workflow';

export type StoryDocumentKind =
  | 'OVERVIEW'
  | 'WORLD_SETTING'
  | 'CHARACTER'
  | 'RELATIONSHIP'
  | 'LOCATION'
  | 'ORGANIZATION'
  | 'OBJECT'
  | 'TIMELINE_EVENT'
  | 'PLOTLINE'
  | 'FORESHADOW'
  | 'OUTLINE'
  | 'VOLUME'
  | 'CHAPTER'
  | 'SCENE';

export interface StoryItem extends StoryDirectoryItem {
  openQuestions: string[];
}

export interface StoryDetail extends StoryItem {
  tone: string | null;
  viewpoint: string | null;
  targetLength: string | null;
  establishedDirection: string | null;
}

export interface StoryDocumentSummary {
  id: string;
  storyId: string;
  branchId: string | null;
  title: string;
  kind: StoryDocumentKind;
  currentVersion: number;
  updatedAt: string;
  updatedBy: string;
  links: Array<{ targetDocumentId: string; relation: string }>;
}

export interface StoryDocument extends StoryDocumentSummary {
  content: string;
}

export interface StoryRevision {
  id: string;
  storyId: string;
  documentId: string | null;
  revisionNumber: number;
  baseVersion: number;
  authorAgentId: string;
  changeSummary: string;
  diff: {
    beforeStory: StoryMetadataSnapshot | null;
    afterStory: StoryMetadataSnapshot | null;
    beforeDocument: {
      kind: StoryDocumentKind;
      title: string;
      content: string;
      branchId: string | null;
      links: Array<{ targetDocumentId: string; relation: string }>;
    } | null;
    afterDocument: {
      kind: StoryDocumentKind;
      title: string;
      content: string;
      branchId: string | null;
      links: Array<{ targetDocumentId: string; relation: string }>;
    } | null;
  };
  createdAt: string;
}

export interface StoryRevisionSummary {
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

export interface StoryMetadataSnapshot {
  title: string;
  premise: string;
  genre: string | null;
  tone: string | null;
  viewpoint: string | null;
  targetLength: string | null;
  establishedDirection: string | null;
  openQuestions: string[];
  stage: StoryStage;
}

export interface StoryDiscussion {
  id: string;
  documentId: string;
  revisionNumber: number;
  branchId: string | null;
  anchorText: string | null;
  title: string;
  noticeTargetAgentId: string | null;
  createdByAgentId: string;
  createdAt: string;
}

export interface StoryDiscussionMessage {
  id: string;
  discussionId: string;
  parentMessageId: string | null;
  content: string;
  authorAgentId: string;
  createdAt: string;
}

export interface StoryBranch {
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

export interface StoryReview {
  id: string;
  documentId: string;
  revisionNumber: number;
  content: string;
  anchorText: string | null;
  authorAgentId: string;
  createdAt: string;
}

export interface StoryActivity {
  id: string;
  kind: 'REVISION' | 'DISCUSSION' | 'REVIEW' | 'BRANCH';
  revisionNumber: number | null;
  branchId: string | null;
  title: string;
  summary: string;
  authorName: string;
  createdAt: string;
  documentId: string | null;
}

export interface StoryWorkspaceData {
  story: StoryDetail;
  documents: StoryDocumentSummary[];
  revisions: StoryRevisionSummary[];
  storyRevisions: StoryRevision[];
  discussions: StoryDiscussion[];
  branches: StoryBranch[];
  reviews: StoryReview[];
  activities: StoryActivity[];
}

export interface StoryComparison {
  fromRevision: StoryRevision;
  toRevision: StoryRevision;
  changes: Array<{
    field: 'kind' | 'title' | 'content' | 'branchId' | 'links';
    before: string | number | null | StoryDocument['links'] | StoryDocumentKind;
    after: string | number | null | StoryDocument['links'] | StoryDocumentKind;
  }>;
}

export interface CreateStoryInput {
  title: string;
  premise: string;
  genre: string;
  tone: string;
  viewpoint: string;
  targetLength: string;
  establishedDirection: string;
  openQuestions: string[];
}

export interface SaveStoryDocumentInput {
  documentId: string;
  content: string;
  summary: string;
  expectedVersion: number;
}

export interface ReviseStoryInput {
  expectedVersion: number;
  changeSummary: string;
  title: string;
  premise: string;
  genre: string | null;
  tone: string | null;
  viewpoint: string | null;
  targetLength: string | null;
  establishedDirection: string | null;
  openQuestions: string[];
}

export interface RestoreStoryRevisionInput {
  documentId: string;
  targetRevisionNumber: number;
  changeSummary: string;
  expectedVersion: number;
  selection: {
    currentStartLine: number;
    currentEndLine: number;
    targetStartLine: number;
    targetEndLine: number;
  } | null;
}

export interface RestoreStoryMetadataInput {
  targetRevisionNumber: number;
  expectedVersion: number;
  changeSummary: string;
}

export interface CreateStoryDiscussionInput {
  documentId: string;
  revisionNumber: number;
  title: string;
  content: string;
  anchorText: string | null;
  noticeTargetAgentId: string | null;
}

export interface CreateStoryDiscussionMessageInput {
  discussionId: string;
  content: string;
  parentMessageId: string | null;
}

export interface CreateStoryBranchInput {
  title: string;
  premise: string;
  sourceDocumentId: string;
  sourceRevisionNumber: number;
}

export interface CreateStoryReviewInput {
  documentId: string;
  revisionNumber: number;
  content: string;
  anchorText: string | null;
}

export interface StoryWorkspaceActions {
  onCreateDocument: (input: {
    title: string;
    kind: StoryDocumentKind;
    parentId: string | null;
    branchId: string | null;
  }) => void | Promise<void>;
  onReviseStory: (input: ReviseStoryInput) => void | Promise<void>;
  onRestoreStoryMetadata: (input: RestoreStoryMetadataInput) => void | Promise<void>;
  onSaveDocument: (input: SaveStoryDocumentInput) => void | Promise<void>;
  onRestoreRevision: (input: RestoreStoryRevisionInput) => void | Promise<void>;
  onCreateDiscussion: (input: CreateStoryDiscussionInput) => void | Promise<void>;
  onCreateDiscussionMessage: (input: CreateStoryDiscussionMessageInput) => void | Promise<void>;
  onLoadDiscussionMessages: (discussionId: string) => Promise<StoryDiscussionMessage[]>;
  onCreateBranch: (input: CreateStoryBranchInput) => void | Promise<void>;
  onCreateReview: (input: CreateStoryReviewInput) => void | Promise<void>;
  onCompareRevisions: (
    documentId: string,
    fromRevisionNumber: number,
    toRevisionNumber: number,
  ) => Promise<StoryComparison>;
  onUpdateStage: (stage: StoryStage) => void | Promise<void>;
}
