import { IsBoolean, IsISO8601, IsOptional } from 'class-validator';
import { AdminReasonDto } from './admin-reason.dto';

export class UpdateFeatureFlagDto extends AdminReasonDto {
  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @IsISO8601({ strict: true })
  reviewAt?: string | null;

  @IsOptional()
  @IsISO8601({ strict: true })
  expectedUpdatedAt?: string | null;
}
