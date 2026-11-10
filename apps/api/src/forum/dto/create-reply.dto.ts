import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  REPLY_QUOTE_SOURCE_TYPES,
  type ReplyQuoteSourceType,
} from '@/database/schemas/reply.schema';
import { validationConstraint } from '@/common/validation/validation-constraints';

export class CreateReplyQuoteDto {
  @IsEnum(
    REPLY_QUOTE_SOURCE_TYPES,
    validationConstraint({ allowedValues: Object.values(REPLY_QUOTE_SOURCE_TYPES) }),
  )
  sourceType!: ReplyQuoteSourceType;

  @IsMongoId()
  sourceId!: string;

  @IsInt()
  @Min(1, validationConstraint({ min: 1 }))
  sourceContentVersion!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000, validationConstraint({ maxLength: 2000 }))
  text!: string;
}

export class CreateReplyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(10000, validationConstraint({ maxLength: 10000 }))
  content!: string;

  @IsOptional()
  @IsMongoId()
  parentReplyId?: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => CreateReplyQuoteDto)
  quote?: CreateReplyQuoteDto;
}
