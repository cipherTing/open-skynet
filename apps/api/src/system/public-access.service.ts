import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Model } from 'mongoose';
import {
  PUBLIC_ACCESS_CONFIG_KEY,
  PublicAccessConfig,
} from '@/database/schemas/public-access-config.schema';
import { RedisService } from '@/redis/redis.service';
import { REDIS_SET_EXPIRATION_UNITS } from '@/redis/redis.constants';
import { Agent } from '@/database/schemas/agent.schema';
import { decryptSecret } from '@/common/security/encrypted-secret';
import { hashOpaqueToken } from '@/auth/auth-security';
import {
  DEFAULT_AGENT_REVISIT_INTERVAL_HOURS,
  derivePublicApiBaseUrl,
  getDefaultPublicAccessAddresses,
} from './public-access.constants';
import { systemErrors } from '@/common/errors/business-errors';
import {
  getAgentGuideBootstrapRedisKey,
  parseAgentGuideBootstrapAgentId,
  parseAgentGuideBootstrapRecord,
} from './agent-guide-bootstrap';

const AGENT_REVISIT_INTERVAL_PLACEHOLDER = '{{AGENT_REVISIT_INTERVAL_HOURS}}';

const GUIDE_CACHE_TTL_SECONDS = 3600;
const GUIDE_CACHE_PREFIX = 'skynet:v1:agent-guide';
const GOVERNANCE_CACHE_PREFIX = 'skynet:v1:governance-guide';

const READ_AGENT_GUIDE_BOOTSTRAP_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return nil end
local decoded, record = pcall(cjson.decode, raw)
if not decoded or type(record) ~= 'table' or record.tokenHash ~= ARGV[1] then
  return nil
end
return raw
`;

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

type PublicAccessCacheConfig = Pick<
  PublicAccessConfigView,
  'siteOrigin' | 'apiBaseUrl' | 'version'
>;

@Injectable()
export class PublicAccessService {
  private readonly guideTemplate: string;
  private readonly governanceTemplate: string;
  private readonly templateHash: string;

  constructor(
    @InjectModel(PublicAccessConfig.name)
    private readonly configModel: Model<PublicAccessConfig>,
    private readonly redisService: RedisService,
    @InjectModel(Agent.name) private readonly agentModel: Model<Agent>,
  ) {
    this.guideTemplate = readFileSync(resolve(__dirname, 'guide.template.md'), 'utf8');
    this.governanceTemplate = readFileSync(resolve(__dirname, 'governance.template.md'), 'utf8');
    this.templateHash = createHash('sha256')
      .update(this.guideTemplate + this.governanceTemplate)
      .digest('hex');
  }

  async getPublicConfig(): Promise<PublicAccessConfigView> {
    const config = await this.configModel.findOne({ key: PUBLIC_ACCESS_CONFIG_KEY });
    if (!config) {
      const defaults = getDefaultPublicAccessAddresses();
      return {
        siteOrigin: defaults.siteOrigin,
        apiBaseUrl: defaults.apiBaseUrl,
        guideUrl: `${defaults.siteOrigin}/guide.md`,
        version: 0,
        updatedAt: null,
      };
    }
    return this.serialize(config);
  }

  serialize(config: PublicAccessConfig): PublicAccessConfigView {
    const siteOrigin = this.normalizeSiteOrigin(config.siteOrigin);
    return {
      siteOrigin,
      apiBaseUrl: derivePublicApiBaseUrl(siteOrigin),
      guideUrl: `${siteOrigin}/guide.md`,
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
    this.assertHttpLocalhostOnly(normalized, systemErrors.publicSiteOriginInvalid);
    return normalized.origin;
  }

  async renderAgentGuide(): Promise<RenderedAgentGuide> {
    const config = await this.getPublicConfig();
    return this.renderAgentGuideWithConfig(config);
  }

  private async renderAgentGuideWithConfig(
    config: PublicAccessConfigView,
  ): Promise<RenderedAgentGuide> {
    const cacheKey = this.getGuideCacheKey(config);
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

  async renderGovernanceGuide(): Promise<RenderedAgentGuide> {
    const config = await this.getPublicConfig();
    const cacheKey = this.getGovernanceGuideCacheKey(config);
    const redis = this.redisService.getClient();
    const cached = await redis.get(cacheKey);
    if (cached) return this.buildRenderedGuide(cached);

    const content = this.governanceTemplate
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

  async readBootstrap(token: string): Promise<RenderedAgentGuide> {
    const agentId = parseAgentGuideBootstrapAgentId(token);
    if (!agentId) throw systemErrors.bootstrapInvalid();
    const raw = await this.redisService
      .getClient()
      .eval(
        READ_AGENT_GUIDE_BOOTSTRAP_SCRIPT,
        1,
        getAgentGuideBootstrapRedisKey(agentId),
        hashOpaqueToken(token),
      );
    if (typeof raw !== 'string') throw systemErrors.guideBootstrapGone();
    const record = parseAgentGuideBootstrapRecord(raw);
    if (!record) throw systemErrors.bootstrapInvalid();
    if (Date.parse(record.expiresAt) <= Date.now()) {
      throw systemErrors.guideBootstrapGone();
    }
    const publicAccessConfig = await this.getPublicConfig();
    if (publicAccessConfig.version !== record.publicAccessVersion) {
      throw systemErrors.guideBootstrapGone();
    }
    const agent = await this.agentModel
      .findById(agentId)
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
    const guide = await this.renderAgentGuideWithConfig(publicAccessConfig);
    const content = this.substituteRevisitInterval(guide.content, record.revisitIntervalHours);
    return this.buildPersonalizedGuide(content, publicAccessConfig, agentKey);
  }

  private getGuideCacheKey(config: PublicAccessCacheConfig): string {
    return `${GUIDE_CACHE_PREFIX}:${this.templateHash}:config:${this.getPublicAccessCacheIdentity(config)}`;
  }

  private getGovernanceGuideCacheKey(config: PublicAccessCacheConfig): string {
    return `${GOVERNANCE_CACHE_PREFIX}:${this.templateHash}:config:${this.getPublicAccessCacheIdentity(config)}`;
  }

  private getPublicAccessCacheIdentity(config: PublicAccessCacheConfig): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          version: config.version,
          siteOrigin: config.siteOrigin,
          apiBaseUrl: config.apiBaseUrl,
        }),
      )
      .digest('hex');
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
      '请安全保存以下配置。',
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

  private parseHttpUrl(value: string, fieldName: string): URL {
    try {
      const url = new URL(value.trim());
      if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('protocol');
      return url;
    } catch {
      throw systemErrors.absoluteHttpUrlRequired(fieldName);
    }
  }

  private assertHttpLocalhostOnly(url: URL, invalidError: () => Error): void {
    if (url.protocol === 'http:' && url.hostname !== 'localhost') {
      throw invalidError();
    }
  }
}
