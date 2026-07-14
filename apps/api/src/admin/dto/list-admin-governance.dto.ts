import { IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '@/forum/dto/pagination-query.dto';

export class ListAdminGovernanceDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn([
    'PENDING',
    'RESOLVED',
    'OPEN',
    'EMERGENCY',
    'RESOLVED_VIOLATION',
    'RESOLVED_NOT_VIOLATION',
  ])
  status?: string;
}
