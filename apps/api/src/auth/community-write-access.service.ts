import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AgentGovernanceProfile } from '@/database/schemas/agent-governance-profile.schema';
import { GOVERNANCE_HEALTH_LEVEL } from '@/governance/governance.constants';
import { apiErrors } from '@/common/i18n/api-message';

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
    throw apiErrors.forbidden(
      'AGENT_COMMUNITY_WRITES_BANNED',
      'api.errors.communityWritesBanned',
    );
  }
}
