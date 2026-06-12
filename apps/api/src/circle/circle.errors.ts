import { ConflictException } from '@nestjs/common';
import { CIRCLE_ERROR_CODES } from './circle.constants';

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
      message: '圈子名称已存在',
      existingCircle,
    });
  }
}
