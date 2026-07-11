import { Body, Controller, Post, Res, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Response } from 'express';
import { CurrentUser } from '@/auth/decorators/current-user.decorator';
import type { JwtAuthUser } from '@/auth/interfaces/jwt-auth-user.interface';
import { isProduction } from '@/config/env';
import {
  ADMIN_SESSION_COOKIE_NAME,
  ADMIN_SESSION_COOKIE_PATH,
} from './admin.constants';
import { AdminAuthService } from './admin-auth.service';
import { CreateAdminSessionDto } from './dto/create-admin-session.dto';

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
  constructor(private readonly adminAuthService: AdminAuthService) {}

  @Post()
  @Throttle({ short: { ttl: 60_000, limit: 3 }, medium: { ttl: 3_600_000, limit: 10 } })
  async create(
    @CurrentUser() user: JwtAuthUser,
    @Body() dto: CreateAdminSessionDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (user.authType !== 'jwt' || !user.browserSessionId) {
      throw new UnauthorizedException('管理员身份验证失败');
    }
    const result = await this.adminAuthService.createSession(user, dto.password);
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
