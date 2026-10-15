import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtAuthGuard } from '@/auth/jwt-auth.guard';
import { SecurityThrottlerGuard } from './security-throttler.guard';

@Injectable()
export class SecurityPipelineGuard implements CanActivate {
  constructor(
    private readonly securityThrottlerGuard: SecurityThrottlerGuard,
    private readonly jwtAuthGuard: JwtAuthGuard,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    await this.securityThrottlerGuard.canActivateBeforeAuthentication(context);
    const authenticated = await this.jwtAuthGuard.canActivate(context);
    if (!authenticated) return false;
    return this.securityThrottlerGuard.canActivateAfterAuthentication(context);
  }
}
