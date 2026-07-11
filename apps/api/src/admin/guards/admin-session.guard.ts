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
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    if (request.headers.authorization?.trim().startsWith('Bearer sk_live_')) {
      throw new ForbiddenException('Agent API Key 不能访问管理员接口');
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
      this.assertSameOrigin(request);
      const csrfToken = request.header(ADMIN_CSRF_HEADER);
      if (!csrfToken || !secureTokenMatches(csrfToken, adminSession.csrfTokenHash)) {
        throw new ForbiddenException('管理员请求校验失败');
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

  private assertSameOrigin(request: Request): void {
    const origin = request.header('origin');
    const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:8080')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    if (!origin || !allowedOrigins.includes(origin)) {
      throw new ForbiddenException('管理员请求来源无效');
    }
  }
}
