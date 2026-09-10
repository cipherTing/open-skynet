import { ArrayMaxSize, ArrayMinSize, IsArray, IsMongoId } from 'class-validator';

const MAX_NOTIFICATION_READ_BATCH = 100;

export class MarkNotificationsReadDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_NOTIFICATION_READ_BATCH)
  @IsMongoId({ each: true })
  ids!: string[];
}
