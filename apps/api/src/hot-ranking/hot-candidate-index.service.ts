import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { Model, Types } from 'mongoose';
import {
  HOT_CANDIDATE_GENERATION_STATUSES,
  HotCandidateGeneration,
  type HotCandidateGenerationDocument,
} from '@/database/schemas/hot-candidate-generation.schema';
import { PostHotState } from '@/database/schemas/post-hot-state.schema';
import { RedisService } from '@/redis/redis.service';
import {
  HOT_CANDIDATE_ACTIVE_GENERATION_KEY,
  HOT_CANDIDATE_BUILDING_GENERATION_KEY,
  HOT_CANDIDATE_CLEANUP_BATCH_SIZE,
  HOT_CANDIDATE_JOB_KINDS,
  HOT_CANDIDATE_JOB_NAMES,
  HOT_CANDIDATE_REBUILD_BATCH_SIZE,
  HOT_DISPATCH_BATCH_SIZE,
  HOT_DISPATCH_RETRY_BASE_DELAY_MS,
  HOT_DISPATCH_RETRY_EXPONENT_CAP,
  HOT_DISPATCH_RETRY_MAX_DELAY_MS,
  HOT_FAILED_JOB_RETENTION,
  HOT_GENERATION_RECONCILE_BATCH_SIZE,
  HOT_GENERATION_CONSISTENCY_LIMIT,
  HOT_JOB_ATTEMPTS,
  HOT_JOB_BACKOFF_MS,
  HOT_INCREMENTAL_JOB_PRIORITY,
  HOT_MAINTENANCE_JOB_PRIORITY,
  HOT_RANKING_CANDIDATE_QUEUE,
  HOT_RANKING_CANDIDATE_MAINTENANCE_QUEUE,
  HOT_WORK_CLAIM_TTL_MS,
} from '@/hot-ranking/hot-ranking.constants';
import {
  candidateBuildMarkerKey,
  candidateManifestKey,
  candidateMetadataKey,
  candidateReadyKey,
  circleCandidateKeyPrefix,
  globalCandidateKey,
  readReadyCandidateGenerationId,
} from '@/hot-ranking/hot-candidate-keys';
import type {
  HotCandidateJob,
  HotCandidateMaintenanceJob,
} from '@/hot-ranking/hot-ranking.types';

const APPLY_CANDIDATE_MEMBER_SCRIPT = `
if redis.call('get', KEYS[4]) ~= '1' and redis.call('get', KEYS[5]) ~= ARGV[6] then
  return -1
end
local current = redis.call('hget', KEYS[1], ARGV[1])
if current then
  local separator = string.find(current, '|', 1, true)
  local currentVersion = tonumber(string.sub(current, 1, separator - 1))
  if currentVersion > tonumber(ARGV[2]) then
    return 0
  end
  local oldCircle = string.sub(current, separator + 1)
  if oldCircle ~= ARGV[4] then
    redis.call('srem', ARGV[5] .. oldCircle, ARGV[1])
  end
elseif ARGV[3] == '0' and tonumber(ARGV[2]) == 0 then
  return 0
end
local circleKey = ARGV[5] .. ARGV[4]
redis.call('hset', KEYS[1], ARGV[1], ARGV[2] .. '|' .. ARGV[4])
redis.call('sadd', KEYS[3], KEYS[1], KEYS[2], circleKey)
if ARGV[3] == '1' then
  redis.call('sadd', KEYS[2], ARGV[1])
  redis.call('sadd', circleKey, ARGV[1])
else
  redis.call('srem', KEYS[2], ARGV[1])
  redis.call('srem', circleKey, ARGV[1])
end
return 1
`;

const ACTIVATE_CANDIDATE_GENERATION_SCRIPT = `
if redis.call('get', KEYS[3]) ~= ARGV[1] then
  return 0
end
redis.call('set', KEYS[1], '1')
redis.call('set', KEYS[2], ARGV[1])
redis.call('del', KEYS[3])
redis.call('del', KEYS[4])
return 1
`;

const CLEAR_GENERATION_POINTER_SCRIPT = `
if redis.call('get', KEYS[1]) ~= ARGV[1] then
  return 0
end
redis.call('del', KEYS[1])
return 1
`;

interface CandidateStateSource {
  _id: Types.ObjectId;
  postId: string;
  circleId: string;
  postVisible: boolean;
  circleVisible: boolean;
  eligible: boolean;
  expiresAt: Date | null;
  candidateVersion: number;
}

