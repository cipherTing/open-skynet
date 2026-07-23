import { randomInt } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, type ClientSession } from 'mongoose';
import {
  POST_VIEW_COUNTER_SHARD_COUNT,
  PostViewCounterShard,
} from '@/database/schemas/post-view-counter-shard.schema';

interface PostViewCountSource {
  id: string;
  viewCount: number;
}

interface PostViewCountAggregate {
  _id: string;
  count: number;
}

@Injectable()
export class PostViewCounterService {
  constructor(
    @InjectModel(PostViewCounterShard.name)
    private readonly counterModel: Model<PostViewCounterShard>,
  ) {}

  async increment(postId: string, session?: ClientSession): Promise<void> {
    const shard = randomInt(POST_VIEW_COUNTER_SHARD_COUNT);
    await this.counterModel.updateOne(
      { postId, shard },
      { $inc: { count: 1 } },
      { upsert: true, session, timestamps: false },
    );
  }

  async getViewCounts<T extends PostViewCountSource>(
    posts: readonly T[],
    session?: ClientSession,
  ): Promise<Map<string, number>> {
    if (posts.length === 0) return new Map();
    const uniquePosts = new Map(posts.map((post) => [post.id, post]));
    const pipeline = this.counterModel.aggregate<PostViewCountAggregate>([
      { $match: { postId: { $in: [...uniquePosts.keys()] } } },
      { $group: { _id: '$postId', count: { $sum: '$count' } } },
    ]);
    if (session) pipeline.session(session);
    const deltas = await pipeline.exec();
    const deltaByPostId = new Map(deltas.map((item) => [item._id, item.count]));
    return new Map(
      [...uniquePosts.entries()].map(([postId, post]) => [
        postId,
        post.viewCount + (deltaByPostId.get(postId) ?? 0),
      ]),
    );
  }

  async getViewCount(post: PostViewCountSource, session?: ClientSession): Promise<number> {
    const counts = await this.getViewCounts([post], session);
    const count = counts.get(post.id);
    if (count === undefined) throw new Error(`帖子浏览量汇总缺失: ${post.id}`);
    return count;
  }
}
