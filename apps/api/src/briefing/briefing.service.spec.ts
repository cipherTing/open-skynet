import { getConnectionToken, MongooseModule } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { Connection, Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Agent, AgentSchema } from '@/database/schemas/agent.schema';
import { Circle, CircleSchema } from '@/database/schemas/circle.schema';
import {
  CircleSubscription,
  CircleSubscriptionSchema,
} from '@/database/schemas/circle-subscription.schema';
import { Post, PostSchema } from '@/database/schemas/post.schema';
import { InboxService } from '@/inbox/inbox.service';
import { ProgressionService } from '@/progression/progression.service';
import { AnnouncementService } from '@/system/announcement.service';
import { WatchService } from '@/watch/watch.service';
import { BriefingService } from './briefing.service';

describe('BriefingService', () => {
  jest.setTimeout(60_000);
  let mongod: MongoMemoryServer;
  let moduleRef: TestingModule;
  let connection: Connection;
  let service: BriefingService;
  const inboxService = {
    list: jest.fn().mockResolvedValue({ items: [], unreadCount: 0, nextCursor: null }),
  };
  const progressionService = {
    getCurrentAgentProgression: jest.fn().mockResolvedValue({
      level: {
        level: 2,
        name: 'Relay',
        xpTotal: 500,
        currentLevelMinXp: 400,
        nextLevelXp: 1500,
        progressToNextLevel: 0.09,
        unlocks: [],
      },
      stamina: {
        current: 80,
        max: 112,
        dailyRecovery: 40,
        recoveryPerHour: 1.67,
        nextPointAt: null,
        secondsUntilFull: 100,
        settledAt: '2026-07-12T00:00:00.000Z',
      },
      dailyTasks: {
        remainingCount: 3,
        totalCount: 3,
        resetAt: '2026-07-13T00:00:00.000Z',
        items: [{ id: 'must-not-leak' }],
      },
    }),
  };
  const announcementService = {
    listActive: jest.fn().mockResolvedValue([
      {
        id: 'announcement-1',
        title: '系统维护',
        body: '维护期间服务可能短暂不可用。',
      },
    ]),
  };
  const watchService = {
    getSummary: jest.fn().mockResolvedValue({ count: 2, unavailableCount: 1 }),
  };

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([
          { name: Agent.name, schema: AgentSchema },
          { name: Circle.name, schema: CircleSchema },
          { name: CircleSubscription.name, schema: CircleSubscriptionSchema },
          { name: Post.name, schema: PostSchema },
        ]),
      ],
      providers: [
        BriefingService,
        { provide: InboxService, useValue: inboxService },
        { provide: ProgressionService, useValue: progressionService },
        { provide: AnnouncementService, useValue: announcementService },
        { provide: WatchService, useValue: watchService },
      ],
    }).compile();
    connection = moduleRef.get<Connection>(getConnectionToken());
    service = moduleRef.get(BriefingService);
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await Promise.all([
      connection.model(Post.name).deleteMany({}),
      connection.model(CircleSubscription.name).deleteMany({}),
      connection.model(Circle.name).deleteMany({}),
      connection.model(Agent.name).deleteMany({}),
    ]);
  });

  afterAll(async () => {
    await moduleRef.close();
    await mongod.stop();
  });

  it('returns bounded summaries and excludes daily task prompts', async () => {
    const [currentAgent, author] = await Promise.all([
      connection.model(Agent.name).create({
        name: 'briefing-current',
        description: '',
        userId: 'briefing-current-user',
      }),
      connection.model(Agent.name).create({
        name: 'briefing-author',
        description: '',
        userId: 'briefing-author-user',
      }),
    ]);
    const [subscribedCircle, otherCircle] = await Promise.all([
      createCircle('briefing-subscribed'),
      createCircle('briefing-other'),
    ]);
    await connection.model(CircleSubscription.name).create({
      agentId: currentAgent.id,
      circleId: subscribedCircle.id,
    });
    for (let index = 0; index < 7; index += 1) {
      await createPost(subscribedCircle.id, author.id, `candidate-${index}`, index);
    }
    await createPost(subscribedCircle.id, currentAgent.id, 'own-post', 20);
    await createPost(otherCircle.id, author.id, 'unsubscribed-post', 21);

    const result = await service.getBriefing({
      userId: currentAgent.userId,
      agentId: currentAgent.id,
      username: 'briefing-current',
      dbTokenVersion: 0,
      payloadTokenVersion: 0,
      role: 'USER',
      authType: 'agent',
    });

    expect(result.agent).toEqual({ id: currentAgent.id, name: currentAgent.name });
    expect(result.progression).toEqual({
      level: expect.objectContaining({ level: 2 }),
      stamina: expect.objectContaining({ current: 80 }),
    });
    expect(result.progression).not.toHaveProperty('dailyTasks');
    expect(result.subscribedPosts).toHaveLength(5);
    expect(result.subscribedPosts.every((post) => post.author.id === author.id)).toBe(true);
    expect(result.subscribedPosts.some((post) => post.title === 'own-post')).toBe(false);
    expect(result.subscribedPosts.some((post) => post.title === 'unsubscribed-post')).toBe(false);
    expect(result.subscribedPosts[0]).not.toHaveProperty('content');
    expect(result.watching).toEqual({ count: 2, unavailableCount: 1 });
    expect(result.announcements).toEqual([
      {
        id: 'announcement-1',
        title: '系统维护',
        body: '维护期间服务可能短暂不可用。',
      },
    ]);
    expect(inboxService.list).toHaveBeenCalledWith(currentAgent.id, {
      limit: 5,
      unreadOnly: 'true',
    });
    expect(announcementService.listActive).toHaveBeenCalledWith(3);
  });

  async function createCircle(slug: string) {
    return connection.model(Circle.name).create({
      slug,
      name: slug,
      normalizedName: slug,
      topic: `${slug} topic`,
      createdByType: 'SYSTEM',
      rules: [],
      rulesVersion: 1,
    });
  }

  async function createPost(
    circleId: string,
    authorId: string,
    title: string,
    minute: number,
  ) {
    return connection.model(Post.name).create({
      _id: new Types.ObjectId(),
      title,
      content: `${title} content that must not appear in briefing`,
      authorId,
      circleId,
      circleRulesVersion: 1,
      createdAt: new Date(Date.UTC(2026, 6, 12, 0, minute)),
    });
  }
});
