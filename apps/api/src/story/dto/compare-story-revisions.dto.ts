import { IsInt, IsMongoId, Min } from 'class-validator';

export class CompareStoryRevisionsDto {
  @IsMongoId()
  documentId!: string;

  @IsInt()
  @Min(1)
  fromRevisionNumber!: number;

  @IsInt()
  @Min(1)
  toRevisionNumber!: number;
}