function retryAt(attempts: number, now: Date): Date {
  const delay = Math.min(
    HOT_DISPATCH_RETRY_MAX_DELAY_MS,
    HOT_DISPATCH_RETRY_BASE_DELAY_MS *
      2 ** Math.min(Math.max(0, attempts - 1), HOT_DISPATCH_RETRY_EXPONENT_CAP),
  );
  return new Date(now.getTime() + delay);
}

function rebuildJobId(generationId: string, generationVersion: number): string {
  return `hot-rebuild-${generationId}-${generationVersion}`;
}

function cleanupJobId(generationId: string, generationVersion: number): string {
  return `hot-cleanup-${generationId}-${generationVersion}`;
}

@Injectable()
export class HotCandidateIndexService {
  constructor(
    @InjectQueue(HOT_RANKING_CANDIDATE_QUEUE)
    private readonly queue: Queue<HotCandidateJob>,
    @InjectQueue(HOT_RANKING_CANDIDATE_MAINTENANCE_QUEUE)
    private readonly maintenanceQueue: Queue<HotCandidateMaintenanceJob>,
    @InjectModel(PostHotState.name) private readonly stateModel: Model<PostHotState>,
    @InjectModel(HotCandidateGeneration.name)
    private readonly generationModel: Model<HotCandidateGeneration>,
    private readonly redisService: RedisService,
  ) {}

  async dispatchDirtyCandidates(): Promise<void> {
    if ((await this.findWritableGenerationIds()).length === 0) return;
    const now = new Date();
    const states = await this.stateModel
      .find({
        candidateDirty: true,
        $and: [
          {
            $or: [{ candidateDispatchAt: null }, { candidateDispatchAt: { $lte: now } }],
          },
          {
            $or: [{ candidateClaimedUntil: null }, { candidateClaimedUntil: { $lte: now } }],
          },
        ],
      })
      .sort({ candidateDispatchAt: 1, _id: 1 })
      .limit(HOT_DISPATCH_BATCH_SIZE)
      .select('_id postId candidateVersion candidateDispatchAttempts')
      .lean<
        Array<{
          _id: Types.ObjectId;
          postId: string;
          candidateVersion: number;
          candidateDispatchAttempts: number;
        }>
      >();

    for (const state of states) {
      const claimed = await this.stateModel.updateOne(
        {
          _id: state._id,
          candidateDirty: true,
          candidateVersion: state.candidateVersion,
          $or: [{ candidateClaimedUntil: null }, { candidateClaimedUntil: { $lte: now } }],
        },
        {
          $set: {
            candidateClaimedUntil: new Date(now.getTime() + HOT_WORK_CLAIM_TTL_MS),
            candidateDispatchAt: null,
          },
          $inc: { candidateDispatchAttempts: 1 },
        },
        { timestamps: false },
      );
      if (claimed.matchedCount !== 1) continue;
      try {
        await this.queue.add(
          HOT_CANDIDATE_JOB_NAMES.SYNC_POST,
          {
            kind: HOT_CANDIDATE_JOB_KINDS.SYNC_POST,
            postId: state.postId,
            candidateVersion: state.candidateVersion,
          },
          {
            attempts: HOT_JOB_ATTEMPTS,
            backoff: { type: 'exponential', delay: HOT_JOB_BACKOFF_MS },
            removeOnComplete: true,
            removeOnFail: HOT_FAILED_JOB_RETENTION,
            priority: HOT_INCREMENTAL_JOB_PRIORITY,
            deduplication: { id: `candidate:${state.postId}`, keepLastIfActive: true },
          },
        );
      } catch (error) {
        await this.stateModel.updateOne(
          { _id: state._id, candidateVersion: state.candidateVersion, candidateDirty: true },
          {
            $set: {
              candidateClaimedUntil: null,
              candidateDispatchAt: retryAt(state.candidateDispatchAttempts + 1, now),
            },
          },
          { timestamps: false },
        );
        throw error;
      }
    }
  }

