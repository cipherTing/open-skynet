import { Body, Controller, Get, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import { isProduction } from '@/config/env';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { InitializeAdministratorDto } from './dto/initialize-administrator.dto';
import { EmailVerificationService } from './email-verification.service';
import { SendEmailVerificationDto, ResetPasswordDto } from './dto/email-verification.dto';
import { AUTHENTICATION_TURNSTILE_ACTION, TurnstileService } from '@/system/turnstile.service';
import { AuthPolicyService } from '@/system/auth-policy.service';
import { LoginDto } from './dto/login.dto';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import type { JwtAuthUser } from './interfaces/jwt-auth-user.interface';
import type { Agent } from '@/database/schemas/agent.schema';
import type { UserRole } from '@/database/schemas/user.schema';
import { readCookie } from '@/common/http/cookies';
import {
  SECURITY_EVENT_REASONS,
  SECURITY_EVENT_TYPES,
  SecurityEventService,
} from '@/system/security-event.service';
import { apiMessage } from '@/common/i18n/api-message';
import { authErrors } from '@/common/errors/business-errors';
import { PreAuthThrottle } from '@/common/guards/pre-auth-throttle.decorator';
import { AGENT_SESSION_LOGIN_THROTTLE } from '@/common/guards/security-throttler.constants';
import {
  AgentBrowserSessionService,
  type AgentBrowserAuthResult,
} from './agent-browser-session.service';
import { AgentSessionLoginDto } from './dto/agent-session-login.dto';

const REFRESH_COOKIE_NAME = 'skynet_refresh';
const REFRESH_COOKIE_PATH = '/api/v1/auth';
const AGENT_REFRESH_COOKIE_NAME = 'skynet_agent_refresh';
const AGENT_REFRESH_COOKIE_PATH = '/api/v1/auth';

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

function getAgentRefreshCookieOptions(expires: Date): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'lax',
    path: AGENT_REFRESH_COOKIE_PATH,
    expires,
  };
}

function getClearAgentRefreshCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'lax',
    path: AGENT_REFRESH_COOKIE_PATH,
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
    private readonly agentBrowserSessionService: AgentBrowserSessionService,
  ) {}

  @Public()
  @Get('config')
  authConfig() {
    return this.authPolicyService.getPublicConfig();
  }

  @Public()
  @Post('email-verifications')
  @PreAuthThrottle()
  @Throttle({ short: { ttl: 60000, limit: 5 }, medium: { ttl: 3600000, limit: 30 } })
  sendEmailVerification(@Req() request: Request, @Body() dto: SendEmailVerificationDto) {
    return this.emailVerificationService.send(
      dto.email,
      dto.purpose,
      dto.turnstileToken,
      request.ip,
    );
  }

  @Public()
  @Post('password-reset')
  @PreAuthThrottle()
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
  @PreAuthThrottle()
  @Throttle({ short: { ttl: 60000, limit: 3 }, medium: { ttl: 3600000, limit: 10 } })
  async initializeAdministrator(
    @Req() request: Request,
    @Body() dto: InitializeAdministratorDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.initializeAdministrator(dto);
    return this.createBrowserAuthResponse(request, response, result);
  }

  @Public()
  @Post('register')
  @PreAuthThrottle()
  @Throttle({ short: { ttl: 60000, limit: 3 }, medium: { ttl: 3600000, limit: 10 } })
  async register(
    @Req() request: Request,
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.register(dto);
    return this.createBrowserAuthResponse(request, response, result);
  }

  @Public()
  @Post('login')
  @PreAuthThrottle()
  @Throttle({ short: { ttl: 10000, limit: 5 }, medium: { ttl: 60000, limit: 15 } })
  async login(
    @Req() request: Request,
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      await this.turnstileService.verifyIfEnabled(
        dto.turnstileToken,
        AUTHENTICATION_TURNSTILE_ACTION,
        request.ip,
      );
      const result = await this.authService.login(dto);
      return this.createBrowserAuthResponse(request, response, result);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        await this.securityEventService.record({
          type: SECURITY_EVENT_TYPES.LOGIN_FAILED,
          request,
          reason: SECURITY_EVENT_REASONS.REJECTED,
        });
      }
      throw error;
    }
  }

  @Public()
  @Post('agent-session')
  @PreAuthThrottle({
    name: AGENT_SESSION_LOGIN_THROTTLE.NAME,
    ttlMs: AGENT_SESSION_LOGIN_THROTTLE.TTL_MS,
    limit: AGENT_SESSION_LOGIN_THROTTLE.LIMIT,
    blockDurationMs: AGENT_SESSION_LOGIN_THROTTLE.BLOCK_DURATION_MS,
  })
  async loginAgentSession(
    @Req() request: Request,
    @Body() dto: AgentSessionLoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.agentBrowserSessionService.loginWithAgentKey(dto.key);
    const userRefreshToken = readCookie(request, REFRESH_COOKIE_NAME);
    const previousAgentRefreshToken = readCookie(request, AGENT_REFRESH_COOKIE_NAME);
    if (userRefreshToken) {
      await this.authService.logoutBrowserSessionFromRefreshToken(userRefreshToken);
      response.clearCookie(REFRESH_COOKIE_NAME, getClearRefreshCookieOptions());
    }
    if (previousAgentRefreshToken) {
      await this.agentBrowserSessionService.revokeAgentSessionFromRefreshToken(
        previousAgentRefreshToken,
      );
    }
    return this.createAgentBrowserAuthResponse(response, result);
  }

  @Public()
  @Post('refresh')
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    try {
      const refreshToken = readCookie(request, REFRESH_COOKIE_NAME);
      const result = await this.authService.refreshBrowserSession(refreshToken);
      return this.createBrowserAuthResponse(request, response, result);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        response.clearCookie(REFRESH_COOKIE_NAME, getClearRefreshCookieOptions());
      }
      throw error;
    }
  }

  @Public()
  @Post('session/refresh')
  async refreshCurrentSession(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const userRefreshToken = readCookie(request, REFRESH_COOKIE_NAME);
    const agentRefreshToken = readCookie(request, AGENT_REFRESH_COOKIE_NAME);
    if (userRefreshToken && agentRefreshToken) {
      await Promise.all([
        this.authService.logoutBrowserSessionFromRefreshToken(userRefreshToken),
        this.agentBrowserSessionService.revokeAgentSessionFromRefreshToken(agentRefreshToken),
      ]);
      response.clearCookie(REFRESH_COOKIE_NAME, getClearRefreshCookieOptions());
      response.clearCookie(AGENT_REFRESH_COOKIE_NAME, getClearAgentRefreshCookieOptions());
      throw authErrors.sessionExpired();
    }

    if (agentRefreshToken) {
      try {
        const result = await this.agentBrowserSessionService.refreshAgentBrowserSession(
          agentRefreshToken,
        );
        return this.createAgentBrowserAuthResponse(response, result);
      } catch (error) {
        if (error instanceof UnauthorizedException) {
          response.clearCookie(AGENT_REFRESH_COOKIE_NAME, getClearAgentRefreshCookieOptions());
        }
        throw error;
      }
    }

    try {
      const result = await this.authService.refreshBrowserSession(userRefreshToken);
      return this.createBrowserAuthResponse(request, response, result);
    } catch (error) {
      if (error instanceof UnauthorizedException && userRefreshToken) {
        response.clearCookie(REFRESH_COOKIE_NAME, getClearRefreshCookieOptions());
      }
      throw error;
    }
  }

  @Public()
  @Post('agent-session/logout')
  async logoutAgentSession(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.agentBrowserSessionService.logoutAgentBrowserSession(
      readCookie(request, AGENT_REFRESH_COOKIE_NAME),
    );
    response.clearCookie(AGENT_REFRESH_COOKIE_NAME, getClearAgentRefreshCookieOptions());
    return { message: apiMessage('api.success.loggedOut') };
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
      agent: fullUser.agent ? this.serializeAgentForMe(fullUser.agent) : null,
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

  private async createBrowserAuthResponse(
    request: Request,
    response: Response,
    result: BrowserAuthResult,
  ) {
    const agentRefreshToken = readCookie(request, AGENT_REFRESH_COOKIE_NAME);
    if (agentRefreshToken) {
      await this.agentBrowserSessionService.revokeAgentSessionFromRefreshToken(agentRefreshToken);
      response.clearCookie(AGENT_REFRESH_COOKIE_NAME, getClearAgentRefreshCookieOptions());
    }
    if (result.refreshToken) {
      response.cookie(
        REFRESH_COOKIE_NAME,
        result.refreshToken,
        getRefreshCookieOptions(result.refreshExpiresAt),
      );
    }

    return {
      sessionType: 'USER',
      user: result.user,
      agent: result.agent,
      token: result.token,
    };
  }

  private createAgentBrowserAuthResponse(response: Response, result: AgentBrowserAuthResult) {
    if (result.refreshToken) {
      response.cookie(
        AGENT_REFRESH_COOKIE_NAME,
        result.refreshToken,
        getAgentRefreshCookieOptions(result.refreshExpiresAt),
      );
    }
    return {
      sessionType: result.sessionType,
      user: result.user,
      agent: result.agent,
      token: result.token,
    };
  }
}
