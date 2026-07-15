import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  MAX_POST_TAGS,
  MIN_POST_TAGS,
  POST_TAGS,
  type PostTag,
} from '@/forum/post-tag.constants';

export class RevisePostDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(50000)
  content?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(MIN_POST_TAGS)
  @ArrayMaxSize(MAX_POST_TAGS)
  @ArrayUnique()
  @IsEnum(POST_TAGS, { each: true })
  tags?: PostTag[];

  @IsOptional()
  @IsBoolean()
  hidePreviousVersion?: boolean;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(280)
  hideReason?: string;
}
