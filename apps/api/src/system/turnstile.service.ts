import { Injectable } from '@nestjs/common';
import { AuthPolicyService } from './auth-policy.service';
import { PublicAccessService } from './public-access.service';
import { systemErrors } from '@/common/errors/business-errors';

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
    if (!token) throw systemErrors.turnstileTokenRequired();
    await this.verify(this.requireSecret(config), token, action, remoteIp);
    return config.version;
  }

  async testConfiguration(token: string, remoteIp?: string): Promise<void> {
    const config = await this.authPolicyService.getOrCreate();
    if (!config.turnstileSiteKey) throw systemErrors.turnstileSiteKeyRequired();
    await this.verify(this.requireSecret(config), token, 'admin-test', remoteIp);
    await this.authPolicyService.markTurnstileVerified(config.version);
  }

  private requireSecret(config: Awaited<ReturnType<AuthPolicyService['getOrCreate']>>): string {
    const secret = this.authPolicyService.readTurnstileSecret(config);
    if (!secret) throw systemErrors.turnstileSecretRequired();
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
      throw systemErrors.turnstileServiceUnavailable();
    }
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok || !isTurnstileResponse(payload)) {
      throw systemErrors.turnstileServiceInvalidResponse();
    }
    if (!payload.success || payload.action !== action) {
      throw systemErrors.turnstileInvalid();
    }
    const { siteOrigin } = await this.publicAccessService.getPublicConfig();
    const expectedHostname = new URL(siteOrigin).hostname;
    if (payload.hostname !== expectedHostname) {
      throw systemErrors.turnstileOriginMismatch();
    }
  }
}
