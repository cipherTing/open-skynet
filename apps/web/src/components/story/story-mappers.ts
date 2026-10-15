import {
  storyApiKindToDocumentKind,
  storyApiPhaseToStage,
  type StoryApiBranch,
  type StoryApiDetail,
  type StoryApiDiscussion,
  type StoryApiDiscussionMessage,
  type StoryApiDocument,
  type StoryApiDocumentSummary,
  type StoryApiRecentActivity,
  type StoryApiReview,
  type StoryApiRevision,
  type StoryApiRevisionSummary,
  type StoryApiStory,
} from '@/lib/story-api';
import type {
  StoryActivity,
  StoryBranch,
  StoryDetail,
  StoryDiscussion,
  StoryDiscussionMessage,
  StoryDocument,
  StoryDocumentSummary,
  StoryItem,
  StoryReview,
  StoryRevision,
  StoryRevisionSummary,
  StoryWorkspaceData,
} from './story-types';

export function mapStoryListItem(story: StoryApiStory): StoryItem {
  return {
    id: story.id,
    title: story.title,
    premise: story.premise,
    stage: storyApiPhaseToStage(story.phase),
    documentCount: story.documentCount ?? 0,
    currentVersion: story.currentVersion,
    genre: story.genre,
    createdAt: story.createdAt,
    updatedAt: story.updatedAt,
    openQuestions: [...story.openQuestions],
  };
}

export function mapStoryDetail(detail: StoryApiDetail): StoryDetail {
  const item = mapStoryListItem(detail.story);
  return {
    ...item,
    documentCount: detail.documentCounts.reduce((count, item) => count + item.count, 0),
    tone: detail.story.tone,
    viewpoint: detail.story.viewpoint,
    targetLength: detail.story.targetLength,
    establishedDirection: detail.story.establishedDirection,
  };
}

function mapStoryDocumentFields(
  document: StoryApiDocumentSummary,
): Omit<StoryDocumentSummary, 'content'> {
  return {
    id: document.id,
    storyId: document.storyId,
    branchId: document.branchId,
    title: document.title,
    kind: storyApiKindToDocumentKind(document.kind),
    currentVersion: document.currentVersion,
    updatedAt: document.updatedAt,
    updatedBy: document.createdByAgentId,
    links: document.links,
  };
}

export function mapStoryDocumentSummary(document: StoryApiDocumentSummary): StoryDocumentSummary {
  return mapStoryDocumentFields(document);
}

export function mapStoryDocument(document: StoryApiDocument): StoryDocument {
  return { ...mapStoryDocumentFields(document), content: document.content };
}

export function mapStoryRevision(revision: StoryApiRevision): StoryRevision {
  return {
    id: revision.id,
    storyId: revision.storyId,
    documentId: revision.documentId,
    revisionNumber: revision.revisionNumber,
    baseVersion: revision.baseVersion,
    authorAgentId: revision.authorAgentId,
    changeSummary: revision.changeSummary,
    diff: {
      beforeStory: revision.diff.beforeStory
        ? {
            title: revision.diff.beforeStory.title,
            premise: revision.diff.beforeStory.premise,
            genre: revision.diff.beforeStory.genre,
            tone: revision.diff.beforeStory.tone,
            viewpoint: revision.diff.beforeStory.viewpoint,
            targetLength: revision.diff.beforeStory.targetLength,
            establishedDirection: revision.diff.beforeStory.establishedDirection,
            openQuestions: [...revision.diff.beforeStory.openQuestions],
            stage: storyApiPhaseToStage(revision.diff.beforeStory.phase),
          }
        : null,
      afterStory: revision.diff.afterStory
        ? {
            title: revision.diff.afterStory.title,
            premise: revision.diff.afterStory.premise,
            genre: revision.diff.afterStory.genre,
            tone: revision.diff.afterStory.tone,
            viewpoint: revision.diff.afterStory.viewpoint,
            targetLength: revision.diff.afterStory.targetLength,
            establishedDirection: revision.diff.afterStory.establishedDirection,
            openQuestions: [...revision.diff.afterStory.openQuestions],
            stage: storyApiPhaseToStage(revision.diff.afterStory.phase),
          }
        : null,
      beforeDocument: revision.diff.beforeDocument
        ? {
            ...revision.diff.beforeDocument,
            kind: storyApiKindToDocumentKind(revision.diff.beforeDocument.kind),
          }
        : null,
      afterDocument: revision.diff.afterDocument
        ? {
            ...revision.diff.afterDocument,
            kind: storyApiKindToDocumentKind(revision.diff.afterDocument.kind),
          }
        : null,
    },
    createdAt: revision.createdAt,
  };
}

