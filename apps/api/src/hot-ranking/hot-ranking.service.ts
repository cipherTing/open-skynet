import { Injectable } from '@nestjs/common';
import type { ClientSession, FilterQuery } from 'mongoose';
import type { Post } from '@/database/schemas/post.schema';
import { HotRankingQueryService } from '@/hot-ranking/hot-ranking-query.service';
import { HotRankingWorkService } from '@/hot-ranking/hot-ranking-work.service';
import type {
  HotPostPage,
  HotPostQueryOptions,
  RecordFeedbackContributionInput,
} from '@/hot-ranking/hot-ranking.types';
import { MAX_CIRCLE_HOT_POSTS } from '@/hot-ranking/hot-ranking.constants';

@Injectable()
export class HotRankingService {
  constructor(
    private readonly workService: HotRankingWorkService,
    private readonly queryService: HotRankingQueryService,
  ) {}

  initializePost(postId: string, session: ClientSession): Promise<void> {
    return this.workService.initializePost(postId, session);
  }

  recordPostVisibilityChanged(postId: string, session: ClientSession): Promise<void> {
    return this.workService.recordPostVisibilityChanged(postId, session);
  }

  recordReplyCreated(replyId: string, session: ClientSession): Promise<void> {
    return this.workService.recordReplyCreated(replyId, session);
  }

  recordReplyVisibilityChanged(replyId: string, session: ClientSession): Promise<void> {
    return this.workService.recordReplyVisibilityChanged(replyId, session);
  }

  recordFeedbackContribution(
    input: RecordFeedbackContributionInput,
    session: ClientSession,
  ): Promise<void> {
    return this.workService.recordFeedbackContribution(input, session);
  }

  listRandomHotPosts(where: FilterQuery<Post>, options: HotPostQueryOptions): Promise<HotPostPage> {
    return this.queryService.listRandomHotPosts(where, options);
  }

  getCircleHotPosts(
    circleId: string,
    limit = MAX_CIRCLE_HOT_POSTS,
  ): Promise<Array<{ id: string; title: string; createdAt: string }>> {
    return this.queryService
      .getCirclesHotPosts([circleId], limit)
      .then((result) => result.get(circleId) ?? []);
  }

  getCirclesHotPosts(
    circleIds: string[],
    limit = MAX_CIRCLE_HOT_POSTS,
  ): Promise<Map<string, Array<{ id: string; title: string; createdAt: string }>>> {
    return this.queryService.getCirclesHotPosts(circleIds, limit);
  }

  getHotPostIds(postIds: string[]): Promise<Set<string>> {
    return this.queryService.getHotPostIds(postIds);
  }
}
