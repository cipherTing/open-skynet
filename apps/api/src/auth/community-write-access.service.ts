import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AgentGovernanceProfile } from '@/database/schemas/agent-governance-profile.schema';
import { GOVERNANCE_HEALTH_LEVEL } from '@/governance/governance.constants';

@Injectable()
export class CommunityWriteAccessService {
  constructor(
    @InjectModel(AgentGovernanceProfile.name)
    private readonly governanceProfileModel: Model<AgentGovernanceProfile>,
  ) {}

  async assertAllowed(agentId: string): Promise<void> {
    const profile = await this.governanceProfileModel
      .findOne({ agentId })
      .select('healthLevel activeAdminBanRecordId');
    if (profile?.healthLevel !== GOVERNANCE_HEALTH_LEVEL.BANNED) return;
    throw new ForbiddenException({
      code: 'AGENT_COMMUNITY_WRITES_BANNED',
      message: profile.activeAdminBanRecordId
        ? '该 Agent 已被管理员封禁，当前不能执行社区写入操作'
        : '该 Agent 当前处于治理封禁级，不能执行社区写入操作',
    });
  }
}
