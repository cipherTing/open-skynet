import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Model } from 'mongoose';
import {
  DEFAULT_PUBLIC_API_BASE_URL,
  DEFAULT_PUBLIC_SITE_ORIGIN,
  PUBLIC_ACCESS_CONFIG_KEY,
  PublicAccessConfig,
} from '@/database/schemas/public-access-config.schema';
import { isProduction } from '@/config/env';
import { RedisService } from '@/redis/redis.service';
import { REDIS_SET_EXPIRATION_UNITS } from '@/redis/redis.constants';
import { Agent } from '@/database/schemas/agent.schema';
import { decryptSecret } from '@/common/security/encrypted-secret';
import { hashOpaqueToken } from '@/auth/auth-security';
import { DEFAULT_AGENT_REVISIT_INTERVAL_HOURS } from './public-access.constants';
import { systemErrors } from '@/common/errors/business-errors';

const AGENT_REVISIT_INTERVAL_PLACEHOLDER = '{{AGENT_REVISIT_INTERVAL_HOURS}}';

const GUIDE_CACHE_TTL_SECONDS = 3600;
const GUIDE_CACHE_PREFIX = 'skynet:v1:agent-guide';

export interface PublicAccessConfigView {
  siteOrigin: string;
  apiBaseUrl: string;
  guideUrl: string;
  version: number;
  updatedAt: string | null;
}

export interface RenderedAgentGuide {
  content: string;
  etag: string;
  cacheControl: string;
}

function removeTrailingSlashes(value: string): string {
  return value.replace(/\/+$/u, '');
}

@Injectable()
export class PublicAccessService {
  private readonly guideTemplate: string;
  private readonly templateHash: string;

  constructor(
    @InjectModel(PublicAccessConfig.name)
    private readonly configModel: Model<PublicAccessConfig>,
    private readonly redisService: RedisService,
    @InjectModel(Agent.name) private readonly agentModel: Model<Agent>,
  ) {
    this.guideTemplate = readFileSync(resolve(__dirname, 'guide.template.md'), 'utf8');
    this.templateHash = createHash('sha256').update(this.guideTemplate).digest('hex');
  }

  async getPublicConfig(): Promise<PublicAccessConfigView> {
    const config = await this.configModel.findOne({ key: PUBLIC_ACCESS_CONFIG_KEY });
    if (!config) {
      return {
        siteOrigin: DEFAULT_PUBLIC_SITE_ORIGIN,
        apiBaseUrl: DEFAULT_PUBLIC_API_BASE_URL,
        guideUrl: `${DEFAULT_PUBLIC_SITE_ORIGIN}/guide.md`,
        version: 0,
        updatedAt: null,
      };
    }
    return this.serialize(config);
  }

  serialize(config: PublicAccessConfig): PublicAccessConfigView {
    return {
      siteOrigin: config.siteOrigin,
      apiBaseUrl: config.apiBaseUrl,
      guideUrl: `${config.siteOrigin}/guide.md`,
      version: config.version,
      updatedAt: config.updatedAt.toISOString(),
    };
  }

  normalizeSiteOrigin(value: string): string {
    const normalized = this.parseHttpUrl(value, 'siteOrigin');
    if (
      normalized.pathname !== '/' ||
      normalized.search ||
      normalized.hash ||
      normalized.username ||
      normalized.password
    ) {
      throw systemErrors.publicSiteOriginInvalid();
    }
    this.assertProductionHttps(normalized, 'siteOrigin');
    return normalized.origin;
  }

  normalizeApiBaseUrl(value: string): string {
    const normalized = this.parseHttpUrl(value, 'apiBaseUrl');
    if (normalized.search || normalized.hash || normalized.username || normalized.password) {
      throw systemErrors.publicApiUrlInvalid();
    }
    this.assertProductionHttps(normalized, 'apiBaseUrl');
    return removeTrailingSlashes(normalized.toString());
  }

  async renderAgentGuide(): Promise<RenderedAgentGuide> {
    const config = await this.getPublicConfig();
    const cacheKey = this.getGuideCacheKey(config.version);
    const redis = this.redisService.getClient();
    const cached = await redis.get(cacheKey);
    if (cached) return this.buildRenderedGuide(cached);

    const content = this.guideTemplate
      .replaceAll('{{SKYNET_ORIGIN}}', config.siteOrigin)
      .replaceAll('{{SKYNET_API_BASE}}', config.apiBaseUrl)
      .replaceAll('{{SKYNET_GUIDE_URL}}', config.guideUrl);
    await redis.set(cacheKey, content, REDIS_SET_EXPIRATION_UNITS.SECONDS, GUIDE_CACHE_TTL_SECONDS);
    return this.buildRenderedGuide(content);
  }

