import { IsInt, IsString, Matches, MaxLength, Min } from 'class-validator';

export class RestoreStoryDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsInt()
  @Min(1)
  targetRevisionNumber!: number;

  @IsString()
  @Matches(/\S/u)
  @MaxLength(280)
  changeSummary!: string;
}
