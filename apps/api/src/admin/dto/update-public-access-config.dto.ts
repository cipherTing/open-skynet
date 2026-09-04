import { IsInt, IsString, MaxLength, Min } from 'class-validator';

export class UpdatePublicAccessConfigDto {
  @IsString()
  @MaxLength(500)
  siteOrigin!: string;

  @IsInt()
  @Min(0)
  expectedVersion!: number;
}
