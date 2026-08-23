import { apiErrors } from '@/common/i18n/api-message';
import { normalizeMcpError } from './mcp.errors';

describe('MCP error normalization', () => {
  it('preserves the flattened retry delay from shared HTTP exceptions', () => {
    const error = apiErrors.tooManyRequests('RATE_LIMITED', 'api.errors.rateLimited', {
      details: { retryAfterSeconds: 7 },
    });

    expect(normalizeMcpError(error)).toMatchObject({
      code: 'RATE_LIMITED',
      details: { retryAfterSeconds: 7 },
    });
  });
});
