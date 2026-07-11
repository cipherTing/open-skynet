import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { AdminSession } from '@/database/schemas/admin-session.schema';
import { User, USER_ROLES } from '@/database/schemas/user.schema';
import { BrowserSession } from '@/database/schemas/browser-session.schema';
import { hashOpaqueToken, isUserSuspended } from '@/auth/auth-security';
import type { JwtAuthUser } from '@/auth/interfaces/jwt-auth-user.interface';
import { ADMIN_AUDIT_ACTIONS, ADMIN_SESSION_TTL_MS } from './admin.constants';
import { AdminAuditService } from './admin-audit.service';

@Injectable()
export class AdminAuthService {
  constructor(
    @InjectModel(AdminSession.name)
    private readonly adminSessionModel: Model<AdminSession>,
    @InjectModel(BrowserSession.name)
    private readonly browserSessionModel: Model<BrowserSession>,
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
    private readonly auditService: AdminAuditService,
  ) {}

  async createSession(principal: JwtAuthUser, password: string) {
    if (principal.authType !== 'jwt' || !principal.browserSessionId) {
      throw new UnauthorizedException('管理员身份验证失败');
    }

    const user = await this.userModel.findById(principal.userId);
    const browserSession = await this.browserSessionModel.findOne({
      _id: principal.browserSessionId,
      userId: principal.userId,
      revokedAt: null,
    });
    const now = new Date();
    if (
      !user ||
      user.role !== USER_ROLES.ADMIN ||
      isUserSuspended(user, now) ||
      !browserSession ||
      browserSession.expiresAt.getTime() <= now.getTime() ||
      browserSession.absoluteExpiresAt.getTime() <= now.getTime() ||
      !(await bcrypt.compare(password, user.passwordHash))
    ) {
      throw new UnauthorizedException('管理员身份验证失败');
    }

    const rawToken = randomBytes(32).toString('base64url');
    const csrfToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(now.getTime() + ADMIN_SESSION_TTL_MS);
    await this.adminSessionModel.updateMany(
      {
        userId: user.id,
        browserSessionId: browserSession.id,
        revokedAt: null,
      },
      { revokedAt: now },
    );
    const adminSession = await this.adminSessionModel.create({
      userId: user.id,
      browserSessionId: browserSession.id,
      tokenHash: hashOpaqueToken(rawToken),
      csrfTokenHash: hashOpaqueToken(csrfToken),
      tokenVersion: user.tokenVersion,
      expiresAt,
    });

    await this.auditService.record({
      actorUserId: user.id,
      action: ADMIN_AUDIT_ACTIONS.SESSION_CREATED,
      targetType: 'ADMIN_SESSION',
      targetId: adminSession.id,
      reason: '管理员完成二次身份验证',
      changes: { expiresAt: expiresAt.toISOString() },
    });

    return {
      token: rawToken,
      csrfToken,
      expiresAt,
      user: { id: user.id, username: user.username, role: user.role },
    };
  }

  async revokeSession(sessionId: string, userId: string): Promise<void> {
    const revokedAt = new Date();
    await this.adminSessionModel.findOneAndUpdate(
      { _id: sessionId, userId, revokedAt: null },
      { revokedAt },
    );
    await this.auditService.record({
      actorUserId: userId,
      action: ADMIN_AUDIT_ACTIONS.SESSION_REVOKED,
      targetType: 'ADMIN_SESSION',
      targetId: sessionId,
      reason: '管理员主动退出后台',
      changes: { revokedAt: revokedAt.toISOString() },
    });
  }
}
