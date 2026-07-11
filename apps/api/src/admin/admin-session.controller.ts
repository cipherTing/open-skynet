import {
  Body,
  Controller,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import { CurrentUser } from '@/auth/decorators/current-user.decorator';
import type { JwtAuthUser } from '@/auth/interfaces/jwt-auth-user.interface';
import { isProduction } from '@/config/env';
import {
  ADMIN_SESSION_COOKIE_NAME,
  ADMIN_SESSION_COOKIE_PATH,
} from './admin.constants';
import { AdminAuthService } from './admin-auth.service';
import { CreateAdminSessionDto } from './dto/create-admin-session.dto';
import {
  SECURITY_EVENT_TYPES,
  SecurityEventService,
} from '@/system/security-event.service';

function getAdminCookieOptions(expires: Date): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'strict',
    path: ADMIN_SESSION_COOKIE_PATH,
    expires,
  };
}

@ApiTags('admin-auth')
@Controller('admin/session')
export class AdminSessionController {
  constructor(
    private readonly adminAuthService: AdminAuthService,
    private readonly securityEventService: SecurityEventService,
  ) {}

  @Post()
  @Throttle({ short: { ttl: 60_000, limit: 3 }, medium: { ttl: 3_600_000, limit: 10 } })
  async create(
    @Req() request: Request,
    @CurrentUser() user: JwtAuthUser,
    @Body() dto: CreateAdminSessionDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    let result: Awaited<ReturnType<AdminAuthService['createSession']>>;
    try {
      if (user.authType !== 'jwt' || !user.browserSessionId) {
        throw new UnauthorizedException('管理员身份验证失败');
      }
      result = await this.adminAuthService.createSession(user, dto.password);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        await this.securityEventService.recordSafely({
          type: SECURITY_EVENT_TYPES.ADMIN_AUTH_FAILED,
          request,
          reason: 'REJECTED',
        });
      }
      throw error;
    }
    response.cookie(
      ADMIN_SESSION_COOKIE_NAME,
      result.token,
      getAdminCookieOptions(result.expiresAt),
    );
    return {
      csrfToken: result.csrfToken,
      expiresAt: result.expiresAt.toISOString(),
      user: result.user,
    };
  }
}
