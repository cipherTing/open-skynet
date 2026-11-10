import { getConnectionToken, MongooseModule } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { type Connection } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { DatabaseService } from '@/database/database.service';
import {
  StoryActivity,
  StoryActivitySchema,
  StoryActivityCounter,
  StoryActivityCounterSchema,
} from '@/database/schemas/story-activity.schema';
import {
  StoryActivityService,
  STORY_ACTIVITY_KINDS,
  type CreateStoryActivityInput,
} from './story-activity.service';

describe('StoryActivityService', () => {
  jest.setTimeout(120_000);
  let replicaSet: MongoMemoryReplSet;
  let moduleRef: TestingModule;
  let connection: Connection;
  let database: DatabaseService;
  let service: StoryActivityService;

  const input = (storyId = 'story-a'): CreateStoryActivityInput => ({
    storyId,
    kind: STORY_ACTIVITY_KINDS.DOCUMENT_REVISED,
    targetType: 'document',
    documentId: 'document-a',
    revisionNumber: 2,
    authorAgentId: 'agent-a',
    title: '第一章',
    summary: '修复人物动机。',
  });

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(replicaSet.getUri()),
        MongooseModule.forFeature([
          { name: StoryActivity.name, schema: StoryActivitySchema },
          { name: StoryActivityCounter.name, schema: StoryActivityCounterSchema },
        ]),
      ],
      providers: [DatabaseService, StoryActivityService],
    }).compile();
    connection = moduleRef.get<Connection>(getConnectionToken());
    database = moduleRef.get(DatabaseService);
    service = moduleRef.get(StoryActivityService);
    await Promise.all([
      connection.model(StoryActivity.name).init(),
      connection.model(StoryActivityCounter.name).init(),
    ]);
  });
  beforeEach(async () => {
    await Promise.all([
      connection.model(StoryActivity.name).deleteMany({}),
      connection.model(StoryActivityCounter.name).deleteMany({}),
    ]);
  });
  afterAll(async () => {
    await moduleRef.close();
    await replicaSet.stop();
  });

  it('resumes from a durable sequence across more than 72 hours and multiple pages', async () => {
    for (let index = 0; index < 121; index += 1) {
      await database.$transaction((session) =>
        service.append({ ...input(), revisionNumber: index + 1 }, session),
      );
    }
    await connection
      .model(StoryActivity.name)
      .collection.updateMany({}, { $set: { createdAt: new Date('2020-01-01T00:00:00Z') } });
    const first = await service.list('story-a', { afterSequence: 0, limit: 50 });
    const second = await service.list('story-a', { afterSequence: first.nextSequence, limit: 50 });
    const third = await service.list('story-a', { afterSequence: second.nextSequence, limit: 50 });
    expect(first.items).toHaveLength(50);
    expect(first.items[0]?.createdAt.toISOString()).toBe('2020-01-01T00:00:00.000Z');
    expect(second.items).toHaveLength(50);
    expect(third.items).toHaveLength(21);
    expect([...first.items, ...second.items, ...third.items].map((item) => item.sequence)).toEqual(
      Array.from({ length: 121 }, (_, index) => index + 1),
    );
    expect([first.hasMore, second.hasMore, third.hasMore]).toEqual([true, true, false]);
    expect(third.nextSequence).toBe(121);
    expect(first.items[0]).toMatchObject({
      title: '第一章',
      summary: '修复人物动机。',
      documentId: 'document-a',
      revisionNumber: 1,
    });
    expect(first.items[0]).not.toHaveProperty('content');
  });

  it('rolls back both the activity and the allocated sequence with the business transaction', async () => {
    await expect(
      database.$transaction(async (session) => {
        await service.append(input(), session);
        throw new Error('business write rejected');
      }),
    ).rejects.toThrow('business write rejected');
    expect(await service.list('story-a', {})).toEqual({
      items: [],
      nextSequence: 0,
      hasMore: false,
    });
    const committed = await database.$transaction((session) => service.append(input(), session));
    expect(committed.sequence).toBe(1);
  });

  it('serializes concurrent activity allocation without gaps or cross-story interference', async () => {
    await database.$transaction((session) => service.append(input(), session));
    await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        database.$transaction((session) =>
          service.append({ ...input(), title: `修改 ${index}` }, session),
        ),
      ),
    );
    const other = await database.$transaction((session) =>
      service.append(input('story-b'), session),
    );
    expect(other.sequence).toBe(1);
    const result = await service.list('story-a', {});
    expect(result.items.map((item) => item.sequence)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(await service.latestSequence('story-a')).toBe(9);
    expect((await service.recent('story-a', 3)).map((item) => item.sequence)).toEqual([9, 8, 7]);
  });

  it('preserves the caller checkpoint when no newer activity exists', async () => {
    expect(await service.list('story-a', { afterSequence: 87 })).toEqual({
      items: [],
      nextSequence: 87,
      hasMore: false,
    });
  });
});
