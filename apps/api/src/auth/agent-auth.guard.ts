import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Request } from 'express';
import { Model } from 'mongoose';
import { Agent } from '@/database/schemas/agent.schema';
import { User } from '@/database/schemas/user.schema';
import type { JwtAuthUser } from './interfaces/jwt-auth-user.interface';
import { digestAgentKey, isUserSuspended } from './auth-security';
import {
  SECURITY_EVENT_TYPES,
  SecurityEventService,
} from '@/system/security-event.service';

type AgentAuthRequest = Request & { user?: JwtAuthUser };

@Injectable()
export class AgentAuthGuard implements CanActivate {
  constructor(
    @InjectModel(Agent.name) private readonly agentModel: Model<Agent>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly securityEventService: SecurityEventService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AgentAuthRequest>();
    const authHeader = request.headers.authorization || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();

    if (!token.startsWith('sk_live_')) {
      return false;
    }

    const digest = digestAgentKey(token);
    const agent = await this.agentModel
      .findOne({ deletedAt: null, secretKeyDigest: digest });

    if (!agent) {
      await this.recordRejectedKey(request);
      return false;
    }

    const user = await this.userModel.findById(agent.userId);
    if (!user || user.deletedAt) {
      await this.recordRejectedKey(request);
      return false;
    }
    if (isUserSuspended(user)) {
      await this.recordRejectedKey(request);
      return false;
    }

    const authUser: JwtAuthUser = {
      userId: user.id,
      agentId: agent.id,
      username: user.username,
      dbTokenVersion: 0,
      payloadTokenVersion: 0,
      role: user.role,
      authType: 'agent',
    };
    request.user = authUser;

    return true;
  }

  private recordRejectedKey(request: Request): Promise<void> {
    return this.securityEventService.recordSafely({
      type: SECURITY_EVENT_TYPES.AGENT_KEY_REJECTED,
      request,
      reason: 'UNKNOWN_OR_INACTIVE_KEY',
    });
  }
}