  async syncCandidate(postId: string): Promise<void> {
    const state = await this.stateModel.findOne({ postId });
    if (!state) throw new Error(`候选同步对应的帖子热度状态不存在: ${postId}`);
    const generationIds = await this.findWritableGenerationIds();
    if (generationIds.length === 0) {
      await this.stateModel.updateOne(
        { _id: state._id, candidateDirty: true },
        {
          $set: {
            candidateClaimedUntil: null,
            candidateDispatchAt: retryAt(state.candidateDispatchAttempts, new Date()),
          },
        },
        { timestamps: false },
      );
      return;
    }
    for (const generationId of generationIds) {
      await this.applyCandidateMember(generationId, state);
    }
    await this.stateModel.updateOne(
      { _id: state._id, candidateVersion: state.candidateVersion },
      {
        $set: {
          candidateSyncedVersion: state.candidateVersion,
          candidateDirty: false,
          candidateDispatchAt: null,
          candidateClaimedUntil: null,
          candidateDispatchAttempts: 0,
        },
      },
      { timestamps: false },
    );
  }

  async ensureCandidateGeneration(): Promise<void> {
    await this.dispatchRetiredGenerationCleanup();
    const readyGeneration = await this.findReadyGeneration();
    if (!readyGeneration) {
      const activeGenerationExists = await this.generationModel.exists({
        status: HOT_CANDIDATE_GENERATION_STATUSES.ACTIVE,
      });
      if (activeGenerationExists) {
        throw new Error('热帖候选索引状态不一致：活跃代际缺少 Redis 就绪指针');
      }
    }
    const readyIsHealthy =
      readyGeneration !== null && (await this.reconcileActiveGeneration(readyGeneration));

    const redis = this.redisService.getClient();
    let building = await this.generationModel.findOne({
      status: HOT_CANDIDATE_GENERATION_STATUSES.BUILDING,
    });
    if (building) {
      const marker = await redis.get(candidateBuildMarkerKey(building.generationId));
      if (marker !== building.generationId) {
        throw new Error(`热帖候选索引状态不一致：构建代际缺少 Redis 标记 ${building.generationId}`);
      }
    }

    if (!building) {
      if (readyIsHealthy) return;
      const generationId = randomUUID();
      try {
        building = await this.generationModel.create({
          generationId,
          status: HOT_CANDIDATE_GENERATION_STATUSES.BUILDING,
          cursorStateId: null,
          version: 1,
          claimedUntil: null,
          activatedAt: null,
        });
      } catch (error) {
        const concurrent = await this.generationModel.findOne({
          status: HOT_CANDIDATE_GENERATION_STATUSES.BUILDING,
        });
        if (!concurrent) throw error;
        building = concurrent;
      }
      await redis.set(candidateBuildMarkerKey(building.generationId), building.generationId);
      await redis.sadd(
        candidateManifestKey(building.generationId),
        candidateBuildMarkerKey(building.generationId),
        candidateReadyKey(building.generationId),
        globalCandidateKey(building.generationId),
        candidateMetadataKey(building.generationId),
      );
    }
    await redis.set(HOT_CANDIDATE_BUILDING_GENERATION_KEY, building.generationId);
    await this.enqueueRebuildBatch(building.generationId, building.version);
  }

  async rebuildCandidateBatch(generationId: string, generationVersion: number): Promise<void> {
    const now = new Date();
    const generation = await this.generationModel.findOneAndUpdate(
      {
        generationId,
        status: HOT_CANDIDATE_GENERATION_STATUSES.BUILDING,
        version: generationVersion,
        $or: [{ claimedUntil: null }, { claimedUntil: { $lte: now } }],
      },
      { $set: { claimedUntil: new Date(now.getTime() + HOT_WORK_CLAIM_TTL_MS) } },
      { new: true },
    );
    if (!generation) return;
    const marker = await this.redisService.getClient().get(candidateBuildMarkerKey(generationId));
    if (marker !== generationId) {
      await this.generationModel.updateOne(
        { _id: generation._id, version: generationVersion },
        { $set: { claimedUntil: null } },
      );
      throw new Error(`热帖候选索引状态不一致：重建任务缺少 Redis 标记 ${generationId}`);
    }
    const cursorFilter = generation.cursorStateId
      ? { _id: { $gt: new Types.ObjectId(generation.cursorStateId) } }
      : {};
    const states = await this.stateModel
      .find({
        ...cursorFilter,
        postVisible: true,
        circleVisible: true,
        eligible: true,
      })
      .sort({ _id: 1 })
      .limit(HOT_CANDIDATE_REBUILD_BATCH_SIZE)
      .select(
        '_id postId circleId postVisible circleVisible eligible expiresAt candidateVersion',
      )
      .lean<CandidateStateSource[]>();
    for (const state of states) await this.applyCandidateMember(generationId, state);

    if (states.length < HOT_CANDIDATE_REBUILD_BATCH_SIZE) {
      await this.finalizeGeneration(generation);
      return;
    }
    const nextVersion = generation.version + 1;
    const advanced = await this.generationModel.updateOne(
      { _id: generation._id, version: generation.version },
      {
        $set: {
          cursorStateId: states[states.length - 1]._id.toString(),
          claimedUntil: null,
          version: nextVersion,
        },
      },
    );
    if (advanced.matchedCount === 1) await this.enqueueRebuildBatch(generationId, nextVersion);
  }