export function mapStoryRevisionSummary(revision: StoryApiRevisionSummary): StoryRevisionSummary {
  return { ...revision };
}

export function mapStoryDiscussion(discussion: StoryApiDiscussion): StoryDiscussion {
  return {
    id: discussion.id,
    documentId: discussion.documentId,
    revisionNumber: discussion.revisionNumber,
    branchId: discussion.branchId,
    anchorText: discussion.anchorText,
    title: discussion.title,
    noticeTargetAgentId: discussion.noticeTargetAgentId,
    createdByAgentId: discussion.createdByAgentId,
    createdAt: discussion.createdAt,
  };
}

export function mapStoryDiscussionMessage(
  message: StoryApiDiscussionMessage,
): StoryDiscussionMessage {
  return {
    id: message.id,
    discussionId: message.discussionId,
    parentMessageId: message.parentMessageId,
    content: message.content,
    authorAgentId: message.authorAgentId,
    createdAt: message.createdAt,
  };
}

export function mapStoryBranch(branch: StoryApiBranch): StoryBranch {
  return {
    id: branch.id,
    storyId: branch.storyId,
    title: branch.title,
    premise: branch.premise,
    sourceDocumentId: branch.sourceDocumentId,
    sourceRevisionNumber: branch.sourceRevisionNumber,
    createdByAgentId: branch.createdByAgentId,
    createdAt: branch.createdAt,
    updatedAt: branch.updatedAt,
  };
}

export function mapStoryReviews(items: StoryApiReview[]): StoryReview[] {
  return items.map((review) => ({
    id: review.id,
    documentId: review.documentId,
    revisionNumber: review.revisionNumber,
    content: review.content,
    anchorText: review.anchorText,
    authorAgentId: review.authorAgentId,
    createdAt: review.createdAt,
  }));
}

export function mapStoryActivity(revisions: StoryApiRecentActivity[]): StoryActivity[] {
  return revisions.map((revision) => ({
    id: revision.id,
    kind: 'REVISION',
    revisionNumber: revision.revisionNumber,
    branchId: revision.branchId,
    title: revision.title,
    summary: revision.changeSummary,
    authorName: revision.authorAgentId,
    createdAt: revision.createdAt,
    documentId: revision.documentId,
  }));
}

export function mapStoryWorkspace(input: {
  detail: StoryApiDetail;
  documents: StoryApiDocumentSummary[];
  revisions: StoryApiRevisionSummary[];
  storyRevisions: StoryApiRevision[];
  discussions: StoryApiDiscussion[];
  branches: StoryApiBranch[];
  reviews: StoryApiReview[];
}): StoryWorkspaceData {
  return {
    story: mapStoryDetail(input.detail),
    documents: input.documents.map(mapStoryDocumentSummary),
    revisions: input.revisions.map(mapStoryRevisionSummary),
    storyRevisions: input.storyRevisions.map(mapStoryRevision),
    discussions: input.discussions.map(mapStoryDiscussion),
    branches: input.branches.map(mapStoryBranch),
    reviews: mapStoryReviews(input.reviews),
    activities: mapStoryActivity(input.detail.recentActivity),
  };
}
