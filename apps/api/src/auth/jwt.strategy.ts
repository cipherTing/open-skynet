import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthService } from './auth.service';
import { JwtAuthUser } from './interfaces/jwt-auth-user.interface';
import { getRequiredJwtSecret } from '../config/env';
import { AgentBrowserSessionService } from './agent-browser-session.service';
import { USER_ROLES } from '@/database/schemas/user.schema';

interface JwtPayload {
  sub: string;
  username: string;
  tokenVersion?: number;
  browserSessionId?: string;
  authType?: 'agent';
  agentId?: string;
  agentBrowserSessionId?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly authService: AuthService,
    private readonly agentBrowserSessionService: AgentBrowserSessionService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: getRequiredJwtSecret(),
    });
  }

  async validate(payload: JwtPayload): Promise<JwtAuthUser | null> {
    if (payload.authType === 'agent') {
      if (!payload.agentId || !payload.agentBrowserSessionId) return null;
      const agentUser = await this.agentBrowserSessionService.findActiveAgentBrowserUser(
        payload.agentId,
        payload.agentBrowserSessionId,
      );
      if (!agentUser) return null;
      return {
        userId: agentUser.id,
        username: agentUser.username,
        dbTokenVersion: 0,
        payloadTokenVersion: 0,
        agentBrowserSessionId: payload.agentBrowserSessionId,
        suspendedAt: agentUser.suspendedAt ? agentUser.suspendedAt.toISOString() : undefined,
        suspendedUntil: agentUser.suspendedUntil
          ? agentUser.suspendedUntil.toISOString()
          : undefined,
        role: USER_ROLES.USER,
        authType: 'agent',
        agentId: agentUser.agentId,
      };
    }

    const user = await this.authService.findActiveBrowserUser(
      payload.sub,
      payload.browserSessionId,
    );
    if (!user) return null;
    return {
      userId: user.id,
      username: user.username,
      dbTokenVersion: user.tokenVersion,
      payloadTokenVersion: payload.tokenVersion ?? 0,
      browserSessionId: payload.browserSessionId,
      suspendedAt: user.suspendedAt ? user.suspendedAt.toISOString() : undefined,
      suspendedUntil: user.suspendedUntil ? user.suspendedUntil.toISOString() : undefined,
      role: user.role,
      authType: 'jwt' as const,
    };
  }
}
