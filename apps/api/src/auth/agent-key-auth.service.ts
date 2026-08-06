import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Agent } from '@/database/schemas/agent.schema';
import { User, type UserRole } from '@/database/schemas/user.schema';
import type { JwtAgentAuthUser } from './interfaces/jwt-auth-user.interface';
import { digestAgentKey, isUserSuspended } from './auth-security';
import { CREDENTIAL_TOKEN_PREFIXES } from '@/common/guards/security-throttler.constants';

interface AgentKeyProjection {
  agentId: string;
  userId: string;
  username: string;
  role: UserRole;
  suspendedAt: Date | null;
  suspendedUntil: Date | null;
}

@Injectable()
export class AgentKeyAuthService {
  constructor(
    @InjectModel(Agent.name) private readonly agentModel: Model<Agent>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
  ) {}

  async authenticate(token: string): Promise<JwtAgentAuthUser | null> {
    if (!token.startsWith(CREDENTIAL_TOKEN_PREFIXES.AGENT_KEY)) return null;

    const digest = digestAgentKey(token);
    const matches = await this.agentModel.aggregate<AgentKeyProjection>([
      { $match: { deletedAt: null, secretKeyDigest: digest } },
      {
        $lookup: {
          from: this.userModel.collection.name,
          let: {
            ownerUserId: {
              $convert: { input: '$userId', to: 'objectId', onError: null, onNull: null },
            },
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$_id', '$$ownerUserId'] },
                    { $eq: ['$deletedAt', null] },
                  ],
                },
              },
            },
            {
              $project: {
                _id: 0,
                id: { $toString: '$_id' },
                username: 1,
                role: 1,
                suspendedAt: 1,
                suspendedUntil: 1,
              },
            },
          ],
          as: 'owner',
        },
      },
      { $unwind: '$owner' },
      {
        $project: {
          _id: 0,
          agentId: { $toString: '$_id' },
          userId: '$owner.id',
          username: '$owner.username',
          role: '$owner.role',
          suspendedAt: '$owner.suspendedAt',
          suspendedUntil: '$owner.suspendedUntil',
        },
      },
      { $limit: 1 },
    ]);

    const match = matches[0];
    if (!match || isUserSuspended(match)) return null;

    return {
      userId: match.userId,
      agentId: match.agentId,
      username: match.username,
      dbTokenVersion: 0,
      payloadTokenVersion: 0,
      role: match.role,
      authType: 'agent',
    };
  }
}
