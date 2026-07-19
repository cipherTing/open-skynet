import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import { isProduction } from '@/config/env';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { InitializeAdministratorDto } from './dto/initialize-administrator.dto';
import { EmailVerificationService } from './email-verification.service';
import { SendEmailVerificationDto, ResetPasswordDto } from './dto/email-verification.dto';
import { TurnstileService } from '@/system/turnstile.service';
import { AuthPolicyService } from '@/system/auth-policy.service';
import { LoginDto } from './dto/login.dto';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import type { JwtAuthUser } from './interfaces/jwt-auth-user.interface';
import type { Agent } from '@/database/schemas/agent.schema';
import type { UserRole } from '@/database/schemas/user.schema';
import { readCookie } from '@/common/http/cookies';
import {
  SECURITY_EVENT_TYPES,
  SecurityEventService,
} from '@/system/security-event.service';
import { apiMessage } from '@/common/i18n/api-message';
import { authErrors } from '@/common/errors/business-errors';

const REFRESH_COOKIE_NAME = 'skynet_refresh';
const REFRESH_COOKIE_PATH = '/api/v1/auth';

type BrowserAuthResult = {
  user: {
    id: string;
    username: string;
    email: string;
    role: UserRole;
    createdAt: string;
  };
  agent: {
    id: string;
    name: string;
    description: string;
    favoritesPublic: boolean;
    ownerOperationEnabled: boolean;
    avatarSeed: string;
    createdAt: string;
  } | null;
  token: string;
  refreshToken: string | null;
  refreshExpiresAt: Date;
};

function getRefreshCookieOptions(expires: Date): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'lax',
    path: REFRESH_COOKIE_PATH,
    expires,
  };
}

function getClearRefreshCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'lax',
    path: REFRESH_COOKIE_PATH,
  };
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly securityEventService: SecurityEventService,
    private readonly emailVerificationService: EmailVerificationService,
    private readonly turnstileService: TurnstileService,
    private readonly authPolicyService: AuthPolicyService,
  ) {}

  @Public()
  @Get('config')
  authConfig() {
    return this.authPolicyService.getPublicConfig();
  }

  @Public()
  @Post('email-verifications')
  @Throttle({ short: { ttl: 60000, limit: 5 }, medium: { ttl: 3600000, limit: 30 } })
  sendEmailVerification(@Req() request: Request, @Body() dto: SendEmailVerificationDto) {
    return this.emailVerificationService.send(dto.email, dto.purpose, dto.turnstileToken, request.ip);
  }

  @Public()
  @Post('password-reset')
  @Throttle({ short: { ttl: 60000, limit: 5 }, medium: { ttl: 3600000, limit: 20 } })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto);
    return { message: apiMessage('api.success.passwordReset') };
  }

  @Public()
  @Get('initialization')
  initializationStatus() {
    return this.authService.getInitializationStatus();
  }

  @Public()
  @Post('initialization')
  @Throttle({ short: { ttl: 60000, limit: 3 }, medium: { ttl: 3600000, limit: 10 } })
  async initializeAdministrator(
    @Body() dto: InitializeAdministratorDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.initializeAdministrator(dto);
    return this.createBrowserAuthResponse(response, result);
  }

  @Public()
  @Post('register')
  @Throttle({ short: { ttl: 60000, limit: 3 }, medium: { ttl: 3600000, limit: 10 } })
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.authService.register(dto);
    return this.createBrowserAuthResponse(response, result);
  }

  @Public()
  @Post('login')
  @Throttle({ short: { ttl: 10000, limit: 5 }, medium: { ttl: 60000, limit: 15 } })
  async login(
    @Req() request: Request,
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      await this.turnstileService.verifyIfEnabled(dto.turnstileToken, 'login', request.ip);
      const result = await this.authService.login(dto);
      return this.createBrowserAuthResponse(response, result);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        await this.securityEventService.recordSafely({
          type: SECURITY_EVENT_TYPES.LOGIN_FAILED,
          request,
          reason: 'REJECTED',
        });
      }
      throw error;
    }
  }

  @Public()
  @Post('refresh')
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const refreshToken = readCookie(request, REFRESH_COOKIE_NAME);
    const result = await this.authService.refreshBrowserSession(refreshToken);
    return this.createBrowserAuthResponse(response, result);
  }

  @Post('logout')
  async logout(@CurrentUser() user: JwtAuthUser, @Res({ passthrough: true }) response: Response) {
    if (user.authType === 'agent') {
      throw authErrors.userOnlyOperation();
    }
    await this.authService.logout(user.userId, user.browserSessionId);
    response.clearCookie(REFRESH_COOKIE_NAME, getClearRefreshCookieOptions());
    return { message: apiMessage('api.success.loggedOut') };
  }

  @Get('me')
  async me(@CurrentUser() user: JwtAuthUser) {
    const fullUser = await this.authService.findUserWithAgentById(user.userId);
    if (!fullUser) {
      return { user: null, agent: null };
    }
    if (user.authType === 'agent') {
      return {
        user: null,
        agent: fullUser.agent ? this.serializeAgentForMe(fullUser.agent) : null,
      };
    }
    return {
      user: {
        id: fullUser.id,
        username: fullUser.username,
        email: fullUser.email,
        role: fullUser.role,
        createdAt: fullUser.createdAt?.toISOString?.() || fullUser.createdAt || '',
      },
      agent: fullUser.agent
        ? this.serializeAgentForMe(fullUser.agent)
        : null,
    };
  }

  private serializeAgentForMe(agent: Agent) {
    return {
      id: agent.id,
      name: agent.name,
      description: agent.description,
      favoritesPublic: agent.favoritesPublic !== false,
      ownerOperationEnabled: agent.ownerOperationEnabled === true,
      avatarSeed: agent.avatarSeed,
      createdAt: agent.createdAt?.toISOString?.() || agent.createdAt || '',
    };
  }

  private createBrowserAuthResponse(response: Response, result: BrowserAuthResult) {
    if (result.refreshToken) {
      response.cookie(
        REFRESH_COOKIE_NAME,
        result.refreshToken,
        getRefreshCookieOptions(result.refreshExpiresAt),
      );
    }

    return {
      user: result.user,
      agent: result.agent,
      token: result.token,
    };
  }
}
