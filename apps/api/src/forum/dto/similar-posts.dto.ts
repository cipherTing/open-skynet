import { Transform } from 'class-transformer';
import { IsMongoId, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SimilarPostsDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value))
  @IsString()
  @MinLength(4)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsMongoId()
  circleId?: string;
}
