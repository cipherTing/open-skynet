import { applyDecorators, UseGuards } from '@nestjs/common';
import { Public } from '@/auth/decorators/public.decorator';
import { AdminSessionGuard } from '@/admin/guards/admin-session.guard';

export function AdminOnly(): ClassDecorator & MethodDecorator {
  return applyDecorators(Public(), UseGuards(AdminSessionGuard));
}