  async cleanupGeneration(generationId: string, generationVersion: number): Promise<void> {
    const now = new Date();
    const generation = await this.generationModel.findOneAndUpdate(
      {
        generationId,
        status: HOT_CANDIDATE_GENERATION_STATUSES.SUPERSEDED,
        version: generationVersion,
        $or: [{ claimedUntil: null }, { claimedUntil: { $lte: now } }],
      },
      { $set: { claimedUntil: new Date(now.getTime() + HOT_WORK_CLAIM_TTL_MS) } },
      { new: true },
    );
    if (!generation) return;
    const redis = this.redisService.getClient();
    const manifestKey = candidateManifestKey(generationId);
    const keys = await redis.srandmember(manifestKey, HOT_CANDIDATE_CLEANUP_BATCH_SIZE);
    if (keys.length === 0) {
      await redis.del(manifestKey);
      await this.generationModel.deleteOne({
        _id: generation._id,
        status: HOT_CANDIDATE_GENERATION_STATUSES.SUPERSEDED,
        version: generationVersion,
      });
      return;
    }
    await redis.unlink(...keys);
    await redis.srem(manifestKey, ...keys);
    if ((await redis.scard(manifestKey)) > 0) {
      const nextVersion = generationVersion + 1;
      const advanced = await this.generationModel.updateOne(
        {
          _id: generation._id,
          status: HOT_CANDIDATE_GENERATION_STATUSES.SUPERSEDED,
          version: generationVersion,
        },
        { $set: { version: nextVersion, claimedUntil: null } },
      );
      if (advanced.matchedCount === 1) {
        await this.enqueueGenerationCleanup(generationId, nextVersion);
      }
    } else {
      await redis.del(manifestKey);
      await this.generationModel.deleteOne({
        _id: generation._id,
        status: HOT_CANDIDATE_GENERATION_STATUSES.SUPERSEDED,
        version: generationVersion,
      });
    }
  }

  private async findReadyGeneration(): Promise<string | null> {
    return readReadyCandidateGenerationId(this.redisService.getClient());
  }

  private async findWritableGenerationIds(): Promise<string[]> {
    const redis = this.redisService.getClient();
    const [activeGeneration, buildingGeneration] = await Promise.all([
      this.findReadyGeneration(),
      redis.get(HOT_CANDIDATE_BUILDING_GENERATION_KEY),
    ]);
    if (
      buildingGeneration &&
      (await redis.get(candidateBuildMarkerKey(buildingGeneration))) !== buildingGeneration
    ) {
      throw new Error(
        `热帖候选索引状态不一致：构建代际缺少 Redis 标记 ${buildingGeneration}`,
      );
    }

    const generationIds = [
      ...new Set([activeGeneration, buildingGeneration].filter((id): id is string => Boolean(id))),
    ];
    const [pointerDocuments, activeDocuments] = await Promise.all([
      generationIds.length > 0
        ? this.generationModel
            .find({ generationId: { $in: generationIds } })
            .select('generationId status')
            .lean<Array<{ generationId: string; status: string }>>()
        : Promise.resolve([]),
      this.generationModel
        .find({
          status: {
            $in: [
              HOT_CANDIDATE_GENERATION_STATUSES.ACTIVE,
              HOT_CANDIDATE_GENERATION_STATUSES.BUILDING,
            ],
          },
        })
        .sort({ updatedAt: -1, _id: -1 })
        .limit(HOT_GENERATION_CONSISTENCY_LIMIT)
        .select('generationId status')
        .lean<Array<{ generationId: string; status: string }>>(),
    ]);
    const documentByGenerationId = new Map(
      pointerDocuments.map((document) => [document.generationId, document]),
    );

    if (activeGeneration) {
      const activeDocument = documentByGenerationId.get(activeGeneration);
      if (
        !activeDocument ||
        (activeDocument.status !== HOT_CANDIDATE_GENERATION_STATUSES.ACTIVE &&
          activeDocument.status !== HOT_CANDIDATE_GENERATION_STATUSES.BUILDING)
      ) {
        throw new Error(
          `热帖候选索引状态不一致：Redis 活跃代际无有效 MongoDB 状态 ${activeGeneration}`,
        );
      }
    } else if (
      activeDocuments.some(
        (document) => document.status === HOT_CANDIDATE_GENERATION_STATUSES.ACTIVE,
      )
    ) {
      throw new Error('热帖候选索引状态不一致：活跃代际缺少 Redis 指针');
    }

    if (buildingGeneration) {
      const buildingDocument = documentByGenerationId.get(buildingGeneration);
      if (buildingDocument?.status !== HOT_CANDIDATE_GENERATION_STATUSES.BUILDING) {
        throw new Error(
          `热帖候选索引状态不一致：Redis 构建代际无有效 MongoDB 状态 ${buildingGeneration}`,
        );
      }
    } else if (
      activeDocuments.some(
        (document) =>
          document.status === HOT_CANDIDATE_GENERATION_STATUSES.BUILDING &&
          document.generationId !== activeGeneration,
      )
    ) {
      throw new Error('热帖候选索引状态不一致：构建代际缺少 Redis 指针');
    }

    return generationIds;
  }

