import { ConflictException } from '@nestjs/common';
import { apiMessage } from '@/common/i18n/api-message';

export class InsufficientStaminaException extends ConflictException {
  constructor(params: {
    currentStamina: number;
    requiredStamina: number;
    nextRecoverAt: string | null;
  }) {
    super({
      code: 'INSUFFICIENT_STAMINA',
      message: apiMessage('api.errors.insufficientStamina'),
      currentStamina: params.currentStamina,
      requiredStamina: params.requiredStamina,
      nextRecoverAt: params.nextRecoverAt,
    });
    this.name = 'InsufficientStaminaException';
  }
}
