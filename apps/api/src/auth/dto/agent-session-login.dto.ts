import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class AgentSessionLoginDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  key!: string;
}