  private async applyCandidateMember(
    generationId: string,
    state: Pick<
      PostHotState,
      | 'postId'
      | 'circleId'
      | 'postVisible'
      | 'circleVisible'
      | 'eligible'
      | 'expiresAt'
      | 'candidateVersion'
    >,
  ): Promise<void> {
    const eligible =
      state.postVisible &&
      state.circleVisible &&
      state.eligible &&
      state.expiresAt !== null &&
      state.expiresAt.getTime() > Date.now();
    const applied = await this.redisService
      .getClient()
      .eval(
        APPLY_CANDIDATE_MEMBER_SCRIPT,
        5,
        candidateMetadataKey(generationId),
        globalCandidateKey(generationId),
        candidateManifestKey(generationId),
        candidateReadyKey(generationId),
        candidateBuildMarkerKey(generationId),
        state.postId,
        state.candidateVersion.toString(),
        eligible ? '1' : '0',
        state.circleId,
        circleCandidateKeyPrefix(generationId),
        generationId,
      );
    if (applied === -1) {
      throw new Error(`候选代际已失效: ${generationId}`);
    }
  }

  private async enqueueRebuildBatch(
    generationId: string,
    generationVersion: number,
  ): Promise<void> {
    await this.maintenanceQueue.add(
      HOT_CANDIDATE_JOB_NAMES.REBUILD_BATCH,
      {
        kind: HOT_CANDIDATE_JOB_KINDS.REBUILD_BATCH,
        generationId,
        generationVersion,
      },
      {
        jobId: rebuildJobId(generationId, generationVersion),
        attempts: HOT_JOB_ATTEMPTS,
        backoff: { type: 'exponential', delay: HOT_JOB_BACKOFF_MS },
        removeOnComplete: true,
        removeOnFail: HOT_FAILED_JOB_RETENTION,
        priority: HOT_MAINTENANCE_JOB_PRIORITY,
      },
    );
  }

  private async enqueueGenerationCleanup(
    generationId: string,
    generationVersion: number,
  ): Promise<void> {
    await this.maintenanceQueue.add(
      HOT_CANDIDATE_JOB_NAMES.CLEANUP_GENERATION,
      {
        kind: HOT_CANDIDATE_JOB_KINDS.CLEANUP_GENERATION,
        generationId,
        generationVersion,
      },
      {
        jobId: cleanupJobId(generationId, generationVersion),
        attempts: HOT_JOB_ATTEMPTS,
        backoff: { type: 'exponential', delay: HOT_JOB_BACKOFF_MS },
        removeOnComplete: true,
        removeOnFail: HOT_FAILED_JOB_RETENTION,
        priority: HOT_MAINTENANCE_JOB_PRIORITY,
      },
    );
  }

