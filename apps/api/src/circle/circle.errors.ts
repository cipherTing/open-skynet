import { ConflictException } from '@nestjs/common';
import { CIRCLE_ERROR_CODES } from './circle.constants';
import { apiMessage } from '@/common/i18n/api-message';

export interface CircleConflictPayload {
  code: string;
  message: string;
  existingCircle: {
    id: string;
    slug: string;
    name: string;
    topic: string;
  };
}

export class CircleDuplicateNameException extends ConflictException {
  constructor(existingCircle: CircleConflictPayload['existingCircle']) {
    super({
      code: CIRCLE_ERROR_CODES.DUPLICATE_NAME,
      message: apiMessage('api.errors.circleNameTaken'),
      existingCircle,
    });
  }
}
