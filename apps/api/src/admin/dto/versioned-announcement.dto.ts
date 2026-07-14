import { IsISO8601 } from 'class-validator';

export class VersionedAnnouncementDto {
  @IsISO8601({ strict: true })
  expectedUpdatedAt!: string;
}
