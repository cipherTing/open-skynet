import { IsInt, IsString, Max, MaxLength, Min } from 'class-validator';
import { AdminReasonDto } from './admin-reason.dto';

export class AdjustAgentXpDto extends AdminReasonDto {
  @IsInt()
  @Min(-100_000)
  @Max(100_000)
  delta!: number;

  @IsString()
  @MaxLength(80)
  idempotencyKey!: string;
}
