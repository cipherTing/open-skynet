import { NotFoundException } from '@nestjs/common';
import { getConnectionToken, MongooseModule } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { Connection, Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import type { JwtAgentAuthUser, JwtAuthUser } from '@/auth/interfaces/jwt-auth-user.interface';
import {
  AgentWatchRegistry,
  AgentWatchRegistrySchema,
} from '@/database/schemas/agent-watch-registry.schema';
import { Agent, AgentSchema } from '@/database/schemas/agent.schema';
import { Circle, CircleSchema } from '@/database/schemas/circle.schema';
import {
  PostWatchRegistry,
  PostWatchRegistrySchema,
} from '@/database/schemas/post-watch-registry.schema';
import { Post, PostSchema } from '@/database/schemas/post.schema';
import { DatabaseService } from '@/database/database.service';
import { WatchService } from './watch.service';

describe('WatchService integration', () => {
  jest.setTimeout(60_000);
  let replicaSet: MongoMemoryReplSet;
  let moduleRef: TestingModule;
  let connection: Connection;
  let watchService: WatchService;
  let failNextPostRegistrySave = false;

  beforeAll(async () => {
    const testPostWatchRegistrySchema = PostWatchRegistrySchema.clone();
    testPostWatchRegistrySchema.pre('save', function rejectRequestedSave() {
      if (!failNextPostRegistrySave) return;
      failNextPostRegistrySave = false;
      throw new Error('forced post registry failure');
    });
    replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(replicaSet.getUri()),
        MongooseModule.forFeature([
          { name: AgentWatchRegistry.name, schema: AgentWatchRegistrySchema },
          { name: PostWatchRegistry.name, schema: testPostWatchRegistrySchema },
          { name: Agent.name, schema: AgentSchema },
          { name: Post.name, schema: PostSchema },
          { name: Circle.name, schema: CircleSchema },
        ]),
      ],
      providers: [DatabaseService, WatchService],
    }).compile();
    connection = moduleRef.get<Connection>(getConnectionToken());
    watchService = moduleRef.get(WatchService);
  });

  beforeEach(async () => {
    failNextPostRegistrySave = false;
    await Promise.all([
      connection.model(AgentWatchRegistry.name).deleteMany({}),
      connection.model(PostWatchRegistry.name).deleteMany({}),
      connection.model(Post.name).deleteMany({}),
      connection.model(Circle.name).deleteMany({}),
      connection.model(Agent.name).deleteMany({}),
    ]);
  });

  afterAll(async () => {
    await moduleRef.close();
    await replicaSet.stop();
  });

  async function createAgent(label: string) {
    return connection.model(Agent.name).create({
      name: label,
      description: `${label} description`,
      avatarSeed: `${label}-avatar`,
      userId: `${label}-user`,
    });
  }

  async function createCircle(label: string) {
    return connection.model(Circle.name).create({
      slug: label,
      name: `${label} circle`,
      normalizedName: `${label} circle`,
      topic: `${label} topic`,
      createdByType: 'SYSTEM',
      rules: [],
      rulesVersion: 1,
      maintenanceVersion: 1,
      pinnedPostIds: [],
    });
  }

  async function createPost(authorId: string, circleId: string, label: string) {
    return connection.model(Post.name).create({
      title: `${label} title`,
      content: `${label} content`,
      authorId,
      circleId,
      circleRulesVersion: 1,
    });
  }

  function asAgentUser(agent: { id: string; name: string; userId: string }): JwtAgentAuthUser {
    return {
      authType: 'agent',
      agentId: agent.id,
      userId: agent.userId,
      username: agent.name,
      role: 'USER',
      dbTokenVersion: 0,
      payloadTokenVersion: 0,
    };
  }

  function asBrowserUser(agent: { name: string; userId: string }): JwtAuthUser {
    return {
      authType: 'jwt',
      userId: agent.userId,
      username: agent.name,
      role: 'USER',
      dbTokenVersion: 0,
      payloadTokenVersion: 0,
    };
  }

  it('keeps repeated and concurrent watches idempotent in both registries', async () => {
    const [agent, author] = await Promise.all([
      createAgent('concurrent-watcher'),
      createAgent('concurrent-author'),
    ]);
    const circle = await createCircle('concurrent');
    const [firstPost, secondPost] = await Promise.all([
      createPost(author.id, circle.id, 'first'),
      createPost(author.id, circle.id, 'second'),
    ]);
    const user = asAgentUser(agent);

    await Promise.all(Array.from({ length: 4 }, () => watchService.watch(user, firstPost.id)));
    await watchService.watch(user, secondPost.id);
    await watchService.watch(user, firstPost.id);

    const [agentRegistry, firstPostRegistry, list] = await Promise.all([
      connection.model(AgentWatchRegistry.name).findOne({ agentId: agent.id }),
      connection.model(PostWatchRegistry.name).findOne({ postId: firstPost.id }),
      watchService.list(user),
    ]);
    expect(agentRegistry?.watchedPostIds).toEqual([firstPost.id, secondPost.id]);
    expect(firstPostRegistry?.watcherAgentIds).toEqual([agent.id]);
    expect(list.items.map((item) => item.postId)).toEqual([secondPost.id, firstPost.id]);
    expect(list.items.every((item) => item.source.available)).toBe(true);
    expect(await watchService.isWatching(agent.id, firstPost.id)).toBe(true);
    await expect(watchService.getSummary(agent.id)).resolves.toEqual({
      count: 2,
      unavailableCount: 0,
    });
  });

  it('preserves every relationship when shared registry arrays are updated concurrently', async () => {
    const [firstAgent, secondAgent, author] = await Promise.all([
      createAgent('shared-array-first'),
      createAgent('shared-array-second'),
      createAgent('shared-array-author'),
    ]);
    const circle = await createCircle('shared-array');
    const [firstPost, secondPost, sharedPost] = await Promise.all([
      createPost(author.id, circle.id, 'shared-array-first'),
      createPost(author.id, circle.id, 'shared-array-second'),
      createPost(author.id, circle.id, 'shared-array-shared'),
    ]);

    await Promise.all([
      watchService.watch(asAgentUser(firstAgent), firstPost.id),
      watchService.watch(asAgentUser(firstAgent), secondPost.id),
    ]);
    await Promise.all([
      watchService.watch(asAgentUser(firstAgent), sharedPost.id),
      watchService.watch(asAgentUser(secondAgent), sharedPost.id),
    ]);

    const [firstRegistry, secondRegistry, sharedRegistry] = await Promise.all([
      connection.model(AgentWatchRegistry.name).findOne({ agentId: firstAgent.id }),
      connection.model(AgentWatchRegistry.name).findOne({ agentId: secondAgent.id }),
      connection.model(PostWatchRegistry.name).findOne({ postId: sharedPost.id }),
    ]);
    expect(new Set(firstRegistry?.watchedPostIds)).toEqual(
      new Set([firstPost.id, secondPost.id, sharedPost.id]),
    );
    expect(secondRegistry?.watchedPostIds).toEqual([sharedPost.id]);
    expect(new Set(sharedRegistry?.watcherAgentIds)).toEqual(
      new Set([firstAgent.id, secondAgent.id]),
    );
    for (const postId of [firstPost.id, secondPost.id]) {
      expect(
        (await connection.model(PostWatchRegistry.name).findOne({ postId }))?.watcherAgentIds,
      ).toEqual([firstAgent.id]);
    }
  });

  it('enforces the 100 item limit on both sides without truncation', async () => {
    const [agent, author] = await Promise.all([
      createAgent('agent-limit-watcher'),
      createAgent('agent-limit-author'),
    ]);
    const circle = await createCircle('agent-limit');
    const [hundredthPost, overflowPost] = await Promise.all([
      createPost(author.id, circle.id, 'agent-limit-100'),
      createPost(author.id, circle.id, 'agent-limit-101'),
    ]);
    const firstNinetyNinePostIds = Array.from({ length: 99 }, () =>
      new Types.ObjectId().toString(),
    );
    await connection.model(AgentWatchRegistry.name).create({
      agentId: agent.id,
      watchedPostIds: firstNinetyNinePostIds,
    });
    await connection.model(PostWatchRegistry.name).insertMany(
      firstNinetyNinePostIds.map((postId) => ({
        postId,
        watcherAgentIds: [agent.id],
      })),
    );
    const user = asAgentUser(agent);
    const agentLimitResults = await Promise.allSettled([
      watchService.watch(user, hundredthPost.id),
      watchService.watch(user, overflowPost.id),
    ]);
    expect(agentLimitResults.map((result) => result.status).sort()).toEqual([
      'fulfilled',
      'rejected',
    ]);
    const fullAgentRegistry = await connection
      .model(AgentWatchRegistry.name)
      .findOne({ agentId: agent.id });
    expect(fullAgentRegistry?.watchedPostIds).toHaveLength(100);
    expect(
      [hundredthPost.id, overflowPost.id].filter((postId) =>
        fullAgentRegistry?.watchedPostIds.includes(postId),
      ),
    ).toHaveLength(1);

    const sharedPost = await createPost(author.id, circle.id, 'post-limit');
    const existingWatcherIds = Array.from({ length: 99 }, () => new Types.ObjectId().toString());
    await connection.model(PostWatchRegistry.name).create({
      postId: sharedPost.id,
      watcherAgentIds: existingWatcherIds,
    });
    await connection.model(AgentWatchRegistry.name).insertMany(
      existingWatcherIds.map((agentId) => ({
        agentId,
        watchedPostIds: [sharedPost.id],
      })),
    );
    const [hundredthAgent, overflowAgent] = await Promise.all([
      createAgent('post-limit-100'),
      createAgent('post-limit-101'),
    ]);
    const postLimitResults = await Promise.allSettled([
      watchService.watch(asAgentUser(hundredthAgent), sharedPost.id),
      watchService.watch(asAgentUser(overflowAgent), sharedPost.id),
    ]);
    expect(postLimitResults.map((result) => result.status).sort()).toEqual([
      'fulfilled',
      'rejected',
    ]);
    const fullPostRegistry = await connection
      .model(PostWatchRegistry.name)
      .findOne({ postId: sharedPost.id });
    expect(fullPostRegistry?.watcherAgentIds).toHaveLength(100);
    expect(
      [hundredthAgent.id, overflowAgent.id].filter((agentId) =>
        fullPostRegistry?.watcherAgentIds.includes(agentId),
      ),
    ).toHaveLength(1);
  });

  it('keeps removed posts unavailable, restores them, and allows explicit unwatch', async () => {
    const [agent, author] = await Promise.all([
      createAgent('removed-watcher'),
      createAgent('removed-author'),
    ]);
    const circle = await createCircle('removed');
    const post = await createPost(author.id, circle.id, 'removed');
    const user = asAgentUser(agent);
    await watchService.watch(user, post.id);

    await connection.model(Post.name).findByIdAndUpdate(post.id, { deletedAt: new Date() });
    const unavailable = await watchService.list(user);
    expect(unavailable.items).toEqual([{ postId: post.id, source: { available: false } }]);
    await expect(watchService.getSummary(agent.id)).resolves.toEqual({
      count: 1,
      unavailableCount: 1,
    });

    await connection
      .model(Post.name)
      .findOneAndUpdate({ _id: post.id, deletedAt: { $ne: null } }, { $set: { deletedAt: null } });
    expect((await watchService.list(user)).items[0]?.source.available).toBe(true);
    await connection.model(Circle.name).findByIdAndUpdate(circle.id, { deletedAt: new Date() });
    await expect(watchService.watch(user, post.id)).rejects.toThrow('帖子所属圈子不可用');
    expect((await watchService.list(user)).items[0]?.source.available).toBe(false);
    await connection
      .model(Circle.name)
      .findOneAndUpdate(
        { _id: circle.id, deletedAt: { $ne: null } },
        { $set: { deletedAt: null } },
      );
    expect((await watchService.list(user)).items[0]?.source.available).toBe(true);
    await connection.model(Post.name).findByIdAndUpdate(post.id, { deletedAt: new Date() });
    await expect(watchService.unwatch(user, post.id)).resolves.toEqual({ watching: false });
    await expect(watchService.unwatch(user, post.id)).resolves.toEqual({ watching: false });
    expect((await watchService.list(user)).items).toHaveLength(0);
    expect(
      (await connection.model(PostWatchRegistry.name).findOne({ postId: post.id }))
        ?.watcherAgentIds,
    ).toEqual([]);
  });

  it('rolls back the agent registry if the post registry write fails', async () => {
    const [agent, author] = await Promise.all([
      createAgent('rollback-watcher'),
      createAgent('rollback-author'),
    ]);
    const circle = await createCircle('rollback');
    const post = await createPost(author.id, circle.id, 'rollback');
    failNextPostRegistrySave = true;

    await expect(watchService.watch(asAgentUser(agent), post.id)).rejects.toThrow(
      'forced post registry failure',
    );
    expect(
      await connection.model(AgentWatchRegistry.name).countDocuments({ agentId: agent.id }),
    ).toBe(0);
    expect(await connection.model(PostWatchRegistry.name).countDocuments({ postId: post.id })).toBe(
      0,
    );

    await watchService.watch(asAgentUser(agent), post.id);
    failNextPostRegistrySave = true;
    await expect(watchService.unwatch(asAgentUser(agent), post.id)).rejects.toThrow(
      'forced post registry failure',
    );
    expect(
      (await connection.model(AgentWatchRegistry.name).findOne({ agentId: agent.id }))
        ?.watchedPostIds,
    ).toEqual([post.id]);
    expect(
      (await connection.model(PostWatchRegistry.name).findOne({ postId: post.id }))
        ?.watcherAgentIds,
    ).toEqual([agent.id]);
  });

  it('derives the private identity from authentication and rejects cross-identity access', async () => {
    const [firstAgent, secondAgent, author] = await Promise.all([
      createAgent('identity-first'),
      createAgent('identity-second'),
      createAgent('identity-author'),
    ]);
    const circle = await createCircle('identity');
    const post = await createPost(author.id, circle.id, 'identity');
    await watchService.watch(asBrowserUser(firstAgent), post.id);

    await expect(watchService.list(asBrowserUser(firstAgent))).resolves.toMatchObject({
      count: 1,
    });
    await expect(watchService.list(asBrowserUser(secondAgent))).resolves.toMatchObject({
      count: 0,
    });
    const forgedUser: JwtAuthUser = {
      ...asAgentUser(firstAgent),
      agentId: secondAgent.id,
    };
    await expect(watchService.list(forgedUser)).rejects.toBeInstanceOf(NotFoundException);
    await expect(watchService.watch(forgedUser, post.id)).rejects.toBeInstanceOf(NotFoundException);
    expect(await watchService.isWatching(secondAgent.id, post.id)).toBe(false);
  });
});
