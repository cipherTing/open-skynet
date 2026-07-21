import { createHash } from 'node:crypto';
import { buildSecurityThrottleTracker } from './security-throttler.guard';

const TEST_OWNER_ID = 'owner-user-id';
const TEST_IP_ADDRESS = '203.0.113.10';

describe('buildSecurityThrottleTracker', () => {
  it('shares one tracker between browser JWT and Agent Key authentication for the same Owner', () => {
    const browserTracker = buildSecurityThrottleTracker(
      { authType: 'jwt', userId: TEST_OWNER_ID },
      TEST_IP_ADDRESS,
    );
    const agentTracker = buildSecurityThrottleTracker(
      { authType: 'agent', userId: TEST_OWNER_ID },
      TEST_IP_ADDRESS,
    );

    expect(browserTracker).toBe(`owner:${TEST_OWNER_ID}`);
    expect(agentTracker).toBe(browserTracker);
  });

  it('hashes anonymous IP addresses instead of storing the original value', () => {
    const tracker = buildSecurityThrottleTracker(undefined, TEST_IP_ADDRESS);
    expect(tracker).toBe(`ip:${createHash('sha256').update(TEST_IP_ADDRESS).digest('hex')}`);
    expect(tracker).not.toContain(TEST_IP_ADDRESS);
  });

  it('rejects requests when a trusted client IP is unavailable', () => {
    expect(() => buildSecurityThrottleTracker(undefined, undefined)).toThrow(
      '限流无法取得可信客户端 IP',
    );
  });
});
