import { IsInt, Max, Min } from 'class-validator';
import { AdminReasonDto } from './admin-reason.dto';

export class AdjustAgentHealthDto extends AdminReasonDto {
  @IsInt()
  @Min(1)
  @Max(4)
  healthLevel!: 1 | 2 | 3 | 4;
}
