import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { CIRCLE_STATUSES } from '@/circle/circle.constants';
import { DatabaseService } from '@/database/database.service';
import { Agent } from '@/database/schemas/agent.schema';
import { Circle } from '@/database/schemas/circle.schema';
import { Post } from '@/database/schemas/post.schema';
import { RedisService } from '@/redis/redis.service';
import { BusinessCalendarService } from '@/system/business-calendar.service';
import { ForumStatisticsService } from './forum-statistics.service';

describe('ForumStatisticsService welcome telemetry', () => {
  const telemetryCacheKey = 'skynet:v3:forum:telemetry';

  const agentModel = { countDocuments: jest.fn(), find: jest.fn() };
  const postModel = { aggregate: jest.fn(), find: jest.fn() };
  const circleModel = { countDocuments: jest.fn(), find: jest.fn() };
  const redisClient = {
    get: jest.fn(),
    set: jest.fn(),
  };

  let service: ForumStatisticsService;

  beforeEach(async () => {
    jest.resetAllMocks();

    const module = await Test.createTestingModule({
      providers: [
        ForumStatisticsService,
        { provide: getModelToken(Agent.name), useValue: agentModel },
        { provide: getModelToken(Post.name), useValue: postModel },
        { provide: getModelToken(Circle.name), useValue: circleModel },
        { provide: DatabaseService, useValue: {} },
        { provide: RedisService, useValue: { getClient: () => redisClient } },
        { provide: BusinessCalendarService, useValue: {} },
      ],
    }).compile();

    service = module.get(ForumStatisticsService);
  });

  it('reuses the Redis telemetry snapshot without re-reading MongoDB', async () => {
    redisClient.get.mockResolvedValue(
      JSON.stringify({
        agentsTotal: 12,
        postsTotal: 34,
        circlesTotal: 5,
        events: [{ kind: 'POST_PUBLISHED', occurredAt: '2026-09-04T00:00:00.000Z' }],
        asOf: '2026-09-04T00:00:00.000Z',
        refreshAfter: '2026-09-04T00:00:10.000Z',
      }),
    );

    await expect(service.getWelcomeSummary()).resolves.toMatchObject({
      agentsTotal: 12,
      postsTotal: 34,
      circlesTotal: 5,
      events: [{ kind: 'POST_PUBLISHED', occurredAt: '2026-09-04T00:00:00.000Z' }],
    });
    expect(agentModel.countDocuments).not.toHaveBeenCalled();
    expect(postModel.aggregate).not.toHaveBeenCalled();
    expect(circleModel.countDocuments).not.toHaveBeenCalled();
  });

  it('builds public counts and bounded real events from MongoDB on a cache miss', async () => {
    redisClient.get.mockResolvedValue(null);
    agentModel.countDocuments.mockResolvedValue(12);
    postModel.aggregate.mockReturnValue({ exec: jest.fn().mockResolvedValue([{ value: 34 }]) });
    circleModel.countDocuments.mockResolvedValue(5);
    agentModel.find.mockReturnValue(createQuery([{ _id: 'agent-1', createdAt: newer() }]));
    postModel.find.mockReturnValue(
      createQuery([{ _id: 'post-1', circleId: 'circle-1', createdAt: older() }]),
    );
    circleModel.find
      .mockReturnValueOnce(createQuery([{ _id: 'circle-1', createdAt: oldest() }]))
      .mockReturnValueOnce(createQuery([{ _id: 'circle-1' }]));

    const result = await service.getWelcomeSummary();

    expect(result).toMatchObject({
      agentsTotal: 12,
      postsTotal: 34,
      circlesTotal: 5,
    });
    expect(result.events).toEqual([
      { kind: 'AGENT_CREATED', occurredAt: '2026-09-04T00:00:03.000Z' },
      { kind: 'POST_PUBLISHED', occurredAt: '2026-09-04T00:00:02.000Z' },
      { kind: 'CIRCLE_CREATED', occurredAt: '2026-09-04T00:00:01.000Z' },
    ]);
    expect(agentModel.countDocuments).toHaveBeenCalledWith({ deletedAt: null });
    expect(postModel.aggregate).toHaveBeenCalledWith(expect.any(Array));
    expect(circleModel.countDocuments).toHaveBeenCalledWith({
      deletedAt: null,
      status: CIRCLE_STATUSES.ACTIVE,
    });
    expect(circleModel.find).toHaveBeenLastCalledWith({
      _id: { $in: ['circle-1'] },
      deletedAt: null,
      status: CIRCLE_STATUSES.ACTIVE,
    });
    expect(redisClient.set).toHaveBeenCalledWith(
      telemetryCacheKey,
      expect.any(String),
      'EX',
      10,
    );
  });
});

function createQuery<T>(rows: T[]) {
  const query = {
    sort: jest.fn(),
    limit: jest.fn(),
    select: jest.fn(),
    lean: jest.fn(),
  };
  query.sort.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  query.select.mockReturnValue(query);
  query.lean.mockResolvedValue(rows);
  return query;
}

function newer(): Date {
  return new Date('2026-09-04T00:00:03.000Z');
}

function older(): Date {
  return new Date('2026-09-04T00:00:02.000Z');
}

function oldest(): Date {
  return new Date('2026-09-04T00:00:01.000Z');
}
