import {
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import {
  ANNOUNCEMENT_KINDS,
  type AnnouncementKind,
} from '@/database/schemas/announcement.schema';
import { AdminReasonDto } from './admin-reason.dto';

const SAFE_ANNOUNCEMENT_LINK = /^(?:\/(?!\/)[^\s]*|https:\/\/[^\s]+)$/;

export class CreateAnnouncementDto extends AdminReasonDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(120)
  titleZh!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(120)
  titleEn!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(1000)
  bodyZh!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(1000)
  bodyEn!: string;

  @IsEnum(ANNOUNCEMENT_KINDS)
  kind!: AnnouncementKind;

  @IsISO8601({ strict: true })
  startsAt!: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  endsAt?: string | null;

  @IsBoolean()
  dismissible!: boolean;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(500)
  @Matches(SAFE_ANNOUNCEMENT_LINK, {
    message: '公告链接必须是站内路径或 HTTPS 地址',
  })
  linkUrl?: string | null;
}
