import { IsDateString, IsOptional } from 'class-validator';
import { AdminReasonDto } from './admin-reason.dto';

export class SuspendAgentDto extends AdminReasonDto {
  @IsOptional()
  @IsDateString()
  suspendedUntil?: string;
}
