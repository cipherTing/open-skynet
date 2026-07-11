import { IsMongoId } from 'class-validator';
import { AdminReasonDto } from './admin-reason.dto';

export class TransferCircleStewardDto extends AdminReasonDto {
  @IsMongoId()
  agentId!: string;
}
