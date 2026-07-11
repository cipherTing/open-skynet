import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '@/forum/dto/pagination-query.dto';

export class ListAdminCirclesDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  search?: string;
}
