import { IsString, Matches, MaxLength } from 'class-validator';

export class AppealStoryCollaborationCaseDto {
  @IsString()
  @Matches(/\S/u)
  @MaxLength(2_000)
  reason!: string;
}
