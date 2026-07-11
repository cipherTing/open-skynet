import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { Request } from 'express';
import { AdminSession } from '@/database/schemas/admin-session.schema';
import { BrowserSession } from '@/database/schemas/browser-session.schema';
import { User, USER_ROLES } from '@/database/schemas/user.schema';
import {
  hashOpaqueToken,
  isUserSuspended,
  secureTokenMatches,
} from '@/auth/auth-security';
import { readCookie } from '@/common/http/cookies';
import type { AdminPrincipal } from '@/admin/interfaces/admin-principal.interface';
import {
  ADMIN_CSRF_HEADER,
  ADMIN_SESSION_COOKIE_NAME,
} from '@/admin/admin.constants';
import {
  SECURITY_EVENT_TYPES,
  SecurityEventService,
} from '@/system/security-event.service';

type AdminRequest = Request & { admin?: AdminPrincipal };
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class AdminSessionGuard implements CanActivate {
  constructor(
    @InjectModel(AdminSession.name)
    private readonly adminSessionModel: Model<AdminSession>,
    @InjectModel(BrowserSession.name)
    private readonly browserSessionModel: Model<BrowserSession>,
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
    private readonly securityEventService: SecurityEventService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const authorization = request.headers.authorization?.trim() ?? '';
    if (authorization) {
      if (/^Bearer\s+sk_live_/i.test(authorization)) {
        await this.securityEventService.recordSafely({
          type: SECURITY_EVENT_TYPES.ADMIN_AGENT_KEY_REJECTED,
          request,
          reason: 'AGENT_CREDENTIAL_ON_ADMIN_ROUTE',
        });
      }
      throw new ForbiddenException('管理员接口不接受 Authorization 请求头');
    }

    const rawToken = readCookie(request, ADMIN_SESSION_COOKIE_NAME);
    if (!rawToken) throw new UnauthorizedException('管理员会话不存在');

    const now = new Date();
    const adminSession = await this.adminSessionModel.findOne({
      tokenHash: hashOpaqueToken(rawToken),
      revokedAt: null,
    });
    if (!adminSession || adminSession.expiresAt.getTime() <= now.getTime()) {
      throw new UnauthorizedException('管理员会话已过期');
    }

    const [user, browserSession] = await Promise.all([
      this.userModel.findById(adminSession.userId),
      this.browserSessionModel.findOne({
        _id: adminSession.browserSessionId,
        userId: adminSession.userId,
        revokedAt: null,
      }),
    ]);
    const browserSessionActive = Boolean(
      browserSession &&
      browserSession.expiresAt.getTime() > now.getTime() &&
      browserSession.absoluteExpiresAt.getTime() > now.getTime(),
    );
    if (
      !user ||
      user.role !== USER_ROLES.ADMIN ||
      user.tokenVersion !== adminSession.tokenVersion ||
      isUserSuspended(user, now) ||
      !browserSessionActive
    ) {
      throw new UnauthorizedException('管理员会话已失效');
    }

    if (!SAFE_METHODS.has(request.method)) {
      const origin = request.header('origin');
      const originResult = this.getOriginRejectionReason(origin);
      if (originResult) {
        await this.securityEventService.recordSafely({
          type: SECURITY_EVENT_TYPES.ADMIN_CSRF_REJECTED,
          request,
          reason: originResult,
        });
        throw new ForbiddenException({
          code: 'ADMIN_CSRF_REJECTED',
          message: '管理员请求来源无效',
        });
      }
      const csrfToken = request.header(ADMIN_CSRF_HEADER);
      if (!csrfToken) {
        await this.securityEventService.recordSafely({
          type: SECURITY_EVENT_TYPES.ADMIN_CSRF_REJECTED,
          request,
          reason: 'MISSING_TOKEN',
        });
        throw new ForbiddenException({
          code: 'ADMIN_CSRF_REJECTED',
          message: '管理员请求校验失败',
        });
      }
      if (!secureTokenMatches(csrfToken, adminSession.csrfTokenHash)) {
        await this.securityEventService.recordSafely({
          type: SECURITY_EVENT_TYPES.ADMIN_CSRF_REJECTED,
          request,
          reason: 'INVALID_TOKEN',
        });
        throw new ForbiddenException({
          code: 'ADMIN_CSRF_REJECTED',
          message: '管理员请求校验失败',
        });
      }
    }

    request.admin = {
      userId: user.id,
      username: user.username,
      adminSessionId: adminSession.id,
      browserSessionId: adminSession.browserSessionId,
    };
    return true;
  }

  private getOriginRejectionReason(
    origin: string | undefined,
  ): 'MISSING_ORIGIN' | 'ORIGIN_MISMATCH' | null {
    const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:8080')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    if (!origin) return 'MISSING_ORIGIN';
    return allowedOrigins.includes(origin) ? null : 'ORIGIN_MISMATCH';
  }
}
