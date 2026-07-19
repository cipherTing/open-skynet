import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from './decorators/public.decorator';
import { JwtAuthUser } from './interfaces/jwt-auth-user.interface';
import { AgentAuthGuard } from './agent-auth.guard';
import { USER_ROLES } from '@/database/schemas/user.schema';
import { authErrors, commonErrors } from '@/common/errors/business-errors';

type PassportError = Error | null | undefined;
type JwtAuthRequest = Request & { user?: JwtAuthUser };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isJwtAuthUser(value: unknown): value is JwtAuthUser {
  if (!isRecord(value)) return false;
  return (
    typeof value.userId === 'string' &&
    typeof value.username === 'string' &&
    typeof value.dbTokenVersion === 'number' &&
    typeof value.payloadTokenVersion === 'number' &&
    (value.role === USER_ROLES.USER || value.role === USER_ROLES.ADMIN) &&
    (value.suspendedAt === undefined || typeof value.suspendedAt === 'string') &&
    (value.authType === 'jwt' || value.authType === 'agent')
  );
}

function isAuthenticationError(error: unknown): boolean {
  return (
    error instanceof UnauthorizedException ||
    (error instanceof Error &&
      ['TokenExpiredError', 'JsonWebTokenError', 'NotBeforeError'].includes(error.name))
  );
}

function toPassportError(error: unknown): PassportError {
  return error instanceof Error ? error : undefined;
}

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private reflector: Reflector,
    private agentAuthGuard: AgentAuthGuard,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<JwtAuthRequest>();
    const authHeader = request.headers.authorization || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();

    // Agent Secret Key 走独立认证路径
    if (token.startsWith('sk_live_')) {
      const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      const result = await this.agentAuthGuard.canActivate(context);
      if (!result) {
        if (isPublic) {
          delete request.user;
          return true;
        }
        throw commonErrors.unauthorized();
      }
      return true;
    }

    // 其余走标准 JWT 认证
    return (await super.canActivate(context)) as boolean;
  }

  handleRequest<TUser = JwtAuthUser | null>(
    err: unknown,
    user: unknown,
    _info: unknown,
    context: ExecutionContext,
    _status?: unknown,
  ): TUser;
  handleRequest(
    err: unknown,
    user: unknown,
    _info: unknown,
    context: ExecutionContext,
    _status?: unknown,
  ): unknown {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const authError = toPassportError(err);
    const authUser = isJwtAuthUser(user) ? user : null;

    // 公开路由：认证信息无效时按匿名请求处理。
    if (isPublic) {
      if (authError) {
        if (isAuthenticationError(authError)) {
          return null;
        }
        throw authError;
      }
      if (!authUser) {
        return null;
      }
      // tokenVersion 不匹配或账号封禁时同样按匿名请求处理。
      if (
        authUser.dbTokenVersion !== authUser.payloadTokenVersion ||
        isActiveSuspension(authUser.suspendedAt, authUser.suspendedUntil)
      ) {
        return null;
      }
      return authUser;
    }

    if (authError) throw authError;
    if (!authUser) throw commonErrors.unauthorized();

    // 注意：Agent 认证在 canActivate 中直接返回 true，不走此处。
    // handleRequest 仅处理 JWT 认证路径。
    if (authUser.authType !== 'agent') {
      if (authUser.dbTokenVersion !== authUser.payloadTokenVersion) {
        throw authErrors.sessionExpired();
      }
    }

    if (isActiveSuspension(authUser.suspendedAt, authUser.suspendedUntil)) {
      throw authErrors.accountSuspended();
    }

    return authUser;
  }
}

function isActiveSuspension(suspendedAt?: string, suspendedUntil?: string): boolean {
  if (!suspendedAt) return false;
  return !suspendedUntil || new Date(suspendedUntil).getTime() > Date.now();
}
