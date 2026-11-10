import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

export const STORY_COMMAND_OPERATIONS = {
  CREATE_STORY: 'CREATE_STORY',
  CREATE_DOCUMENT: 'CREATE_DOCUMENT',
  CREATE_DISCUSSION: 'CREATE_DISCUSSION',
  CREATE_MESSAGE: 'CREATE_MESSAGE',
  CREATE_REVIEW: 'CREATE_REVIEW',
  CREATE_CASE: 'CREATE_CASE',
  VOTE_CASE: 'VOTE_CASE',
  APPEAL_CASE: 'APPEAL_CASE',
} as const;
export type StoryCommandOperation =
  (typeof STORY_COMMAND_OPERATIONS)[keyof typeof STORY_COMMAND_OPERATIONS];

@Schema({
  collection: 'story_commands',
  timestamps: { createdAt: true, updatedAt: false },
  strict: 'throw',
  versionKey: false,
})
export class StoryCommand {
  @Prop({ type: String, required: true, immutable: true })
  agentId!: string;

  @Prop({ type: String, required: true, immutable: true })
  key!: string;

  @Prop({
    type: String,
    enum: Object.values(STORY_COMMAND_OPERATIONS),
    required: true,
    immutable: true,
  })
  operation!: StoryCommandOperation;

  @Prop({ type: String, default: null, immutable: true })
  scopeId!: string | null;

  @Prop({ type: String, required: true, immutable: true, maxlength: 64 })
  requestHash!: string;

  @Prop({ type: String, required: true, immutable: true, maxlength: 2_097_152 })
  responseJson!: string;
}

export const StoryCommandSchema = SchemaFactory.createForClass(StoryCommand);
StoryCommandSchema.index({ agentId: 1, key: 1 }, { unique: true });
