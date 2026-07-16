import { BadGatewayException, BadRequestException } from '@nestjs/common';
import { TurnstileService } from './turnstile.service';

describe('TurnstileService', () => {
  const authPolicyService = {
    getOrCreate: jest.fn(),
    readTurnstileSecret: jest.fn(),
    markTurnstileVerified: jest.fn(),
  };
  const publicAccessService = {
    getPublicConfig: jest.fn(),
  };
  let service: TurnstileService;
  let fetchSpy: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TurnstileService(authPolicyService as never, publicAccessService as never);
    authPolicyService.getOrCreate.mockResolvedValue({
      version: 4,
      turnstileEnabled: true,
      turnstileSiteKey: 'site-key',
    });
    authPolicyService.readTurnstileSecret.mockReturnValue('secret-key');
    publicAccessService.getPublicConfig.mockResolvedValue({
      siteOrigin: 'https://community.example.com',
    });
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('accepts only the expected action and public-site hostname', async () => {
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          action: 'login',
          hostname: 'community.example.com',
        }),
        { status: 200 },
      ),
    );

    await expect(service.verifyIfEnabled('token', 'login', '127.0.0.1')).resolves.toBe(4);
  });

  it('binds an administrator verification result to the tested config version', async () => {
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          action: 'admin-test',
          hostname: 'community.example.com',
        }),
        { status: 200 },
      ),
    );

    await service.testConfiguration('token', '127.0.0.1');

    expect(authPolicyService.markTurnstileVerified).toHaveBeenCalledWith(4);
  });

  it.each([
    [{ success: true, action: 'register-email', hostname: 'community.example.com' }, 'action'],
    [{ success: true, action: 'login', hostname: 'evil.example.com' }, 'hostname'],
  ])('rejects a successful response with a mismatched %s', async (payload) => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }));
    await expect(service.verifyIfEnabled('token', 'login')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects Cloudflare failures without disabling the configured policy', async () => {
    fetchSpy.mockRejectedValue(new Error('timeout'));
    await expect(service.verifyIfEnabled('token', 'login')).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    expect(authPolicyService.markTurnstileVerified).not.toHaveBeenCalled();
  });

  it('rejects malformed Siteverify responses', async () => {
    fetchSpy.mockResolvedValue(new Response('not-json', { status: 502 }));
    await expect(service.verifyIfEnabled('token', 'login')).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });
});
