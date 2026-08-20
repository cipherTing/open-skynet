import { IsInt, IsString, MaxLength, Min } from 'class-validator';

export class UpdateBusinessCalendarConfigDto {
  @IsString()
  @MaxLength(100)
  timeZone!: string;

  @IsInt()
  @Min(0)
  expectedVersion!: number;
}
