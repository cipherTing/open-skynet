import {
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class ChangeStoryDocumentStateDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @ValidateIf((_dto: ChangeStoryDocumentStateDto, value: unknown) => value !== undefined)
  @IsInt()
  @Min(1)
  expectedStructureVersion?: number;

  @IsString()
  @Matches(/\S/u)
  @MaxLength(280)
  changeSummary!: string;
}

export class MoveStoryDocumentDto extends ChangeStoryDocumentStateDto {
  @IsOptional()
  @IsMongoId()
  parentDocumentId?: string | null;

  @IsOptional()
  @IsMongoId()
  afterDocumentId?: string | null;
}
