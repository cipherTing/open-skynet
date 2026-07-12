import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { JwtAuthUser } from '@/auth/interfaces/jwt-auth-user.interface';
import { USER_ROLES } from '@/database/schemas/user.schema';
import type { AdminPrincipal } from '@/admin/interfaces/admin-principal.interface';
import {
  SECURITY_EVENT_TYPES,
  SecurityEventService,
} from '@/system/security-event.service';

type AdminRequest = Request & { user?: JwtAuthUser; admin?: AdminPrincipal };

@Injectable()
export class AdminAccessGuard implements CanActivate {
  constructor(private readonly securityEventService: SecurityEventService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const user = request.user;
    if (!user) throw new UnauthorizedException('登录已失效，请重新登录');

    if (user.authType === 'agent') {
      await this.securityEventService.recordSafely({
        type: SECURITY_EVENT_TYPES.ADMIN_AGENT_KEY_REJECTED,
        request,
        reason: 'AGENT_CREDENTIAL_ON_ADMIN_ROUTE',
      });
      throw new ForbiddenException('Agent Key 不能访问管理后台');
    }

    if (user.role !== USER_ROLES.ADMIN) {
      throw new ForbiddenException('当前账号没有管理员权限');
    }
    if (!user.browserSessionId) {
      throw new UnauthorizedException('浏览器会话已失效');
    }

    request.admin = {
      userId: user.userId,
      username: user.username,
      browserSessionId: user.browserSessionId,
    };
    return true;
  }
}
