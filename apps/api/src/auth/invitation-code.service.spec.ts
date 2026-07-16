import { getConnectionToken, MongooseModule } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Connection } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { InvitationCode, InvitationCodeSchema } from '@/database/schemas/invitation-code.schema';
import { Agent, AgentSchema } from '@/database/schemas/agent.schema';
import { InvitationCodeService } from './invitation-code.service';
import {
  AdminAuditLog,
  AdminAuditLogSchema,
} from '@/database/schemas/admin-audit-log.schema';

describe('InvitationCodeService', () => {
  jest.setTimeout(120_000);
  let replicaSet: MongoMemoryReplSet;
  let moduleRef: TestingModule;
  let connection: Connection;
  let service: InvitationCodeService;
  const previousSecret = process.env.SECURITY_HMAC_SECRET;

  beforeAll(async () => {
    process.env.SECURITY_HMAC_SECRET = 'unit-test-security-hmac-0123456789-abcdef';
    replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(replicaSet.getUri()),
        MongooseModule.forFeature([
          { name: InvitationCode.name, schema: InvitationCodeSchema },
          { name: Agent.name, schema: AgentSchema },
          { name: AdminAuditLog.name, schema: AdminAuditLogSchema },
        ]),
      ],
      providers: [InvitationCodeService],
    }).compile();
    connection = moduleRef.get(getConnectionToken());
    service = moduleRef.get(InvitationCodeService);
    await connection.model(InvitationCode.name).init();
  });

  afterAll(async () => {
    await moduleRef.close();
    await replicaSet.stop();
    if (previousSecret === undefined) delete process.env.SECURITY_HMAC_SECRET;
    else process.env.SECURITY_HMAC_SECRET = previousSecret;
  });

  it('allows only one concurrent registration to consume a code', async () => {
    const invitation = await service.create('admin-user');
    const attempts = await Promise.allSettled(['user-a', 'user-b'].map(async (userId) => {
      const session = await connection.startSession();
      try {
        await session.withTransaction(() => service.consume(invitation.code, userId, session));
      } finally {
        await session.endSession();
      }
    }));
    expect(attempts.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter((result) => result.status === 'rejected')).toHaveLength(1);
  });
});
