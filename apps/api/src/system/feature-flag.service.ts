import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import {
  FEATURE_FLAG_KEYS,
  FeatureFlag,
  type FeatureFlagKey,
} from '@/database/schemas/feature-flag.schema';

export const FEATURE_FLAG_DEFINITIONS: ReadonlyArray<FeatureFlagKey> = [
  FEATURE_FLAG_KEYS.REGISTRATION,
  FEATURE_FLAG_KEYS.FORUM_WRITES,
  FEATURE_FLAG_KEYS.REPORTS,
  FEATURE_FLAG_KEYS.CIRCLE_CREATION,
  FEATURE_FLAG_KEYS.GOVERNANCE_PARTICIPATION,
];

@Injectable()
export class FeatureFlagService {
  constructor(
    @InjectModel(FeatureFlag.name)
    private readonly featureFlagModel: Model<FeatureFlag>,
  ) {}

  async isEnabled(key: FeatureFlagKey, session?: ClientSession): Promise<boolean> {
    const flag = await this.featureFlagModel
      .findOne({ key }, 'enabled', { session })
      .lean();
    return flag?.enabled ?? true;
  }

  async assertEnabled(key: FeatureFlagKey, session?: ClientSession): Promise<void> {
    if (await this.isEnabled(key, session)) return;
    throw new ServiceUnavailableException({
      code: 'FEATURE_DISABLED',
      message: `功能 ${key} 当前已由管理员暂停`,
      feature: key,
    });
  }

  async list() {
    const stored = await this.featureFlagModel.find().lean();
    const byKey = new Map(stored.map((flag) => [flag.key, flag]));
    return FEATURE_FLAG_DEFINITIONS.map((key) => {
      const flag = byKey.get(key);
      return flag
        ? this.serialize(flag)
        : {
            key,
            enabled: true,
            reason: null,
            reviewAt: null,
            updatedAt: null,
            updatedByUserId: null,
          };
    });
  }

  serialize(flag: Pick<FeatureFlag, 'key' | 'enabled' | 'reason' | 'reviewAt' | 'updatedAt' | 'updatedByUserId'>) {
    return {
      key: flag.key,
      enabled: flag.enabled,
      reason: flag.reason,
      reviewAt: flag.reviewAt?.toISOString() ?? null,
      updatedAt: flag.updatedAt.toISOString(),
      updatedByUserId: flag.updatedByUserId,
    };
  }
}
