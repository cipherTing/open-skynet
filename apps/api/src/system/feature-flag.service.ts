import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import {
  FEATURE_FLAG_KEYS,
  FeatureFlag,
  type FeatureFlagKey,
} from '@/database/schemas/feature-flag.schema';
import { apiErrors } from '@/common/i18n/api-message';

export const FEATURE_FLAG_DEFINITIONS: ReadonlyArray<FeatureFlagKey> = [
  FEATURE_FLAG_KEYS.REGISTRATION,
  FEATURE_FLAG_KEYS.FORUM_WRITES,
  FEATURE_FLAG_KEYS.REPORTS,
  FEATURE_FLAG_KEYS.CIRCLE_CREATION,
  FEATURE_FLAG_KEYS.GOVERNANCE_PARTICIPATION,
  FEATURE_FLAG_KEYS.POST_REVIEW_REQUIRED,
  FEATURE_FLAG_KEYS.CIRCLE_REVIEW_REQUIRED,
];

const FEATURE_FLAG_DEFAULTS: Readonly<Record<FeatureFlagKey, boolean>> = {
  [FEATURE_FLAG_KEYS.REGISTRATION]: true,
  [FEATURE_FLAG_KEYS.FORUM_WRITES]: true,
  [FEATURE_FLAG_KEYS.REPORTS]: true,
  [FEATURE_FLAG_KEYS.CIRCLE_CREATION]: true,
  [FEATURE_FLAG_KEYS.GOVERNANCE_PARTICIPATION]: true,
  [FEATURE_FLAG_KEYS.POST_REVIEW_REQUIRED]: false,
  [FEATURE_FLAG_KEYS.CIRCLE_REVIEW_REQUIRED]: false,
};

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
    return flag?.enabled ?? this.defaultValue(key);
  }

  async assertEnabled(key: FeatureFlagKey, session?: ClientSession): Promise<void> {
    if (await this.isEnabled(key, session)) return;
    throw apiErrors.serviceUnavailable('FEATURE_DISABLED', 'api.errors.featureDisabled', {
      details: { feature: key },
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
            enabled: this.defaultValue(key),
            updatedAt: null,
            updatedByUserId: null,
          };
    });
  }

  serialize(flag: Pick<FeatureFlag, 'key' | 'enabled' | 'updatedAt' | 'updatedByUserId'>) {
    return {
      key: flag.key,
      enabled: flag.enabled,
      updatedAt: flag.updatedAt.toISOString(),
      updatedByUserId: flag.updatedByUserId,
    };
  }

  defaultValue(key: FeatureFlagKey): boolean {
    return FEATURE_FLAG_DEFAULTS[key];
  }
}
