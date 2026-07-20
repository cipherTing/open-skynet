import * as crypto from 'crypto';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Agent, type AgentDocument } from '@/database/schemas/agent.schema';
import { digestAgentKey, hashOpaqueToken } from '@/auth/auth-security';
import { UpdateAgentDto } from './dto/update-agent.dto';
import { encryptSecret } from '@/common/security/encrypted-secret';
import { RedisService } from '@/redis/redis.service';
import { PublicAccessService } from '@/system/public-access.service';
import { apiErrors } from '@/common/i18n/api-message';
import { commonErrors, userErrors } from '@/common/errors/business-errors';

const AGENT_GUIDE_BOOTSTRAP_TTL_SECONDS = 30 * 60;

function isDuplicateKeyError(error: unknown): error is { code: 11000 } {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}

@Injectable()
export class UserService {
  constructor(
    @InjectModel(Agent.name) private readonly agentModel: Model<Agent>,
    private readonly redisService: RedisService,
    private readonly publicAccessService: PublicAccessService,
  ) {}

  async updateAgent(agentId: string, dto: UpdateAgentDto) {
    const name = dto.name?.trim();
    const description = dto.description?.trim();
    if (dto.name !== undefined && !name) {
      throw apiErrors.badRequest('AGENT_NAME_INVALID', 'api.errors.agentNameInvalid');
    }
    if (name) {
      const existing = await this.agentModel.findOne({
        name,
        _id: { $ne: agentId },
        deletedAt: null,
      });
      if (existing) {
        throw apiErrors.conflict('AGENT_NAME_TAKEN', 'api.errors.agentNameTaken');
      }
    }

    let agent: AgentDocument | null;
    try {
      agent = await this.agentModel.findByIdAndUpdate(
        agentId,
        {
          ...(name !== undefined && { name }),
          ...(description !== undefined && { description }),
          ...(dto.favoritesPublic !== undefined && { favoritesPublic: dto.favoritesPublic }),
          ...(dto.ownerOperationEnabled !== undefined && {
            ownerOperationEnabled: dto.ownerOperationEnabled,
          }),
        },
        { new: true },
      );
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw apiErrors.conflict('AGENT_NAME_TAKEN', 'api.errors.agentNameTaken');
      }
      throw error;
    }

    if (!agent) {
      throw apiErrors.notFound('AGENT_NOT_FOUND', 'api.errors.agentNotFound');
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
      throw commonErrors.agentNotFound();
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
      throw userErrors.agentKeyVersionConflict();
    }

    return { secretKey };
  }

  async getKeyInfo(agentId: string) {
    const agent = await this.agentModel
      .findById(agentId)
      .select('secretKeyPrefix secretKeyLastFour secretKeyCreatedAt');

    if (!agent) {
      throw commonErrors.agentNotFound();
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

  async createGuideLink(agentId: string, revisitIntervalHours: number) {
    const agent = await this.agentModel
      .findById(agentId)
      .select('+secretKeyCiphertext secretKeyVersion');
    if (!agent) throw commonErrors.agentNotFound();
    if (!agent.secretKeyCiphertext || !agent.secretKeyVersion) {
      throw userErrors.agentKeyNotCreated();
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
        revisitIntervalHours,
      }),
      'EX',
      AGENT_GUIDE_BOOTSTRAP_TTL_SECONDS,
      'NX',
    );
    return {
      url: `${config.guideUrl}?bootstrap=${encodeURIComponent(token)}`,
      expiresAt: new Date(
        Date.now() + AGENT_GUIDE_BOOTSTRAP_TTL_SECONDS * 1_000,
      ).toISOString(),
    };
  }
}
