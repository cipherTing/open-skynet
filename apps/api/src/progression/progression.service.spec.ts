import { getConnectionToken, MongooseModule } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { type Connection } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { AgentProgress, AgentProgressSchema } from '@/database/schemas/agent-progress.schema';
import { AgentXpEvent, AgentXpEventSchema } from '@/database/schemas/agent-xp-event.schema';
import { DatabaseService } from '@/database/database.service';
import {
  EXTERNAL_XP_SOURCE_TYPES,
  PROGRESSION_ACTIONS,
  XP_EVENT_REASON_KEYS,
} from './progression.constants';
import {
  addDays,
  getShanghaiDayKey,
  getShanghaiDayStart,
  ProgressionService,
} from './progression.service';

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

  it('records the actual applied external XP delta when a penalty reaches zero', async () => {
    await connection.model(AgentProgress.name).create({
      agentId: 'agent-penalty',
      xpTotal: 5,
    });

    const result = await databaseService.$transaction((session) =>
      service.applyExternalXpAdjustment(
        {
          agentId: 'agent-penalty',
          requestedDelta: -10,
          sourceType: EXTERNAL_XP_SOURCE_TYPES.GOVERNANCE_PENALTY,
          sourceId: 'case-1',
          reasonKey: XP_EVENT_REASON_KEYS.VIOLATION_HEALTH_PENALTY,
          occurredAt: new Date('2026-07-23T12:00:00.000Z'),
        },
        session,
      ),
    );

    expect(result).toEqual({
      applied: true,
      previousXp: 5,
      nextXp: 0,
      appliedDelta: -5,
      levelAfter: 1,
    });
    expect(
      await connection.model(AgentProgress.name).findOne({ agentId: 'agent-penalty' }),
    ).toMatchObject({
      xpTotal: 0,
    });
    expect(
      await connection.model(AgentXpEvent.name).findOne({ agentId: 'agent-penalty' }),
    ).toMatchObject({
      xp: -5,
    });
    await expect(
      databaseService.$transaction((session) =>
        service.applyExternalXpAdjustment(
          {
            agentId: 'agent-penalty',
            requestedDelta: -10,
            sourceType: EXTERNAL_XP_SOURCE_TYPES.GOVERNANCE_PENALTY,
            sourceId: 'case-1',
            reasonKey: XP_EVENT_REASON_KEYS.VIOLATION_HEALTH_PENALTY,
            occurredAt: new Date('2026-07-23T12:00:00.000Z'),
          },
          session,
        ),
      ),
    ).resolves.toEqual({ applied: false });
  });

  it('serializes concurrent external XP adjustments without losing updates', async () => {
    await connection.model(AgentProgress.name).create({
      agentId: 'agent-concurrent-adjustment',
      xpTotal: 100,
    });
    const occurredAt = new Date('2026-07-23T12:00:00.000Z');
    const apply = (sourceId: string, requestedDelta: number) =>
      databaseService.$transaction((session) =>
        service.applyExternalXpAdjustment(
          {
            agentId: 'agent-concurrent-adjustment',
            requestedDelta,
            sourceType: EXTERNAL_XP_SOURCE_TYPES.ADMIN_ADJUSTMENT,
            sourceId,
            reasonKey: XP_EVENT_REASON_KEYS.ADMIN_XP_ADJUSTMENT,
            occurredAt,
          },
          session,
        ),
      );

    const duplicateResults = await Promise.all([
      apply('same-operation', 20),
      apply('same-operation', 20),
    ]);
    expect(duplicateResults.filter((result) => result.applied)).toHaveLength(1);
    expect(
      await connection
        .model(AgentProgress.name)
        .findOne({ agentId: 'agent-concurrent-adjustment' }),
    ).toMatchObject({ xpTotal: 120 });

    await Promise.all([apply('operation-a', 7), apply('operation-b', 3)]);
    expect(
      await connection
        .model(AgentProgress.name)
        .findOne({ agentId: 'agent-concurrent-adjustment' }),
    ).toMatchObject({ xpTotal: 130 });
    expect(
      await connection.model(AgentXpEvent.name).countDocuments({
        agentId: 'agent-concurrent-adjustment',
      }),
    ).toBe(3);
  });

  it('rolls back both progression and ledger changes when the caller transaction fails', async () => {
    await connection.model(AgentProgress.name).create({
      agentId: 'agent-adjustment-rollback',
      xpTotal: 500,
    });

    await expect(
      databaseService.$transaction(async (session) => {
        await service.applyExternalXpAdjustment(
          {
            agentId: 'agent-adjustment-rollback',
            requestedDelta: -200,
            sourceType: EXTERNAL_XP_SOURCE_TYPES.GOVERNANCE_PENALTY,
            sourceId: 'rollback-case',
            reasonKey: XP_EVENT_REASON_KEYS.VIOLATION_HEALTH_PENALTY,
            occurredAt: new Date('2026-07-23T12:00:00.000Z'),
          },
          session,
        );
        throw new Error('rollback requested');
      }),
    ).rejects.toThrow('rollback requested');

    expect(
      await connection.model(AgentProgress.name).findOne({ agentId: 'agent-adjustment-rollback' }),
    ).toMatchObject({ xpTotal: 500 });
    expect(
      await connection.model(AgentXpEvent.name).countDocuments({
        agentId: 'agent-adjustment-rollback',
      }),
    ).toBe(0);
  });

  it('aggregates score history by Shanghai day before returning it to the application', async () => {
    const todayKey = getShanghaiDayKey(new Date());
    const todayStart = getShanghaiDayStart(todayKey);
    const firstDay = addDays(todayStart, -2);
    const secondDay = addDays(todayStart, -1);
    await connection.model(AgentProgress.name).create({
      agentId: 'agent-score-history',
      xpTotal: 8,
    });
    await connection.model(AgentXpEvent.name).create([
      {
        agentId: 'agent-score-history',
        sourceType: PROGRESSION_ACTIONS.CREATE_REPLY,
        sourceId: 'reply-1',
        reasonKey: XP_EVENT_REASON_KEYS.ACTIVE_ACTION,
        xp: 2,
        occurredAt: new Date(firstDay.getTime() + 30 * 60 * 1000),
      },
      {
        agentId: 'agent-score-history',
        sourceType: PROGRESSION_ACTIONS.CREATE_CHILD_REPLY,
        sourceId: 'reply-2',
        reasonKey: XP_EVENT_REASON_KEYS.ACTIVE_ACTION,
        xp: 3,
        occurredAt: new Date(firstDay.getTime() + 60 * 60 * 1000),
      },
      {
        agentId: 'agent-score-history',
        sourceType: PROGRESSION_ACTIONS.FEEDBACK_POST,
        sourceId: 'feedback-1',
        reasonKey: XP_EVENT_REASON_KEYS.ACTIVE_ACTION,
        xp: 3,
        occurredAt: new Date(secondDay.getTime() + 60 * 60 * 1000),
      },
    ]);

    await expect(service.getScoreHistory('agent-score-history', 3)).resolves.toEqual([
      { date: getShanghaiDayKey(firstDay).slice(5), value: 5 },
      { date: getShanghaiDayKey(secondDay).slice(5), value: 8 },
      { date: todayKey.slice(5), value: 8 },
    ]);
  });
});
