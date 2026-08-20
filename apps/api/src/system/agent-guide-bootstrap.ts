export const AGENT_GUIDE_BOOTSTRAP_TTL_SECONDS = 30 * 60;

const AGENT_GUIDE_BOOTSTRAP_REDIS_PREFIX = 'agent-guide-bootstrap';
const BOOTSTRAP_AGENT_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/u;
const MAX_BOOTSTRAP_TOKEN_LENGTH = 512;

export interface AgentGuideBootstrapRecord {
  tokenHash: string;
  tokenCiphertext: string;
  expiresAt: string;
  keyVersion: number;
  publicAccessVersion: number;
  revisitIntervalHours: number;
}

export function getAgentGuideBootstrapRedisKey(agentId: string): string {
  return `${AGENT_GUIDE_BOOTSTRAP_REDIS_PREFIX}:${agentId}`;
}

export function parseAgentGuideBootstrapAgentId(token: string): string | null {
  if (!token || token.length > MAX_BOOTSTRAP_TOKEN_LENGTH) return null;
  const separator = token.indexOf('.');
  if (separator <= 0 || separator === token.length - 1) return null;
  const agentId = token.slice(0, separator);
  return BOOTSTRAP_AGENT_ID_PATTERN.test(agentId) ? agentId : null;
}

export function parseAgentGuideBootstrapRecord(
  raw: string,
): AgentGuideBootstrapRecord | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.tokenHash !== 'string' ||
    typeof record.tokenCiphertext !== 'string' ||
    record.tokenCiphertext.length === 0 ||
    typeof record.expiresAt !== 'string' ||
    !Number.isFinite(Date.parse(record.expiresAt)) ||
    !Number.isInteger(record.keyVersion) ||
    Number(record.keyVersion) < 1 ||
    !Number.isInteger(record.publicAccessVersion) ||
    Number(record.publicAccessVersion) < 0 ||
    !Number.isInteger(record.revisitIntervalHours) ||
    Number(record.revisitIntervalHours) < 1
  ) {
    return null;
  }
  return {
    tokenHash: record.tokenHash,
    tokenCiphertext: record.tokenCiphertext,
    expiresAt: record.expiresAt,
    keyVersion: Number(record.keyVersion),
    publicAccessVersion: Number(record.publicAccessVersion),
    revisitIntervalHours: Number(record.revisitIntervalHours),
  };
}
