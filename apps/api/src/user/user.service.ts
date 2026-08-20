import * as crypto from 'crypto';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, type ClientSession } from 'mongoose';
import { Agent, type AgentDocument } from '@/database/schemas/agent.schema';
import { digestAgentKey, hashOpaqueToken } from '@/auth/auth-security';
import { UpdateAgentDto } from './dto/update-agent.dto';
import { decryptSecret, encryptSecret } from '@/common/security/encrypted-secret';
import { RedisService } from '@/redis/redis.service';
import { PublicAccessService } from '@/system/public-access.service';
import { apiErrors } from '@/common/i18n/api-message';
import { commonErrors, userErrors } from '@/common/errors/business-errors';
import {
  AGENT_GUIDE_BOOTSTRAP_TTL_SECONDS,
  getAgentGuideBootstrapRedisKey,
  parseAgentGuideBootstrapAgentId,
  parseAgentGuideBootstrapRecord,
} from '@/system/agent-guide-bootstrap';

const GUIDE_LINK_CREATE_ATTEMPTS = 2;
const GUIDE_LINK_SECRET_PURPOSE = 'agent-guide-bootstrap';
const DELETE_BOOTSTRAP_IF_UNCHANGED_SCRIPT = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
return redis.call('DEL', KEYS[1])
`;

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

  async updateAgent(agentId: string, dto: UpdateAgentDto, session?: ClientSession) {
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
      }, null, { session });
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
        { new: true, session },
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
    let agent = await this.agentModel
      .findById(agentId)
      .select('+secretKeyCiphertext secretKeyVersion');
    if (!agent) throw commonErrors.agentNotFound();
    if (!agent.secretKeyCiphertext || !agent.secretKeyVersion) {
      await this.regenerateKey(agent.id);
      agent = await this.agentModel
        .findById(agentId)
        .select('+secretKeyCiphertext secretKeyVersion');
      if (!agent?.secretKeyCiphertext || !agent.secretKeyVersion) {
        throw userErrors.agentKeyNotCreated();
      }
    }
    const redisKey = getAgentGuideBootstrapRedisKey(agent.id);
    for (let attempt = 1; attempt <= GUIDE_LINK_CREATE_ATTEMPTS; attempt += 1) {
      const config = await this.publicAccessService.getPublicConfig();
      const token = `${agent.id}.${crypto.randomBytes(32).toString('base64url')}`;
      const expiresAt = new Date(
        Date.now() + AGENT_GUIDE_BOOTSTRAP_TTL_SECONDS * 1_000,
      ).toISOString();
      const raw = JSON.stringify({
        tokenHash: hashOpaqueToken(token),
        tokenCiphertext: encryptSecret(token, GUIDE_LINK_SECRET_PURPOSE, agent.id),
        expiresAt,
        keyVersion: agent.secretKeyVersion,
        publicAccessVersion: config.version,
        revisitIntervalHours,
      });
      await this.redisService
        .getClient()
        .set(redisKey, raw, 'EX', AGENT_GUIDE_BOOTSTRAP_TTL_SECONDS);
      const latestConfig = await this.publicAccessService.getPublicConfig();
      if (latestConfig.version === config.version) {
        return {
          url: `${config.guideUrl}?bootstrap=${encodeURIComponent(token)}`,
          expiresAt,
        };
      }
      await this.deleteBootstrapIfUnchanged(redisKey, raw);
      if (attempt === GUIDE_LINK_CREATE_ATTEMPTS) {
        throw userErrors.guideLinkConfigurationChanged();
      }
    }
    throw userErrors.guideLinkConfigurationChanged();
  }

  async getGuideLinkStatus(agentId: string) {
    const raw = await this.redisService
      .getClient()
      .get(getAgentGuideBootstrapRedisKey(agentId));
    if (!raw) return { active: false, url: null, expiresAt: null };
    const record = parseAgentGuideBootstrapRecord(raw);
    if (!record) {
      await this.deleteBootstrapIfUnchanged(
        getAgentGuideBootstrapRedisKey(agentId),
        raw,
      );
      return { active: false, url: null, expiresAt: null };
    }
    const [agent, publicAccessConfig] = await Promise.all([
      this.agentModel.findById(agentId).select('secretKeyVersion'),
      this.publicAccessService.getPublicConfig(),
    ]);
    if (!agent) throw commonErrors.agentNotFound();
    if (
      agent.secretKeyVersion !== record.keyVersion ||
      publicAccessConfig.version !== record.publicAccessVersion ||
      Date.parse(record.expiresAt) <= Date.now()
    ) {
      await this.deleteBootstrapIfUnchanged(
        getAgentGuideBootstrapRedisKey(agentId),
        raw,
      );
      return { active: false, url: null, expiresAt: null };
    }
    let token: string;
    try {
      token = decryptSecret(record.tokenCiphertext, GUIDE_LINK_SECRET_PURPOSE, agentId);
    } catch {
      await this.deleteBootstrapIfUnchanged(
        getAgentGuideBootstrapRedisKey(agentId),
        raw,
      );
      return { active: false, url: null, expiresAt: null };
    }
    if (
      parseAgentGuideBootstrapAgentId(token) !== agentId ||
      hashOpaqueToken(token) !== record.tokenHash
    ) {
      await this.deleteBootstrapIfUnchanged(
        getAgentGuideBootstrapRedisKey(agentId),
        raw,
      );
      return { active: false, url: null, expiresAt: null };
    }
    return {
      active: true,
      url: `${publicAccessConfig.guideUrl}?bootstrap=${encodeURIComponent(token)}`,
      expiresAt: record.expiresAt,
    };
  }

  private async deleteBootstrapIfUnchanged(redisKey: string, raw: string): Promise<void> {
    await this.redisService
      .getClient()
      .eval(DELETE_BOOTSTRAP_IF_UNCHANGED_SCRIPT, 1, redisKey, raw);
  }
}
