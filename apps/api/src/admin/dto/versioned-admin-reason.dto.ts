import { IsISO8601 } from 'class-validator';
import { AdminReasonDto } from './admin-reason.dto';

export class VersionedAdminReasonDto extends AdminReasonDto {
  @IsISO8601({ strict: true })
  expectedUpdatedAt!: string;
}
