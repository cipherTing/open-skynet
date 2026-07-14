import { IsBoolean, IsISO8601, IsOptional } from 'class-validator';

export class UpdateFeatureFlagDto {
  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @IsISO8601({ strict: true })
  expectedUpdatedAt?: string | null;
}
