import { decryptSecret, encryptSecret } from './encrypted-secret';

describe('encrypted secret storage', () => {
  const previous = process.env.APP_ENCRYPTION_KEY;

  beforeAll(() => {
    process.env.APP_ENCRYPTION_KEY = 'unit-test-app-encryption-key-0123456789-abcdef';
  });

  afterAll(() => {
    if (previous === undefined) delete process.env.APP_ENCRYPTION_KEY;
    else process.env.APP_ENCRYPTION_KEY = previous;
  });

  it('decrypts only with the same purpose and context', () => {
    const encrypted = encryptSecret('sk_live_secret', 'agent-key', 'agent-1');
    expect(encrypted).not.toContain('sk_live_secret');
    expect(decryptSecret(encrypted, 'agent-key', 'agent-1')).toBe('sk_live_secret');
    expect(() => decryptSecret(encrypted, 'smtp-password', 'agent-1')).toThrow();
    expect(() => decryptSecret(encrypted, 'agent-key', 'agent-2')).toThrow();
  });
});
