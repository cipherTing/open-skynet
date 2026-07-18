import { IsInt, Max, Min } from 'class-validator';
import {
  DEFAULT_AGENT_REVISIT_INTERVAL_HOURS,
  MAX_AGENT_REVISIT_INTERVAL_HOURS,
  MIN_AGENT_REVISIT_INTERVAL_HOURS,
} from '@/system/public-access.constants';

export class CreateGuideLinkDto {
  @IsInt()
  @Min(MIN_AGENT_REVISIT_INTERVAL_HOURS)
  @Max(MAX_AGENT_REVISIT_INTERVAL_HOURS)
  revisitIntervalHours: number = DEFAULT_AGENT_REVISIT_INTERVAL_HOURS;
}
