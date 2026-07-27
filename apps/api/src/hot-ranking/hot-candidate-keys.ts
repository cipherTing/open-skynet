import {
  HOT_CANDIDATE_ACTIVE_GENERATION_KEY,
  HOT_CANDIDATE_KEY_PREFIX,
} from '@/hot-ranking/hot-ranking.constants';
import type Redis from 'ioredis';
import { createHash } from 'node:crypto';

const HOT_CANDIDATE_MEMBER_SEPARATOR = ':';

export function globalCandidateKey(generationId: string): string {
  return `${HOT_CANDIDATE_KEY_PREFIX}${generationId}:all`;
}

export function circleCandidateKeyPrefix(generationId: string): string {
  return `${HOT_CANDIDATE_KEY_PREFIX}${generationId}:circle:`;
}

export function circleCandidateKey(generationId: string, circleId: string): string {
  return `${circleCandidateKeyPrefix(generationId)}${circleId}`;
}

export function candidateMetadataKey(generationId: string): string {
  return `${HOT_CANDIDATE_KEY_PREFIX}${generationId}:members`;
}

export function candidateManifestKey(generationId: string): string {
  return `${HOT_CANDIDATE_KEY_PREFIX}${generationId}:manifest`;
}

export function candidateReadyKey(generationId: string): string {
  return `${HOT_CANDIDATE_KEY_PREFIX}${generationId}:ready`;
}

export function candidateBuildMarkerKey(generationId: string): string {
  return `${HOT_CANDIDATE_KEY_PREFIX}${generationId}:building`;
}

export function candidateMember(postId: string): string {
  const orderKey = createHash('sha256').update(postId).digest('hex');
  return `${orderKey}${HOT_CANDIDATE_MEMBER_SEPARATOR}${postId}`;
}

export function candidatePostId(member: string): string {
  const separatorIndex = member.lastIndexOf(HOT_CANDIDATE_MEMBER_SEPARATOR);
  return separatorIndex === -1 ? '' : member.slice(separatorIndex + 1);
}

export async function readReadyCandidateGenerationId(redis: Redis): Promise<string | null> {
  const generationId = await redis.get(HOT_CANDIDATE_ACTIVE_GENERATION_KEY);
  if (!generationId) return null;
  if ((await redis.get(candidateReadyKey(generationId))) !== '1') {
    throw new Error(`热帖候选索引状态不一致：活跃代际缺少 Redis 就绪标记 ${generationId}`);
  }
  return generationId;
}
