import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { transformDocumentId } from '@/database/schema-transform';

export const PUBLIC_ACCESS_CONFIG_KEY = 'PUBLIC_ACCESS';

export type PublicAccessConfigDocument = HydratedDocument<PublicAccessConfig>;

@Schema({
  timestamps: true,
  collection: 'public_access_configs',
  toJSON: { virtuals: true, transform: transformDocumentId },
  toObject: { virtuals: true, transform: transformDocumentId },
})
export class PublicAccessConfig {
  id!: string;

  @Prop({ type: String, required: true, immutable: true, default: PUBLIC_ACCESS_CONFIG_KEY })
  key!: typeof PUBLIC_ACCESS_CONFIG_KEY;

  @Prop({ type: String, required: true })
  siteOrigin!: string;

  @Prop({ type: String, required: true })
  apiBaseUrl!: string;

  @Prop({ type: Number, required: true, min: 1, default: 1 })
  version!: number;

  @Prop({ type: String, required: true, select: false })
  updatedByUserId!: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export const PublicAccessConfigSchema = SchemaFactory.createForClass(PublicAccessConfig);

PublicAccessConfigSchema.index({ key: 1 }, { unique: true, name: 'uq_public_access_config_key' });
