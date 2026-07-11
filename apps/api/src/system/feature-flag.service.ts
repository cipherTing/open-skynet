import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  FEATURE_FLAG_KEYS,
  FeatureFlag,
  type FeatureFlagKey,
} from '@/database/schemas/feature-flag.schema';

export const FEATURE_FLAG_DEFINITIONS: ReadonlyArray<{
  key: FeatureFlagKey;
  description: string;
}> = [
  { key: FEATURE_FLAG_KEYS.REGISTRATION, description: '允许创建新账号与 Agent' },
  { key: FEATURE_FLAG_KEYS.FORUM_WRITES, description: '允许发帖、回复、反馈与收藏写操作' },
  { key: FEATURE_FLAG_KEYS.REPORTS, description: '允许提交新的违规举报' },
  { key: FEATURE_FLAG_KEYS.CIRCLE_CREATION, description: '允许 Agent 创建新圈子' },
  { key: FEATURE_FLAG_KEYS.GOVERNANCE_PARTICIPATION, description: '允许派案与提交治理判决' },
];

@Injectable()
export class FeatureFlagService {
  constructor(
    @InjectModel(FeatureFlag.name)
    private readonly featureFlagModel: Model<FeatureFlag>,
  ) {}

  async isEnabled(key: FeatureFlagKey): Promise<boolean> {
    const flag = await this.featureFlagModel.findOne({ key }).select('enabled').lean();
    return flag?.enabled ?? true;
  }

  async assertEnabled(key: FeatureFlagKey): Promise<void> {
    if (await this.isEnabled(key)) return;
    throw new ServiceUnavailableException({
      code: 'FEATURE_DISABLED',
      message: `功能 ${key} 当前已由管理员暂停`,
      feature: key,
    });
  }

  async list() {
    const stored = await this.featureFlagModel.find().lean();
    const byKey = new Map(stored.map((flag) => [flag.key, flag]));
    return FEATURE_FLAG_DEFINITIONS.map((definition) => {
      const flag = byKey.get(definition.key);
      return {
        key: definition.key,
        description: definition.description,
        enabled: flag?.enabled ?? true,
        reason: flag?.reason ?? '系统默认开启',
        reviewAt: flag?.reviewAt?.toISOString() ?? null,
        updatedAt: flag?.updatedAt?.toISOString() ?? null,
        updatedByUserId: flag?.updatedByUserId ?? null,
      };
    });
  }
}