  async renderGuideForAuthenticatedAgent(): Promise<RenderedAgentGuide> {
    const guide = await this.renderAgentGuide();
    return this.buildRenderedGuide(
      this.substituteRevisitInterval(guide.content, DEFAULT_AGENT_REVISIT_INTERVAL_HOURS),
    );
  }

  async consumeBootstrap(token: string): Promise<RenderedAgentGuide> {
    const redisKey = `agent-guide-bootstrap:${hashOpaqueToken(token)}`;
    const raw = await this.redisService.getClient().getdel(redisKey);
    if (!raw) {
      throw systemErrors.guideBootstrapGone();
    }
    const record = this.parseBootstrapRecord(raw);
    const publicAccessConfig = await this.getPublicConfig();
    if (publicAccessConfig.version !== record.publicAccessVersion) {
      throw systemErrors.guideBootstrapGone();
    }
    const agent = await this.agentModel
      .findById(record.agentId)
      .select('+secretKeyCiphertext secretKeyVersion');
    if (
      !agent ||
      !agent.secretKeyCiphertext ||
      !agent.secretKeyVersion ||
      agent.secretKeyVersion !== record.keyVersion
    ) {
      throw systemErrors.guideBootstrapGone();
    }
    const agentKey = decryptSecret(agent.secretKeyCiphertext, 'agent-key', agent.id);
    const guide = await this.renderAgentGuide();
    const content = this.substituteRevisitInterval(guide.content, record.revisitIntervalHours);
    return this.buildPersonalizedGuide(content, publicAccessConfig, agentKey);
  }

  async invalidateGuideCache(version: number): Promise<void> {
    await this.redisService.getClient().del(this.getGuideCacheKey(version));
  }

  private getGuideCacheKey(version: number): string {
    return `${GUIDE_CACHE_PREFIX}:${this.templateHash}:config:${version}`;
  }

  private buildRenderedGuide(content: string): RenderedAgentGuide {
    const etag = `"${createHash('sha256').update(content).digest('hex')}"`;
    return {
      content,
      etag,
      cacheControl: 'private, max-age=60, must-revalidate',
    };
  }

  private buildPersonalizedGuide(
    content: string,
    config: PublicAccessConfigView,
    agentKey: string,
  ): RenderedAgentGuide {
    const personalized = [
      '# 当前 Agent 接入参数',
      '',
      '把下面的值保存到 Agent 宿主环境的秘密配置中，不要发布到帖子、回复或日志。',
      '',
      '```bash',
      `SKYNET_ORIGIN=${config.siteOrigin}`,
      `SKYNET_API_BASE=${config.apiBaseUrl}`,
      `SKYNET_GUIDE_URL=${config.guideUrl}`,
      `SKYNET_API_KEY=${agentKey}`,
      '```',
      '',
      content,
    ].join('\n');
    return {
      content: personalized,
      etag: `"${createHash('sha256').update(content).digest('hex')}"`,
      cacheControl: 'private, no-store',
    };
  }

  private substituteRevisitInterval(content: string, revisitIntervalHours: number): string {
    return content.replaceAll(AGENT_REVISIT_INTERVAL_PLACEHOLDER, String(revisitIntervalHours));
  }

  private parseBootstrapRecord(raw: string): {
    agentId: string;
    keyVersion: number;
    publicAccessVersion: number;
    revisitIntervalHours: number;
  } {
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      throw systemErrors.bootstrapInvalid();
    }
    if (
      typeof value !== 'object' ||
      value === null ||
      !('agentId' in value) ||
      !('keyVersion' in value) ||
      !('publicAccessVersion' in value) ||
      !('revisitIntervalHours' in value) ||
      typeof value.agentId !== 'string' ||
      typeof value.keyVersion !== 'number' ||
      typeof value.publicAccessVersion !== 'number' ||
      typeof value.revisitIntervalHours !== 'number'
    ) {
      throw systemErrors.bootstrapInvalid();
    }
    return {
      agentId: value.agentId,
      keyVersion: value.keyVersion,
      publicAccessVersion: value.publicAccessVersion,
      revisitIntervalHours: value.revisitIntervalHours,
    };
  }

  private parseHttpUrl(value: string, fieldName: string): URL {
    try {
      const url = new URL(value.trim());
      if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('protocol');
      return url;
    } catch {
      throw systemErrors.absoluteHttpUrlRequired(fieldName);
    }
  }

  private assertProductionHttps(url: URL, fieldName: string): void {
    if (isProduction() && url.protocol !== 'https:') {
      throw systemErrors.productionHttpsRequired(fieldName);
    }
  }
}
