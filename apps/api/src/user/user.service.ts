import * as crypto from 'crypto';
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Agent } from '@/database/schemas/agent.schema';
import { digestAgentKey } from '@/auth/auth-security';
import { UpdateAgentDto } from './dto/update-agent.dto';
import { encryptSecret } from '@/common/security/encrypted-secret';
import { RedisService } from '@/redis/redis.service';
import { hashOpaqueToken } from '@/auth/auth-security';
import { PublicAccessService } from '@/system/public-access.service';

@Injectable()
export class UserService {
  constructor(
    @InjectModel(Agent.name) private readonly agentModel: Model<Agent>,
    private readonly redisService: RedisService,
    private readonly publicAccessService: PublicAccessService,
  ) {}

  async updateAgent(agentId: string, dto: UpdateAgentDto) {
    if (dto.name) {
      const existing = await this.agentModel.findOne({
        name: dto.name,
        _id: { $ne: agentId },
      });
      if (existing) {
        throw new ConflictException('Agent 名称已被占用');
      }
    }

    const agent = await this.agentModel.findByIdAndUpdate(
      agentId,
      {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.favoritesPublic !== undefined && { favoritesPublic: dto.favoritesPublic }),
        ...(dto.ownerOperationEnabled !== undefined && {
          ownerOperationEnabled: dto.ownerOperationEnabled,
        }),
      },
      { new: true },
    );

    if (!agent) {
      throw new NotFoundException('Agent 不存在');
    }

    return {
      id: agent.id,
      name: agent.name,
      description: agent.description,
      favoritesPublic: agent.favoritesPublic !== false,
      ownerOperationEnabled: agent.ownerOperationEnabled === true,
      avatarSeed: agent.avatarSeed,
      createdAt: agent.createdAt.toISOString(),
    };
  }

  async regenerateKey(agentId: string) {
    const agent = await this.agentModel.findById(agentId);
    if (!agent) {
      throw new NotFoundException('Agent 不存在');
    }

    const secretKey = `sk_live_${crypto.randomBytes(32).toString('base64url')}`;

    const prefix = secretKey.slice(0, 16);
    const lastFour = secretKey.slice(-4);
    const digest = digestAgentKey(secretKey);

    const updated = await this.agentModel.findOneAndUpdate(
      { _id: agentId, secretKeyVersion: agent.secretKeyVersion ?? null },
      {
        $set: {
          secretKeyDigest: digest,
          secretKeyPrefix: prefix,
          secretKeyLastFour: lastFour,
          secretKeyCreatedAt: new Date(),
          secretKeyCiphertext: encryptSecret(secretKey, 'agent-key', agent.id),
          secretKeyVersion: (agent.secretKeyVersion ?? 0) + 1,
        },
      },
      { new: true },
    );
    if (!updated) {
      throw new ConflictException('Agent Key 已被其他操作更新，请重试');
    }

    return { secretKey };
  }

  async getKeyInfo(agentId: string) {
    const agent = await this.agentModel
      .findById(agentId)
      .select('secretKeyPrefix secretKeyLastFour secretKeyCreatedAt');

    if (!agent) {
      throw new NotFoundException('Agent 不存在');
    }

    if (!agent.secretKeyPrefix) {
      return null;
    }

    return {
      prefix: agent.secretKeyPrefix,
      lastFour: agent.secretKeyLastFour,
      createdAt: agent.secretKeyCreatedAt?.toISOString() ?? null,
    };
  }

  async createGuideLink(agentId: string) {
    const agent = await this.agentModel
      .findById(agentId)
      .select('+secretKeyCiphertext secretKeyVersion');
    if (!agent) throw new NotFoundException('Agent 不存在');
    if (!agent.secretKeyCiphertext || !agent.secretKeyVersion) {
      throw new ConflictException('请先生成 Agent Key');
    }
    const token = crypto.randomBytes(32).toString('base64url');
    const redisKey = `agent-guide-bootstrap:${hashOpaqueToken(token)}`;
    const config = await this.publicAccessService.getPublicConfig();
    await this.redisService.getClient().set(
      redisKey,
      JSON.stringify({
        agentId: agent.id,
        keyVersion: agent.secretKeyVersion,
        publicAccessVersion: config.version,
      }),
      'EX',
      300,
      'NX',
    );
    return {
      url: `${config.guideUrl}?bootstrap=${encodeURIComponent(token)}`,
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
    };
  }
}
