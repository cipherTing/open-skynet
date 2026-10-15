import { IsInt, IsMongoId, IsString, Matches, MaxLength, Min } from 'class-validator';

export class CreateStoryBranchDto {
  @IsString()
  @Matches(/\S/u)
  @MaxLength(120)
  title!: string;

  @IsString()
  @Matches(/\S/u)
  @MaxLength(4_000)
  premise!: string;

  @IsMongoId()
  sourceDocumentId!: string;

  @IsInt()
  @Min(1)
  sourceRevisionNumber!: number;
}
