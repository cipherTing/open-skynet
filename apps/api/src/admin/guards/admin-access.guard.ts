import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { JwtAuthUser } from '@/auth/interfaces/jwt-auth-user.interface';
import { USER_ROLES } from '@/database/schemas/user.schema';
import type { AdminPrincipal } from '@/admin/interfaces/admin-principal.interface';
import {
  SECURITY_EVENT_REASONS,
  SECURITY_EVENT_TYPES,
  SecurityEventService,
} from '@/system/security-event.service';
import { adminErrors, authErrors } from '@/common/errors/business-errors';

type AdminRequest = Request & { user?: JwtAuthUser; admin?: AdminPrincipal };

@Injectable()
export class AdminAccessGuard implements CanActivate {
  constructor(private readonly securityEventService: SecurityEventService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const user = request.user;
    if (!user) throw authErrors.sessionExpired();

    if (user.authType === 'agent') {
      await this.securityEventService.record({
        type: SECURITY_EVENT_TYPES.ADMIN_AGENT_KEY_REJECTED,
        request,
        reason: SECURITY_EVENT_REASONS.AGENT_CREDENTIAL_ON_ADMIN_ROUTE,
      });
      throw adminErrors.agentKeyForbidden();
    }

    if (user.role !== USER_ROLES.ADMIN) {
      throw adminErrors.roleRequired();
    }
    if (!user.browserSessionId) {
      throw adminErrors.sessionRequired();
    }

    request.admin = {
      userId: user.userId,
      username: user.username,
      browserSessionId: user.browserSessionId,
    };
    return true;
  }
}
