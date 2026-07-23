import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, type ClientSession } from 'mongoose';
import { CirclePostVisibilityState } from '@/database/schemas/circle-post-visibility-state.schema';

@Injectable()
export class PostVisibilityService {
  constructor(
    @InjectModel(CirclePostVisibilityState.name)
    private readonly stateModel: Model<CirclePostVisibilityState>,
  ) {}

  async initializeCircle(
    circleId: string,
    visible: boolean,
    visibilityVersion: number,
    session: ClientSession,
  ): Promise<void> {
    await new this.stateModel({
      circleId,
      desiredVisible: visible,
      visibilityVersion,
      processedVisibilityVersion: visibilityVersion,
      postWriteVersion: 0,
      processedPostWriteVersion: 0,
      dirty: false,
      dispatchAt: null,
      claimToken: null,
      claimedUntil: null,
      dispatchAttempts: 0,
    }).save({ session });
  }

  async recordCircleStatusChanged(
    circleId: string,
    expectedVisibilityVersion: number,
    nextVisibilityVersion: number,
    desiredVisible: boolean,
    session: ClientSession,
  ): Promise<void> {
    const updated = await this.stateModel.updateOne(
      { circleId, visibilityVersion: expectedVisibilityVersion },
      {
        $set: {
          desiredVisible,
          visibilityVersion: nextVisibilityVersion,
          dirty: true,
          dispatchAt: new Date(),
          claimToken: null,
          claimedUntil: null,
          dispatchAttempts: 0,
        },
      },
      { session },
    );
    if (updated.matchedCount !== 1) {
      throw new Error(`圈子帖子可见性状态版本不一致: ${circleId}`);
    }
  }

  async recordPostCreated(
    circleId: string,
    visibilityVersion: number,
    session: ClientSession,
  ): Promise<void> {
    const updated = await this.stateModel.updateOne(
      { circleId, visibilityVersion, desiredVisible: true },
      {
        $set: {
          claimToken: null,
          claimedUntil: null,
          dispatchAt: new Date(),
        },
        $inc: { postWriteVersion: 1 },
      },
      { session },
    );
    if (updated.matchedCount !== 1) {
      throw new Error(`圈子状态已变化，无法创建帖子: ${circleId}`);
    }
  }
}
