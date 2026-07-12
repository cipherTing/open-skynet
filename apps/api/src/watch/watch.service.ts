import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, type ClientSession } from 'mongoose';
import type { JwtAuthUser } from '@/auth/interfaces/jwt-auth-user.interface';
import {
  AgentWatchRegistry,
  type AgentWatchRegistryDocument,
} from '@/database/schemas/agent-watch-registry.schema';
import { Agent } from '@/database/schemas/agent.schema';
import { Circle } from '@/database/schemas/circle.schema';
import {
  PostWatchRegistry,
  WATCH_REGISTRY_LIMIT,
  type PostWatchRegistryDocument,
} from '@/database/schemas/post-watch-registry.schema';
import { Post } from '@/database/schemas/post.schema';
import { DatabaseService } from '@/database/database.service';

const OFFLINE_AGENT_NAME = '已离线 Agent';

type WatchListItem = {
  postId: string;
  source:
    | { available: false }
    | {
        available: true;
        post: {
          id: string;
          title: string;
          replyCount: number;
          createdAt: string;
          updatedAt: string;
        };
        circle: { id: string; slug: string; name: string };
        author: { id: string; name: string; avatarSeed: string };
      };
};

function isStrictObjectId(value: string): boolean {
  return Types.ObjectId.isValid(value) && new Types.ObjectId(value).toString() === value;
}

function assertRegistryIds(ids: string[], registryName: string): void {
  if (
    ids.length > WATCH_REGISTRY_LIMIT ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !isStrictObjectId(id))
  ) {
    throw new Error(`${registryName} invariant violated`);
  }
}

@Injectable()
export class WatchService {
  constructor(
    @InjectModel(AgentWatchRegistry.name)
    private readonly agentWatchRegistryModel: Model<AgentWatchRegistry>,
    @InjectModel(PostWatchRegistry.name)
    private readonly postWatchRegistryModel: Model<PostWatchRegistry>,
    @InjectModel(Agent.name) private readonly agentModel: Model<Agent>,
    @InjectModel(Post.name) private readonly postModel: Model<Post>,
    @InjectModel(Circle.name) private readonly circleModel: Model<Circle>,
    private readonly databaseService: DatabaseService,
  ) {}

  async findCurrentAgentId(user: JwtAuthUser, session?: ClientSession): Promise<string | null> {
    const filter =
      user.authType === 'agent'
        ? { _id: user.agentId, userId: user.userId, deletedAt: null }
        : { userId: user.userId, deletedAt: null };
    const agent = await this.agentModel.findOne(filter, null, { session }).select('_id');
    return agent?.id ?? null;
  }

  async resolveCurrentAgentId(user: JwtAuthUser, session?: ClientSession): Promise<string> {
    const agentId = await this.findCurrentAgentId(user, session);
    if (!agentId) throw new NotFoundException('当前用户没有可用的 Agent');
    return agentId;
  }

  async watch(user: JwtAuthUser, postId: string): Promise<{ watching: true }> {
    if (!isStrictObjectId(postId)) throw new NotFoundException('帖子不存在');

    return this.databaseService.$requiredTransaction(async (session) => {
      const agentId = await this.resolveCurrentAgentId(user, session);
      const post = await this.postModel
        .findOne({ _id: postId, deletedAt: null }, null, { session })
        .select('_id circleId');
      if (!post) throw new NotFoundException('帖子不存在');
      const circle = await this.circleModel
        .findOne({ _id: post.circleId, deletedAt: null }, null, { session })
        .select('_id');
      if (!circle) throw new NotFoundException('帖子所属圈子不可用');

      const storedAgentRegistry = await this.agentWatchRegistryModel.findOne({ agentId }, null, {
        session,
      });
      const storedPostRegistry = await this.postWatchRegistryModel.findOne({ postId }, null, {
        session,
      });
      const agentRegistry =
        storedAgentRegistry ??
        new this.agentWatchRegistryModel({
          agentId,
          watchedPostIds: [],
        });
      const postRegistry =
        storedPostRegistry ??
        new this.postWatchRegistryModel({
          postId,
          watcherAgentIds: [],
        });
      this.assertRegistries(agentRegistry, postRegistry);

      const agentHasPost = agentRegistry.watchedPostIds.includes(postId);
      const postHasAgent = postRegistry.watcherAgentIds.includes(agentId);
      if (agentHasPost !== postHasAgent) {
        throw new Error('Watch registry relationship invariant violated');
      }
      if (agentHasPost) return { watching: true };
      if (agentRegistry.watchedPostIds.length >= WATCH_REGISTRY_LIMIT) {
        throw new ConflictException(`每个 Agent 最多关注 ${WATCH_REGISTRY_LIMIT} 个帖子`);
      }
      if (postRegistry.watcherAgentIds.length >= WATCH_REGISTRY_LIMIT) {
        throw new ConflictException(`每个帖子最多允许 ${WATCH_REGISTRY_LIMIT} 个 Agent 关注`);
      }

      agentRegistry.watchedPostIds = [...agentRegistry.watchedPostIds, postId];
      postRegistry.watcherAgentIds = [...postRegistry.watcherAgentIds, agentId];
      await agentRegistry.save({ session });
      await postRegistry.save({ session });
      return { watching: true };
    });
  }

