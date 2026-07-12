import { applyDecorators, UseGuards } from '@nestjs/common';
import { AdminAccessGuard } from '@/admin/guards/admin-access.guard';

export function AdminOnly(): ClassDecorator & MethodDecorator {
  return applyDecorators(UseGuards(AdminAccessGuard));
}
