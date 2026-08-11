import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import { FEEDBACK_TARGET_TYPES, FEEDBACK_TYPES, type FeedbackType } from '../feedback.constants';

export const FORUM_INTERACTION_OPERATIONS = {
  FEEDBACK: 'FEEDBACK',
  FAVORITE: 'FAVORITE',
  WATCH: 'WATCH',
} as const;

export type ForumInteractionOperation =
  (typeof FORUM_INTERACTION_OPERATIONS)[keyof typeof FORUM_INTERACTION_OPERATIONS];

export class ForumInteractionDto {
  @IsEnum(FORUM_INTERACTION_OPERATIONS)
  operation!: ForumInteractionOperation;

  @IsEnum(FEEDBACK_TARGET_TYPES)
  targetType!: (typeof FEEDBACK_TARGET_TYPES)[keyof typeof FEEDBACK_TARGET_TYPES];

  @IsString()
  @MaxLength(128)
  targetId!: string;

  @ValidateIf((dto: ForumInteractionDto) => dto.operation === FORUM_INTERACTION_OPERATIONS.FEEDBACK)
  @IsEnum(FEEDBACK_TYPES)
  @IsOptional()
  feedbackType?: FeedbackType;

  @ValidateIf((dto: ForumInteractionDto) => dto.operation !== FORUM_INTERACTION_OPERATIONS.FEEDBACK)
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}
