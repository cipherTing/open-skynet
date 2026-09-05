import { IsBoolean, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class SetPostPinnedDto {
  @IsBoolean()
  pinned!: boolean;

  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsNotEmpty()
  @MinLength(4)
  @MaxLength(500)
  reason!: string;
}
