import { randomUUID } from 'node:crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import { getConnectionToken, MongooseModule } from '@nestjs/mongoose';
import { type Connection, type Model } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { DatabaseService } from '@/database/database.service';
import { StoryCommand, StoryCommandSchema } from '@/database/schemas/story-command.schema';
import { StoryCommandService } from './story-command.service';

describe('StoryCommandService', () => {
  jest.setTimeout(60_000);
  let replicaSet: MongoMemoryReplSet;
  let moduleRef: TestingModule;
  let connection: Connection;
  let service: StoryCommandService;
  let database: DatabaseService;
  let commands: Model<StoryCommand>;

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(replicaSet.getUri()),
        MongooseModule.forFeature([{ name: StoryCommand.name, schema: StoryCommandSchema }]),
      ],
      providers: [StoryCommandService, DatabaseService],
    }).compile();
    connection = moduleRef.get<Connection>(getConnectionToken());
    database = moduleRef.get(DatabaseService);
    service = moduleRef.get(StoryCommandService);
    commands = connection.model<StoryCommand>(StoryCommand.name);
    await commands.init();
    await connection.createCollection('command_test_effects');
  });

  beforeEach(async () => {
    await commands.deleteMany({});
    await connection.collection('command_test_effects').deleteMany({});
  });

  afterAll(async () => {
    await moduleRef?.close();
    await replicaSet?.stop();
  });

  const create = async (text: string) =>
    database.$transaction(async (session) => {
      const result = await connection
        .collection('command_test_effects')
        .insertOne({ text }, { session });
      return {
        id: result.insertedId.toString(),
        text,
        createdAt: new Date('2026-11-09T12:00:00Z'),
      };
    });

  it('replays the first committed result after response loss without a second effect', async () => {
    const key = randomUUID();
    const first = await service.execute(
      'agent-a',
      key,
      'CREATE_DOCUMENT',
      'story-a',
      { title: 'Opening' },
      () => create('original'),
    );
    const replay = await service.execute(
      'agent-a',
      key,
      'CREATE_DOCUMENT',
      'story-a',
      { title: 'Opening' },
      () => create('duplicate'),
    );
    expect(replay).toEqual(first);
    expect(first).toMatchObject({ text: 'original', createdAt: '2026-11-09T12:00:00.000Z' });
    expect(await connection.collection('command_test_effects').countDocuments()).toBe(1);
  });

  it('rejects changed payload or scope with the same request identity', async () => {
    const key = randomUUID();
    await service.execute('agent-a', key, 'CREATE_DOCUMENT', 'story-a', { title: 'Opening' }, () =>
      create('original'),
    );
    await expect(
      service.execute('agent-a', key, 'CREATE_DOCUMENT', 'story-a', { title: 'Changed' }, () =>
        create('changed'),
      ),
    ).rejects.toMatchObject({ response: { code: 'STORY_IDEMPOTENCY_CONFLICT' } });
    await expect(
      service.execute('agent-a', key, 'CREATE_DOCUMENT', 'story-b', { title: 'Opening' }, () =>
        create('other story'),
      ),
    ).rejects.toMatchObject({ response: { code: 'STORY_IDEMPOTENCY_CONFLICT' } });
    expect(await connection.collection('command_test_effects').countDocuments()).toBe(1);
  });

  it('canonicalizes object keys while preserving array order and separates Agents', async () => {
    const key = randomUUID();
    const first = await service.execute(
      'agent-a',
      key,
      'CREATE_DOCUMENT',
      null,
      { a: 1, b: { d: 2, c: 3 } },
      () => create('original'),
    );
    expect(
      await service.execute(
        'agent-a',
        key,
        'CREATE_DOCUMENT',
        null,
        { b: { c: 3, d: 2 }, a: 1 },
        () => create('duplicate'),
      ),
    ).toEqual(first);
    await service.execute(
      'agent-b',
      key,
      'CREATE_DOCUMENT',
      null,
      { a: 1, b: { d: 2, c: 3 } },
      () => create('other agent'),
    );
    expect(await connection.collection('command_test_effects').countDocuments()).toBe(2);
  });

  it('rolls back both receipt and effect and permits retry after failed work', async () => {
    const key = randomUUID();
    await expect(
      service.execute('agent-a', key, 'CREATE_DOCUMENT', null, {}, async () => {
        await create('rolled back');
        throw new Error('reject the write');
      }),
    ).rejects.toThrow('reject the write');
    expect(await commands.countDocuments()).toBe(0);
    expect(await connection.collection('command_test_effects').countDocuments()).toBe(0);
    await service.execute('agent-a', key, 'CREATE_DOCUMENT', null, {}, () => create('retry'));
    expect(await connection.collection('command_test_effects').countDocuments()).toBe(1);
  });

  it('concurrent identical creates commit one result and one effect', async () => {
    const key = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 3 }, () =>
        service.execute('agent-a', key, 'CREATE_MESSAGE', 'thread-a', { content: 'Hello' }, () =>
          create('Hello'),
        ),
      ),
    );
    expect(results[1]).toEqual(results[0]);
    expect(results[2]).toEqual(results[0]);
    expect(await commands.countDocuments()).toBe(1);
    expect(await connection.collection('command_test_effects').countDocuments()).toBe(1);
  });

  it('rejects missing and invalid identities before invoking the write', async () => {
    await expect(
      service.execute('agent-a', undefined, 'CREATE_STORY', null, {}, () => create('forbidden')),
    ).rejects.toMatchObject({ response: { code: 'STORY_IDEMPOTENCY_KEY_REQUIRED' } });
    await expect(
      service.execute('agent-a', 'bad-key', 'CREATE_STORY', null, {}, () => create('forbidden')),
    ).rejects.toMatchObject({ response: { code: 'STORY_IDEMPOTENCY_KEY_INVALID' } });
    expect(await connection.collection('command_test_effects').countDocuments()).toBe(0);
  });
});
