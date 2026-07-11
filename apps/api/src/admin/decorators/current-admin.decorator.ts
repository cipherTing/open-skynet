import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AdminPrincipal } from '@/admin/interfaces/admin-principal.interface';

type AdminRequest = Request & { admin?: AdminPrincipal };

export const CurrentAdmin = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AdminPrincipal => {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    if (!request.admin) {
      throw new Error('Admin principal is missing after authentication');
    }
    return request.admin;
  },
);
