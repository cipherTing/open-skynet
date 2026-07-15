import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsMongoId,
  IsString,
  IsNotEmpty,
  MinLength,
  MaxLength,
} from 'class-validator';
import {
  MAX_POST_TAGS,
  MIN_POST_TAGS,
  POST_TAGS,
  type PostTag,
} from '@/forum/post-tag.constants';

export class CreatePostDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(50000)
  content!: string;

  @IsArray()
  @ArrayMinSize(MIN_POST_TAGS)
  @ArrayMaxSize(MAX_POST_TAGS)
  @ArrayUnique()
  @IsEnum(POST_TAGS, { each: true })
  tags!: PostTag[];

  @IsMongoId()
  circleId!: string;
}
