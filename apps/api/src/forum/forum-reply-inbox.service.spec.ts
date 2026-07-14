import { getConnectionToken, getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { Connection, Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import {
  AgentNotification,
  AgentNotificationSchema,
} from '@/database/schemas/agent-notification.schema';
import { Agent, AgentSchema } from '@/database/schemas/agent.schema';
import {
  AgentProgress,
  AgentProgressSchema,
} from '@/database/schemas/agent-progress.schema';
import {
  AgentXpEvent,
  AgentXpEventSchema,
} from '@/database/schemas/agent-xp-event.schema';
import { AgentGovernanceProfile } from '@/database/schemas/agent-governance-profile.schema';
import { Circle, CircleSchema } from '@/database/schemas/circle.schema';
import {
  CircleProposal,
  CircleProposalSchema,
} from '@/database/schemas/circle-proposal.schema';
import {
  ContentReviewRequest,
  ContentReviewRequestSchema,
} from '@/database/schemas/content-review-request.schema';
import { Feedback } from '@/database/schemas/feedback.schema';
import { InteractionHistory } from '@/database/schemas/interaction-history.schema';
import { Post, PostSchema } from '@/database/schemas/post.schema';
import { PostFavorite } from '@/database/schemas/post-favorite.schema';
import { Reply, ReplySchema } from '@/database/schemas/reply.schema';
import { GovernanceCase } from '@/database/schemas/governance-case.schema';
import {
  PostWatchRegistry,
  PostWatchRegistrySchema,
} from '@/database/schemas/post-watch-registry.schema';
import { ViewHistory } from '@/database/schemas/view-history.schema';
import { DatabaseService } from '@/database/database.service';
import { CircleService } from '@/circle/circle.service';
import { ProgressionService } from '@/progression/progression.service';
import { RedisService } from '@/redis/redis.service';
import { FeatureFlagService } from '@/system/feature-flag.service';
import { InboxService } from '@/inbox/inbox.service';
import { ForumService } from './forum.service';

describe('ForumService reply inbox transaction', () => {
  jest.setTimeout(60_000);
  let replicaSet: MongoMemoryReplSet;
  let moduleRef: TestingModule;
  let connection: Connection;
  let forumService: ForumService;

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(replicaSet.getUri()),
        MongooseModule.forFeature([
          { name: AgentNotification.name, schema: AgentNotificationSchema },
          { name: Agent.name, schema: AgentSchema },
          { name: AgentProgress.name, schema: AgentProgressSchema },
          { name: AgentXpEvent.name, schema: AgentXpEventSchema },
          { name: Circle.name, schema: CircleSchema },
          { name: CircleProposal.name, schema: CircleProposalSchema },
          { name: ContentReviewRequest.name, schema: ContentReviewRequestSchema },
          { name: Post.name, schema: PostSchema },
          { name: Reply.name, schema: ReplySchema },
          { name: PostWatchRegistry.name, schema: PostWatchRegistrySchema },
        ]),
      ],
      providers: [
        DatabaseService,
        ProgressionService,
        InboxService,
        ForumService,
        {
          provide: CircleService,
          useValue: { ensureCircleExists: jest.fn().mockResolvedValue({ rulesVersion: 1 }) },
        },
        { provide: FeatureFlagService, useValue: { assertEnabled: jest.fn() } },
        { provide: RedisService, useValue: {} },
        { provide: getModelToken(GovernanceCase.name), useValue: {} },
        { provide: getModelToken(AgentGovernanceProfile.name), useValue: {} },
        { provide: getModelToken(Feedback.name), useValue: {} },
        { provide: getModelToken(PostFavorite.name), useValue: {} },
        { provide: getModelToken(ViewHistory.name), useValue: {} },
        { provide: getModelToken(InteractionHistory.name), useValue: {} },
      ],
    }).compile();
    connection = moduleRef.get<Connection>(getConnectionToken());
    forumService = moduleRef.get(ForumService);
  });

  afterAll(async () => {
    await moduleRef.close();
    await replicaSet.stop();
  });

  it('rolls back reply, counter, progression, and notifications together', async () => {
    const [actor, postAuthor] = await Promise.all([
      connection.model(Agent.name).create({
        name: 'transaction-actor',
        description: 'actor',
        avatarSeed: 'transaction-actor-avatar',
        userId: 'transaction-actor-user',
      }),
      connection.model(Agent.name).create({
        name: 'transaction-author',
        description: 'author',
        avatarSeed: 'transaction-author-avatar',
        userId: 'transaction-author-user',
      }),
    ]);
    const post = await connection.model(Post.name).create({
      title: 'transaction post',
      content: 'transaction content',
      authorId: postAuthor.id,
      circleId: new Types.ObjectId().toString(),
      circleRulesVersion: 1,
    });
    const missingMentionId = new Types.ObjectId().toString();

    await expect(
      forumService.createReply(actor.id, post.id, {
        content: `must roll back @{${missingMentionId}}`,
      }),
    ).rejects.toThrow('提及的 Agent 不存在或已离线');

    const unchangedPost = await connection.model(Post.name).findById(post.id);
    expect(unchangedPost?.replyCount).toBe(0);
    expect(await connection.model(Reply.name).countDocuments()).toBe(0);
    expect(await connection.model(AgentNotification.name).countDocuments()).toBe(0);
    expect(await connection.model(AgentProgress.name).countDocuments()).toBe(0);
    expect(await connection.model(AgentXpEvent.name).countDocuments()).toBe(0);
  });

  it('rolls back the full reply transaction when a watch registry exceeds its invariant', async () => {
    const [actor, postAuthor] = await Promise.all([
      connection.model(Agent.name).create({
        name: 'watch-invariant-actor',
        description: 'actor',
        avatarSeed: 'watch-invariant-actor-avatar',
        userId: 'watch-invariant-actor-user',
      }),
      connection.model(Agent.name).create({
        name: 'watch-invariant-author',
        description: 'author',
        avatarSeed: 'watch-invariant-author-avatar',
        userId: 'watch-invariant-author-user',
      }),
    ]);
    const post = await connection.model(Post.name).create({
      title: 'watch invariant post',
      content: 'watch invariant content',
      authorId: postAuthor.id,
      circleId: new Types.ObjectId().toString(),
      circleRulesVersion: 1,
    });
    await connection.collection('post_watch_registries').insertOne({
      postId: post.id,
      watcherAgentIds: Array.from(
        { length: 101 },
        () => new Types.ObjectId().toString(),
      ),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(
      forumService.createReply(actor.id, post.id, { content: 'must roll back completely' }),
    ).rejects.toThrow('Post watch registry invariant violated');

    const unchangedPost = await connection.model(Post.name).findById(post.id);
    expect(unchangedPost?.replyCount).toBe(0);
    expect(await connection.model(Reply.name).countDocuments()).toBe(0);
    expect(await connection.model(AgentNotification.name).countDocuments()).toBe(0);
    expect(await connection.model(AgentProgress.name).countDocuments()).toBe(0);
    expect(await connection.model(AgentXpEvent.name).countDocuments()).toBe(0);
  });
});
