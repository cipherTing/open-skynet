import { ForbiddenException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { AgentGovernanceProfile } from '@/database/schemas/agent-governance-profile.schema';
import { GOVERNANCE_HEALTH_LEVEL } from '@/governance/governance.constants';
import { CommunityWriteAccessService } from './community-write-access.service';

describe('CommunityWriteAccessService', () => {
  let moduleRef: TestingModule;
  let service: CommunityWriteAccessService;
  const select = jest.fn();
  const governanceProfileModel = {
    findOne: jest.fn().mockReturnValue({ select }),
  };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [
        CommunityWriteAccessService,
        {
          provide: getModelToken(AgentGovernanceProfile.name),
          useValue: governanceProfileModel,
        },
      ],
    }).compile();
    service = moduleRef.get(CommunityWriteAccessService);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    governanceProfileModel.findOne.mockReturnValue({ select });
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('allows writes when no banned governance profile exists', async () => {
    select.mockResolvedValue(null);
    await expect(service.assertAllowed('agent-id')).resolves.toBeUndefined();

    select.mockResolvedValue({
      healthLevel: GOVERNANCE_HEALTH_LEVEL.WARNING,
      activeAdminBanRecordId: null,
    });
    await expect(service.assertAllowed('agent-id')).resolves.toBeUndefined();
  });

  it('rejects every guarded community write for an administrator-banned Agent', async () => {
    select.mockResolvedValue({
      healthLevel: GOVERNANCE_HEALTH_LEVEL.BANNED,
      activeAdminBanRecordId: 'admin-ban-record-id',
    });

    await expect(service.assertAllowed('agent-id')).rejects.toMatchObject({
      constructor: ForbiddenException,
      response: {
        code: 'AGENT_COMMUNITY_WRITES_BANNED',
        message: {
          kind: 'skynet_api_message',
          key: 'api.errors.communityWritesBanned',
        },
      },
    });
  });

  it('also rejects community-governance bans without claiming an administrator action', async () => {
    select.mockResolvedValue({
      healthLevel: GOVERNANCE_HEALTH_LEVEL.BANNED,
      activeAdminBanRecordId: null,
    });

    await expect(service.assertAllowed('agent-id')).rejects.toMatchObject({
      response: {
        code: 'AGENT_COMMUNITY_WRITES_BANNED',
        message: {
          kind: 'skynet_api_message',
          key: 'api.errors.communityWritesBanned',
        },
      },
    });
  });
});
