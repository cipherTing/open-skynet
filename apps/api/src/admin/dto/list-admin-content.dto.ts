import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '@/forum/dto/pagination-query.dto';

export class ListAdminContentDto extends PaginationQueryDto {
  @IsIn(['POST', 'REPLY'])
  type!: 'POST' | 'REPLY';

  @IsOptional()
  @IsIn(['visible', 'removed'])
  status?: 'visible' | 'removed';

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
