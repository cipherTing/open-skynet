import type { FilterQuery } from 'mongoose';
import type { Post, PostDocument } from '@/database/schemas/post.schema';
import { FEEDBACK_TARGET_TYPES, type FeedbackType } from '@/forum/feedback.constants';
import {
  HOT_CANDIDATE_JOB_KINDS,
  HOT_PROJECTION_JOB_KINDS,
} from '@/hot-ranking/hot-ranking.constants';

export type HotProjectionJob =
  | { kind: typeof HOT_PROJECTION_JOB_KINDS.DISPATCH }
  | { kind: typeof HOT_PROJECTION_JOB_KINDS.EXPIRE }
  | {
      kind: typeof HOT_PROJECTION_JOB_KINDS.PROJECT_POST;
      postId: string;
      signalVersion: number;
    };

export type HotCandidateJob =
  | { kind: typeof HOT_CANDIDATE_JOB_KINDS.DISPATCH }
  | {
      kind: typeof HOT_CANDIDATE_JOB_KINDS.SYNC_POST;
      postId: string;
      candidateVersion: number;
    };

export type HotCandidateMaintenanceJob =
  | { kind: typeof HOT_CANDIDATE_JOB_KINDS.ENSURE_GENERATION }
  | {
      kind: typeof HOT_CANDIDATE_JOB_KINDS.REBUILD_BATCH;
      generationId: string;
      generationVersion: number;
    }
  | {
      kind: typeof HOT_CANDIDATE_JOB_KINDS.CLEANUP_GENERATION;
      generationId: string;
      generationVersion: number;
    };

export interface HotPostQueryOptions {
  circleId?: string;
  circleIds?: string[];
  candidateFilter?: FilterQuery<Post>;
  filterKey: string;
  limit: number;
  cursor?: string;
}

export interface HotPostPage {
  posts: PostDocument[];
  nextCursor: string | null;
}

export type HotFeedbackTarget =
  | { type: typeof FEEDBACK_TARGET_TYPES.POST; id: string }
  | { type: typeof FEEDBACK_TARGET_TYPES.REPLY; id: string };

export interface RecordFeedbackContributionInput {
  feedbackId: string;
  postId: string;
  agentId: string;
  ownerUserIdSnapshot: string;
  feedbackType: FeedbackType | null;
  sourceExists: boolean;
  activityAt: Date;
  target: HotFeedbackTarget;
}
