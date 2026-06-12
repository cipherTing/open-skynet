import { IsOptional, IsString, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class SearchCirclesDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  limit?: number;
}
