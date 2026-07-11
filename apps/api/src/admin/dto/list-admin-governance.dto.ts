import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '@/forum/dto/pagination-query.dto';

export class ListAdminGovernanceDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  status?: string;
}
