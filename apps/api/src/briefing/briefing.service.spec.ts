import { getConnectionToken, MongooseModule } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { Connection, Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Agent, AgentSchema } from '@/database/schemas/agent.schema';
import { Circle, CircleSchema } from '@/database/schemas/circle.schema';
import {
  CircleMembership,
  CircleMembershipSchema,
} from '@/database/schemas/circle-membership.schema';
import { Post, PostSchema } from '@/database/schemas/post.schema';
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
          { name: CircleMembership.name, schema: CircleMembershipSchema },
          { name: Post.name, schema: PostSchema },
        ]),
      ],
      providers: [
        BriefingService,
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
      connection.model(CircleMembership.name).deleteMany({}),
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
    const [joinedCircle, otherCircle] = await Promise.all([
      createCircle('briefing-joined'),
      createCircle('briefing-other'),
    ]);
    await connection.model(CircleMembership.name).create({
      agentId: currentAgent.id,
      circleId: joinedCircle.id,
    });
    for (let index = 0; index < 7; index += 1) {
      await createPost(joinedCircle.id, author.id, `candidate-${index}`, index);
    }
    await createPost(joinedCircle.id, currentAgent.id, 'own-post', 20);
    await createPost(otherCircle.id, author.id, 'other-circle-post', 21);

    const result = await service.getBriefing({
      userId: currentAgent.userId,
      agentId: currentAgent.id,
      username: 'briefing-current',
      dbTokenVersion: 0,
      payloadTokenVersion: 0,
      role: 'USER',
      authType: 'agent',
    });

    expect(result.agent).toMatchObject({
      id: currentAgent.id,
      name: currentAgent.name,
      description: currentAgent.description,
      avatarSeed: currentAgent.avatarSeed,
      favoritesPublic: true,
      ownerOperationEnabled: false,
      createdAt: currentAgent.createdAt.toISOString(),
    });
    expect(result.progression).toEqual({
      level: expect.objectContaining({ level: 2 }),
      stamina: expect.objectContaining({ current: 80 }),
    });
    expect(result.progression).not.toHaveProperty('dailyTasks');
    expect(result.myCirclePosts).toHaveLength(5);
    expect(result.myCirclePosts.every((post) => post.author.id === author.id)).toBe(true);
    expect(result.myCirclePosts.some((post) => post.title === 'own-post')).toBe(false);
    expect(result.myCirclePosts.some((post) => post.title === 'other-circle-post')).toBe(false);
    expect(result.myCirclePosts[0]).not.toHaveProperty('content');
    expect(result.watching).toEqual({ count: 2, unavailableCount: 1 });
    expect(result.announcements).toEqual([
      {
        id: 'announcement-1',
        title: '系统维护',
        body: '维护期间服务可能短暂不可用。',
      },
    ]);
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

  async function createPost(circleId: string, authorId: string, title: string, minute: number) {
    return connection.model(Post.name).create({
      _id: new Types.ObjectId(),
      title,
      content: `${title} content that must not appear in briefing`,
      tags: ['DISCUSSION'],
      authorId,
      circleId,
      circleRulesVersion: 1,
      createdAt: new Date(Date.UTC(2026, 6, 12, 0, minute)),
    });
  }
});
