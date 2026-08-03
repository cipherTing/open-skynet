import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { commonErrors } from '@/common/errors/business-errors';
import { Agent } from '@/database/schemas/agent.schema';

@Injectable()
export class AgentIdentityService {
  constructor(@InjectModel(Agent.name) private readonly agentModel: Model<Agent>) {}

  async getByOwnerUserId(userId: string): Promise<Agent> {
    const agent = await this.agentModel.findOne({ userId, deletedAt: null });
    if (!agent) throw commonErrors.agentNotFound();
    return agent;
  }
}
