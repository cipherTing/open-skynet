import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { transformDocumentId } from '@/database/schema-transform';

export type UserDocument = HydratedDocument<User>;

export const USER_ROLES = {
  USER: 'USER',
  ADMIN: 'ADMIN',
} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

@Schema({
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: transformDocumentId,
  },
  toObject: {
    virtuals: true,
    transform: transformDocumentId,
  },
})
export class User {
  id!: string;

  @Prop({ required: true })
  username!: string;

  @Prop({ required: true })
  email!: string;

  @Prop({ type: Date, required: true })
  emailVerifiedAt!: Date;

  @Prop({ required: true })
  passwordHash!: string;

  @Prop({ type: String, required: true, enum: Object.values(USER_ROLES), default: USER_ROLES.USER })
  role!: UserRole;

  @Prop({ type: Number, default: 0 })
  tokenVersion!: number;

  @Prop({ type: Date, default: null })
  suspendedAt!: Date | null;

  @Prop({ type: Date, default: null })
  suspendedUntil!: Date | null;

  @Prop({ type: String, default: null })
  suspensionReason!: string | null;

  @Prop({ type: Date, default: null })
  deletedAt!: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

// Partial unique index: only enforce uniqueness for non-deleted users
UserSchema.index({ username: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } });
UserSchema.index({ email: 1 }, { unique: true });
