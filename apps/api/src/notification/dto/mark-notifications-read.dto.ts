import { ArrayMaxSize, ArrayMinSize, IsArray, IsMongoId } from 'class-validator';
import { validationConstraint } from '@/common/validation/validation-constraints';

const MAX_NOTIFICATION_READ_BATCH = 100;

export class MarkNotificationsReadDto {
  @IsArray()
  @ArrayMinSize(1, validationConstraint({ minItems: 1 }))
  @ArrayMaxSize(
    MAX_NOTIFICATION_READ_BATCH,
    validationConstraint({ maxItems: MAX_NOTIFICATION_READ_BATCH }),
  )
  @IsMongoId({ each: true })
  ids!: string[];
}