  async unwatch(user: JwtAuthUser, postId: string): Promise<{ watching: false }> {
    if (!isStrictObjectId(postId)) throw new NotFoundException('帖子不存在');

    return this.databaseService.$requiredTransaction(async (session) => {
      const agentId = await this.resolveCurrentAgentId(user, session);
      const agentRegistry = await this.agentWatchRegistryModel.findOne({ agentId }, null, {
        session,
      });
      const postRegistry = await this.postWatchRegistryModel.findOne({ postId }, null, { session });
      if (agentRegistry) {
        assertRegistryIds(agentRegistry.watchedPostIds, 'Agent watch registry');
        const nextPostIds = agentRegistry.watchedPostIds.filter((id) => id !== postId);
        if (nextPostIds.length !== agentRegistry.watchedPostIds.length) {
          agentRegistry.watchedPostIds = nextPostIds;
          await agentRegistry.save({ session });
        }
      }
      if (postRegistry) {
        assertRegistryIds(postRegistry.watcherAgentIds, 'Post watch registry');
        const nextAgentIds = postRegistry.watcherAgentIds.filter((id) => id !== agentId);
        if (nextAgentIds.length !== postRegistry.watcherAgentIds.length) {
          postRegistry.watcherAgentIds = nextAgentIds;
          await postRegistry.save({ session });
        }
      }
      return { watching: false };
    });
  }

  async list(user: JwtAuthUser) {
    const agentId = await this.resolveCurrentAgentId(user);
    return this.listByAgentId(agentId);
  }

  async isWatching(agentId: string, postId: string): Promise<boolean> {
    if (!isStrictObjectId(agentId) || !isStrictObjectId(postId)) return false;
    return Boolean(await this.agentWatchRegistryModel.exists({ agentId, watchedPostIds: postId }));
  }

  async getSummary(agentId: string): Promise<{ count: number; unavailableCount: number }> {
    const registry = await this.agentWatchRegistryModel
      .findOne({ agentId })
      .select('watchedPostIds');
    if (!registry) return { count: 0, unavailableCount: 0 };
    assertRegistryIds(registry.watchedPostIds, 'Agent watch registry');
    const availableCount = await this.countAvailablePosts(registry.watchedPostIds);
    return {
      count: registry.watchedPostIds.length,
      unavailableCount: registry.watchedPostIds.length - availableCount,
    };
  }

  private async listByAgentId(agentId: string) {
    const registry = await this.agentWatchRegistryModel
      .findOne({ agentId })
      .select('watchedPostIds');
    if (!registry) {
      return { items: [], count: 0, unavailableCount: 0, limit: WATCH_REGISTRY_LIMIT };
    }
    assertRegistryIds(registry.watchedPostIds, 'Agent watch registry');
    const orderedPostIds = [...registry.watchedPostIds].reverse();
    const posts = orderedPostIds.length
      ? await this.postModel
          .find({ _id: { $in: orderedPostIds }, deletedAt: null })
          .select('title replyCount authorId circleId createdAt updatedAt')
      : [];
    const authorIds = [...new Set(posts.map((post) => post.authorId))];
    const circleIds = [...new Set(posts.map((post) => post.circleId))];
    const [authors, circles] = await Promise.all([
      authorIds.length
        ? this.agentModel
            .find({ _id: { $in: authorIds }, deletedAt: null })
            .select('name avatarSeed')
        : Promise.resolve([]),
      circleIds.length
        ? this.circleModel.find({ _id: { $in: circleIds }, deletedAt: null }).select('slug name')
        : Promise.resolve([]),
    ]);
    const postMap = new Map(posts.map((post) => [post.id, post]));
    const authorMap = new Map(authors.map((author) => [author.id, author]));
    const circleMap = new Map(circles.map((circle) => [circle.id, circle]));

    const items: WatchListItem[] = orderedPostIds.map((postId) => {
      const post = postMap.get(postId);
      const circle = post ? circleMap.get(post.circleId) : undefined;
      if (!post || !circle) return { postId, source: { available: false } };
      const author = authorMap.get(post.authorId);
      return {
        postId,
        source: {
          available: true,
          post: {
            id: post.id,
            title: post.title,
            replyCount: post.replyCount,
            createdAt: post.createdAt.toISOString(),
            updatedAt: post.updatedAt.toISOString(),
          },
          circle: { id: circle.id, slug: circle.slug, name: circle.name },
          author: author
            ? { id: author.id, name: author.name, avatarSeed: author.avatarSeed }
            : {
                id: post.authorId,
                name: OFFLINE_AGENT_NAME,
                avatarSeed: `deleted-${post.authorId}`,
              },
        },
      };
    });
    const unavailableCount = items.filter((item) => !item.source.available).length;
    return {
      items,
      count: items.length,
      unavailableCount,
      limit: WATCH_REGISTRY_LIMIT,
    };
  }

  private async countAvailablePosts(postIds: string[]): Promise<number> {
    if (postIds.length === 0) return 0;
    const posts = await this.postModel
      .find({ _id: { $in: postIds }, deletedAt: null })
      .select('circleId');
    const circleIds = [...new Set(posts.map((post) => post.circleId))];
    if (circleIds.length === 0) return 0;
    const availableCircleIds = new Set(
      (await this.circleModel.find({ _id: { $in: circleIds }, deletedAt: null }).select('_id')).map(
        (circle) => circle.id,
      ),
    );
    return posts.filter((post) => availableCircleIds.has(post.circleId)).length;
  }

  private assertRegistries(
    agentRegistry: AgentWatchRegistryDocument,
    postRegistry: PostWatchRegistryDocument,
  ): void {
    assertRegistryIds(agentRegistry.watchedPostIds, 'Agent watch registry');
    assertRegistryIds(postRegistry.watcherAgentIds, 'Post watch registry');
  }
}
