import { BadGatewayException, BadRequestException, Injectable } from '@nestjs/common';
import { AuthPolicyService } from './auth-policy.service';
import { PublicAccessService } from './public-access.service';

interface TurnstileResponse {
  success: boolean;
  hostname?: string;
  action?: string;
  'error-codes'?: string[];
}

function isTurnstileResponse(value: unknown): value is TurnstileResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'success' in value &&
    typeof value.success === 'boolean'
  );
}

@Injectable()
export class TurnstileService {
  constructor(
    private readonly authPolicyService: AuthPolicyService,
    private readonly publicAccessService: PublicAccessService,
  ) {}

  async verifyIfEnabled(token: string | undefined, action: string, remoteIp?: string) {
    const config = await this.authPolicyService.getOrCreate();
    if (!config.turnstileEnabled) return config.version;
    if (!token) throw new BadRequestException('请先完成人机验证');
    await this.verify(this.requireSecret(config), token, action, remoteIp);
    return config.version;
  }

  async testConfiguration(token: string, remoteIp?: string): Promise<void> {
    const config = await this.authPolicyService.getOrCreate();
    if (!config.turnstileSiteKey) throw new BadRequestException('请先保存 Turnstile 站点密钥');
    await this.verify(this.requireSecret(config), token, 'admin-test', remoteIp);
    await this.authPolicyService.markTurnstileVerified(config.version);
  }

  private requireSecret(config: Awaited<ReturnType<AuthPolicyService['getOrCreate']>>): string {
    const secret = this.authPolicyService.readTurnstileSecret(config);
    if (!secret) throw new BadRequestException('Turnstile 密钥尚未配置');
    return secret;
  }

  private async verify(
    secret: string,
    token: string,
    action: string,
    remoteIp?: string,
  ): Promise<void> {
    const body = new URLSearchParams({ secret, response: token });
    if (remoteIp) body.set('remoteip', remoteIp);
    let response: Response;
    try {
      response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      throw new BadGatewayException('人机验证服务暂时不可用，请稍后重试');
    }
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok || !isTurnstileResponse(payload)) {
      throw new BadGatewayException('人机验证服务返回异常');
    }
    if (!payload.success || payload.action !== action) {
      throw new BadRequestException('人机验证未通过或已过期，请重新验证');
    }
    const { siteOrigin } = await this.publicAccessService.getPublicConfig();
    const expectedHostname = new URL(siteOrigin).hostname;
    if (payload.hostname !== expectedHostname) {
      throw new BadRequestException('人机验证来源与当前站点不一致，请刷新页面后重试');
    }
  }
}
