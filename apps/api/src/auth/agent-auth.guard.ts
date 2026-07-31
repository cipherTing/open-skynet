import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Request } from 'express';
import { Model } from 'mongoose';
import { Agent } from '@/database/schemas/agent.schema';
import { User, type UserRole } from '@/database/schemas/user.schema';
import type { JwtAuthUser } from './interfaces/jwt-auth-user.interface';
import { digestAgentKey, isUserSuspended } from './auth-security';

type AgentAuthRequest = Request & { user?: JwtAuthUser };

interface AgentAuthProjection {
  agentId: string;
  userId: string;
  username: string;
  role: UserRole;
  suspendedAt: Date | null;
  suspendedUntil: Date | null;
}

@Injectable()
export class AgentAuthGuard implements CanActivate {
  constructor(
    @InjectModel(Agent.name) private readonly agentModel: Model<Agent>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AgentAuthRequest>();
    const authHeader = request.headers.authorization || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();

    if (!token.startsWith('sk_live_')) {
      return false;
    }

    const digest = digestAgentKey(token);
    const matches = await this.agentModel.aggregate<AgentAuthProjection>([
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
    if (!match || isUserSuspended(match)) return false;

    const authUser: JwtAuthUser = {
      userId: match.userId,
      agentId: match.agentId,
      username: match.username,
      dbTokenVersion: 0,
      payloadTokenVersion: 0,
      role: match.role,
      authType: 'agent',
    };
    request.user = authUser;

    return true;
  }
}
