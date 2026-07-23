import { randomUUID } from 'node:crypto';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Queue } from 'bullmq';
import { Model, Types } from 'mongoose';
import { CirclePostVisibilityState } from '@/database/schemas/circle-post-visibility-state.schema';
import {
  POST_VISIBILITY_CLAIM_TTL_MS,
  POST_VISIBILITY_COMPLETED_RETENTION,
  POST_VISIBILITY_CONTROL_JOB_PRIORITY,
  POST_VISIBILITY_DISPATCH_BATCH_SIZE,
  POST_VISIBILITY_DISPATCH_INTERVAL_MS,
  POST_VISIBILITY_FAILED_RETENTION,
  POST_VISIBILITY_JOB_ATTEMPTS,
  POST_VISIBILITY_JOB_BACKOFF_JITTER,
  POST_VISIBILITY_JOB_BACKOFF_MS,
  POST_VISIBILITY_JOB_KINDS,
  POST_VISIBILITY_JOB_NAMES,
  POST_VISIBILITY_PROJECTION_JOB_PRIORITY,
  POST_VISIBILITY_QUEUE,
  POST_VISIBILITY_RETRY_BASE_DELAY_MS,
  POST_VISIBILITY_RETRY_EXPONENT_CAP,
  POST_VISIBILITY_RETRY_MAX_DELAY_MS,
  POST_VISIBILITY_SCHEDULER_ID,
  getPostVisibilityDeduplicationId,
  type PostVisibilityJob,
} from '@/post-visibility/post-visibility.constants';

interface VisibilityDispatchCandidate {
  _id: Types.ObjectId;
  circleId: string;
  visibilityVersion: number;
  postWriteVersion: number;
  dispatchAttempts: number;
}

function retryAt(attempts: number, now: Date): Date {
  const delay = Math.min(
    POST_VISIBILITY_RETRY_MAX_DELAY_MS,
    POST_VISIBILITY_RETRY_BASE_DELAY_MS *
      2 ** Math.min(Math.max(0, attempts - 1), POST_VISIBILITY_RETRY_EXPONENT_CAP),
  );
  return new Date(now.getTime() + delay);
}

@Injectable()
export class PostVisibilityPublisher implements OnModuleInit {
  constructor(
    @InjectQueue(POST_VISIBILITY_QUEUE)
    private readonly queue: Queue<PostVisibilityJob>,
    @InjectModel(CirclePostVisibilityState.name)
    private readonly stateModel: Model<CirclePostVisibilityState>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      POST_VISIBILITY_SCHEDULER_ID,
      { every: POST_VISIBILITY_DISPATCH_INTERVAL_MS },
      {
        name: POST_VISIBILITY_JOB_NAMES.DISPATCH,
        data: { kind: POST_VISIBILITY_JOB_KINDS.DISPATCH },
        opts: {
          attempts: POST_VISIBILITY_JOB_ATTEMPTS,
          backoff: {
            type: 'exponential',
            delay: POST_VISIBILITY_JOB_BACKOFF_MS,
            jitter: POST_VISIBILITY_JOB_BACKOFF_JITTER,
          },
          removeOnComplete: POST_VISIBILITY_COMPLETED_RETENTION,
          removeOnFail: POST_VISIBILITY_FAILED_RETENTION,
          priority: POST_VISIBILITY_CONTROL_JOB_PRIORITY,
        },
      },
    );
  }

  async dispatchPendingBatch(): Promise<void> {
    const now = new Date();
    const candidates = await this.stateModel
      .find({
        dirty: true,
        $and: [
          { $or: [{ dispatchAt: null }, { dispatchAt: { $lte: now } }] },
          { $or: [{ claimedUntil: null }, { claimedUntil: { $lte: now } }] },
        ],
      })
      .sort({ dispatchAt: 1, _id: 1 })
      .limit(POST_VISIBILITY_DISPATCH_BATCH_SIZE)
      .select('_id circleId visibilityVersion postWriteVersion dispatchAttempts')
      .lean<VisibilityDispatchCandidate[]>();

    for (const candidate of candidates) {
      const claimToken = randomUUID();
      const claimed = await this.stateModel.updateOne(
        {
          _id: candidate._id,
          dirty: true,
          visibilityVersion: candidate.visibilityVersion,
          postWriteVersion: candidate.postWriteVersion,
          $or: [{ claimedUntil: null }, { claimedUntil: { $lte: now } }],
        },
        {
          $set: {
            claimToken,
            claimedUntil: new Date(now.getTime() + POST_VISIBILITY_CLAIM_TTL_MS),
            dispatchAt: null,
          },
          $inc: { dispatchAttempts: 1 },
        },
      );
      if (claimed.matchedCount !== 1) continue;

      try {
        await this.queue.add(
          POST_VISIBILITY_JOB_NAMES.PROJECT_CIRCLE,
          {
            kind: POST_VISIBILITY_JOB_KINDS.PROJECT_CIRCLE,
            circleId: candidate.circleId,
            visibilityVersion: candidate.visibilityVersion,
            postWriteVersion: candidate.postWriteVersion,
            claimToken,
          },
          {
            attempts: POST_VISIBILITY_JOB_ATTEMPTS,
            backoff: {
              type: 'exponential',
              delay: POST_VISIBILITY_JOB_BACKOFF_MS,
              jitter: POST_VISIBILITY_JOB_BACKOFF_JITTER,
            },
            removeOnComplete: POST_VISIBILITY_COMPLETED_RETENTION,
            removeOnFail: POST_VISIBILITY_FAILED_RETENTION,
            priority: POST_VISIBILITY_PROJECTION_JOB_PRIORITY,
            deduplication: {
              id: getPostVisibilityDeduplicationId(candidate.circleId),
              keepLastIfActive: true,
            },
          },
        );
      } catch (error) {
        await this.stateModel.updateOne(
          {
            _id: candidate._id,
            visibilityVersion: candidate.visibilityVersion,
            postWriteVersion: candidate.postWriteVersion,
            claimToken,
          },
          {
            $set: {
              claimToken: null,
              claimedUntil: null,
              dispatchAt: retryAt(candidate.dispatchAttempts + 1, now),
            },
          },
        );
        throw error;
      }
    }
  }
}
