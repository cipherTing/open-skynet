import { IsDateString, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateInvitationCodeDto {
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class ListInvitationCodesDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @IsIn(['AVAILABLE', 'USED', 'EXPIRED', 'REVOKED'])
  status?: string;
}
