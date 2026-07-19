import { getConnectionToken, MongooseModule } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { type Connection } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { AgentProgress, AgentProgressSchema } from '@/database/schemas/agent-progress.schema';
import { AgentXpEvent, AgentXpEventSchema } from '@/database/schemas/agent-xp-event.schema';
import { DatabaseService } from '@/database/database.service';
import { PROGRESSION_ACTIONS } from './progression.constants';
import { ProgressionService } from './progression.service';

describe('ProgressionService precharged actions', () => {
  jest.setTimeout(60_000);

  let mongod: MongoMemoryReplSet;
  let moduleRef: TestingModule;
  let connection: Connection;
  let databaseService: DatabaseService;
  let service: ProgressionService;

  beforeAll(async () => {
    mongod = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([
          { name: AgentProgress.name, schema: AgentProgressSchema },
          { name: AgentXpEvent.name, schema: AgentXpEventSchema },
        ]),
      ],
      providers: [ProgressionService, DatabaseService],
    }).compile();
    connection = moduleRef.get<Connection>(getConnectionToken());
    databaseService = moduleRef.get(DatabaseService);
    service = moduleRef.get(ProgressionService);
    await Promise.all([
      connection.model(AgentProgress.name).init(),
      connection.model(AgentXpEvent.name).init(),
    ]);
  });

  beforeEach(async () => {
    await Promise.all([
      connection.model(AgentProgress.name).deleteMany({}),
      connection.model(AgentXpEvent.name).deleteMany({}),
    ]);
  });

  afterAll(async () => {
    await moduleRef.close();
    await mongod.stop();
  });

  it('charges stamina on review submission and awards XP only after approval', async () => {
    const occurredAt = new Date('2026-07-19T12:00:00.000Z');
    const params = {
      agentId: 'agent-1',
      action: PROGRESSION_ACTIONS.CREATE_POST,
      sourceId: 'review-1',
      occurredAt,
    };

    const charged = await databaseService.$transaction((session) =>
      service.chargeActionStamina(params, session),
    );
    expect(charged).toMatchObject({ xpGained: 0, staminaCost: 8 });
    expect(charged.progression).toMatchObject({
      level: { xpTotal: 0 },
      stamina: { current: 92 },
      dailyTasks: {
        items: expect.arrayContaining([expect.objectContaining({ id: 'daily-post', progress: 0 })]),
      },
    });

    const repeatedCharge = await databaseService.$transaction((session) =>
      service.chargeActionStamina(params, session),
    );
    expect(repeatedCharge).toMatchObject({ xpGained: 0, staminaCost: 0 });
    expect(repeatedCharge.progression.stamina.current).toBe(92);

    const completed = await databaseService.$transaction((session) =>
      service.completePrechargedAction(params, session),
    );
    expect(completed.staminaCost).toBe(0);
    expect(completed.xpGained).toBeGreaterThan(0);
    expect(completed.progression).toMatchObject({
      stamina: { current: 92 },
      dailyTasks: {
        items: expect.arrayContaining([expect.objectContaining({ id: 'daily-post', progress: 1 })]),
      },
    });

    const repeatedCompletion = await databaseService.$transaction((session) =>
      service.completePrechargedAction(params, session),
    );
    expect(repeatedCompletion).toMatchObject({ xpGained: 0, staminaCost: 0 });
    expect(await connection.model(AgentXpEvent.name).countDocuments()).toBe(3);
  });

  it('does not award a precharged action without its stamina record', async () => {
    await expect(
      databaseService.$transaction((session) =>
        service.completePrechargedAction(
          {
            agentId: 'agent-2',
            action: PROGRESSION_ACTIONS.CREATE_POST,
            sourceId: 'review-without-charge',
          },
          session,
        ),
      ),
    ).rejects.toThrow('Precharged action is missing its stamina event');
  });
});
