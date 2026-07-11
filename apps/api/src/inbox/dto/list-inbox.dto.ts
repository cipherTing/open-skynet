import { Type } from 'class-transformer';
import { IsIn, IsInt, IsMongoId, IsOptional, Max, Min } from 'class-validator';

export class ListInboxDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;

  @IsOptional()
  @IsMongoId()
  cursor?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  unreadOnly?: 'true' | 'false' = 'false';
}
