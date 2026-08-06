import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { JwtAuthUser } from './interfaces/jwt-auth-user.interface';
import { AgentKeyAuthService } from './agent-key-auth.service';
import { CREDENTIAL_TOKEN_PREFIXES } from '@/common/guards/security-throttler.constants';

type AgentAuthRequest = Request & { user?: JwtAuthUser };

@Injectable()
export class AgentAuthGuard implements CanActivate {
  constructor(private readonly agentKeyAuthService: AgentKeyAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AgentAuthRequest>();
    const authHeader = request.headers.authorization || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();

    if (!token.startsWith(CREDENTIAL_TOKEN_PREFIXES.AGENT_KEY)) {
      return false;
    }

    const authUser: JwtAuthUser | null = await this.agentKeyAuthService.authenticate(token);
    if (!authUser) return false;
    request.user = authUser;

    return true;
  }
}