  private async finalizeGeneration(generation: HotCandidateGenerationDocument): Promise<void> {
    const redis = this.redisService.getClient();
    const previousActive = await redis.get(HOT_CANDIDATE_ACTIVE_GENERATION_KEY);
    const activated = await redis.eval(
      ACTIVATE_CANDIDATE_GENERATION_SCRIPT,
      4,
      candidateReadyKey(generation.generationId),
      HOT_CANDIDATE_ACTIVE_GENERATION_KEY,
      HOT_CANDIDATE_BUILDING_GENERATION_KEY,
      candidateBuildMarkerKey(generation.generationId),
      generation.generationId,
    );
    if (activated !== 1) {
      throw new Error(`候选代际原子切换失败: ${generation.generationId}`);
    }
    const nextVersion = generation.version + 1;
    const generationUpdated = await this.generationModel.updateOne(
      {
        _id: generation._id,
        status: HOT_CANDIDATE_GENERATION_STATUSES.BUILDING,
        version: generation.version,
      },
      {
        $set: {
          status: HOT_CANDIDATE_GENERATION_STATUSES.ACTIVE,
          activatedAt: new Date(),
          claimedUntil: null,
          version: nextVersion,
        },
      },
    );
    if (generationUpdated.matchedCount !== 1) {
      throw new Error(`候选代际状态发生并发变化: ${generation.generationId}`);
    }
    if (previousActive && previousActive !== generation.generationId) {
      const previous = await this.generationModel.findOneAndUpdate(
        { generationId: previousActive },
        {
          $set: {
            status: HOT_CANDIDATE_GENERATION_STATUSES.SUPERSEDED,
            claimedUntil: null,
          },
        },
        { new: true },
      );
      if (previous) await this.retireGeneration(previous);
    }
  }

  private async reconcileActiveGeneration(generationId: string): Promise<boolean> {
    const active = await this.generationModel.findOne({ generationId });
    if (!active || active.status === HOT_CANDIDATE_GENERATION_STATUSES.SUPERSEDED) {
      throw new Error(`热帖候选索引状态不一致：Redis 活跃代际无有效 MongoDB 状态 ${generationId}`);
    }

    if (active.status === HOT_CANDIDATE_GENERATION_STATUSES.BUILDING) {
      const activated = await this.generationModel.updateOne(
        {
          _id: active._id,
          status: HOT_CANDIDATE_GENERATION_STATUSES.BUILDING,
          version: active.version,
        },
        {
          $set: {
            status: HOT_CANDIDATE_GENERATION_STATUSES.ACTIVE,
            activatedAt: active.activatedAt ?? new Date(),
            claimedUntil: null,
          },
        },
      );
      if (activated.matchedCount !== 1) return false;
    }

    const obsoleteGenerations = await this.generationModel
      .find({
        generationId: { $ne: generationId },
        status: HOT_CANDIDATE_GENERATION_STATUSES.ACTIVE,
      })
      .sort({ updatedAt: 1, _id: 1 })
      .limit(HOT_GENERATION_RECONCILE_BATCH_SIZE);
    for (const obsolete of obsoleteGenerations) {
      const retired = await this.generationModel.findOneAndUpdate(
        {
          _id: obsolete._id,
          status: obsolete.status,
          version: obsolete.version,
        },
        {
          $set: {
            status: HOT_CANDIDATE_GENERATION_STATUSES.SUPERSEDED,
            claimedUntil: null,
          },
        },
        { new: true },
      );
      if (retired) await this.retireGeneration(retired);
    }
    return true;
  }

  private async retireGeneration(generation: HotCandidateGenerationDocument): Promise<void> {
    const redis = this.redisService.getClient();
    await redis.unlink(
      candidateReadyKey(generation.generationId),
      candidateBuildMarkerKey(generation.generationId),
    );
    await redis.eval(
      CLEAR_GENERATION_POINTER_SCRIPT,
      1,
      HOT_CANDIDATE_BUILDING_GENERATION_KEY,
      generation.generationId,
    );
    await this.enqueueGenerationCleanup(generation.generationId, generation.version);
  }

  private async dispatchRetiredGenerationCleanup(): Promise<void> {
    const retired = await this.generationModel
      .find({ status: HOT_CANDIDATE_GENERATION_STATUSES.SUPERSEDED })
      .sort({ updatedAt: 1, _id: 1 })
      .limit(HOT_GENERATION_RECONCILE_BATCH_SIZE);
    for (const generation of retired) {
      await this.retireGeneration(generation);
    }
  }

}
