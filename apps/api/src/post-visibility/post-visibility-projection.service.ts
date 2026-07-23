import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CirclePostVisibilityState } from '@/database/schemas/circle-post-visibility-state.schema';
import { PostHotState } from '@/database/schemas/post-hot-state.schema';
import { Post } from '@/database/schemas/post.schema';
import { DatabaseService } from '@/database/database.service';
import { POST_VISIBILITY_POST_BATCH_SIZE } from '@/post-visibility/post-visibility.constants';

@Injectable()
export class PostVisibilityProjectionService {
  constructor(
    @InjectModel(CirclePostVisibilityState.name)
    private readonly stateModel: Model<CirclePostVisibilityState>,
    @InjectModel(Post.name) private readonly postModel: Model<Post>,
    @InjectModel(PostHotState.name) private readonly hotStateModel: Model<PostHotState>,
    private readonly databaseService: DatabaseService,
  ) {}

  async projectCircleBatch(input: {
    circleId: string;
    visibilityVersion: number;
    postWriteVersion: number;
    claimToken: string;
  }): Promise<void> {
    await this.databaseService.$transaction(async (session) => {
      const state = await this.stateModel.findOne(
        {
          circleId: input.circleId,
          dirty: true,
          visibilityVersion: input.visibilityVersion,
          postWriteVersion: input.postWriteVersion,
          claimToken: input.claimToken,
          claimedUntil: { $gt: new Date() },
        },
        null,
        { session },
      );
      if (!state) return;

      const posts = await this.postModel
        .find(
          {
            circleId: input.circleId,
            circleVisibilityVersion: { $lt: input.visibilityVersion },
          },
          '_id',
          { session },
        )
        .sort({ circleVisibilityVersion: 1, _id: 1 })
        .limit(POST_VISIBILITY_POST_BATCH_SIZE)
        .lean<Array<{ _id: Types.ObjectId }>>();
      const postIds = posts.map((post) => post._id);
      const stringPostIds = postIds.map((postId) => postId.toString());

      if (postIds.length > 0) {
        const hotStateCount = await this.hotStateModel.countDocuments(
          { postId: { $in: stringPostIds } },
          { session },
        );
        if (hotStateCount !== postIds.length) {
          throw new Error(`圈子帖子可见性投影缺少热度状态: ${input.circleId}`);
        }

        const postUpdate = await this.postModel.updateMany(
          {
            _id: { $in: postIds },
            circleId: input.circleId,
            circleVisibilityVersion: { $lt: input.visibilityVersion },
          },
          {
            $set: {
              circleVisible: state.desiredVisible,
              circleVisibilityVersion: input.visibilityVersion,
            },
          },
          { session },
        );
        if (postUpdate.matchedCount !== postIds.length) {
          throw new Error(`圈子帖子可见性投影发生并发变化: ${input.circleId}`);
        }

        await this.hotStateModel.updateMany(
          {
            postId: { $in: stringPostIds },
            circleVisibilityVersion: { $lt: input.visibilityVersion },
          },
          {
            $set: {
              circleVisible: state.desiredVisible,
              circleVisibilityVersion: input.visibilityVersion,
              projectionDirty: true,
              projectionDispatchAt: null,
              projectionClaimedUntil: null,
              projectionDispatchAttempts: 0,
            },
            $inc: { signalVersion: 1 },
          },
          { session },
        );
      }

      if (posts.length === POST_VISIBILITY_POST_BATCH_SIZE) {
        const released = await this.stateModel.updateOne(
          {
            _id: state._id,
            visibilityVersion: input.visibilityVersion,
            postWriteVersion: input.postWriteVersion,
            claimToken: input.claimToken,
          },
          {
            $set: {
              dispatchAt: new Date(),
              claimToken: null,
              claimedUntil: null,
            },
          },
          { session },
        );
        if (released.matchedCount !== 1) {
          throw new Error(`圈子帖子可见性批次释放失败: ${input.circleId}`);
        }
        return;
      }

      const finalized = await this.stateModel.updateOne(
        {
          _id: state._id,
          visibilityVersion: input.visibilityVersion,
          postWriteVersion: input.postWriteVersion,
          claimToken: input.claimToken,
        },
        {
          $set: {
            processedVisibilityVersion: input.visibilityVersion,
            processedPostWriteVersion: input.postWriteVersion,
            dirty: false,
            dispatchAt: null,
            claimToken: null,
            claimedUntil: null,
            dispatchAttempts: 0,
          },
        },
        { session },
      );
      if (finalized.matchedCount !== 1) {
        throw new Error(`圈子帖子可见性投影完成状态发生并发变化: ${input.circleId}`);
      }
    });
  }
}
