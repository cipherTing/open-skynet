const TEST_JWT_SECRET = 'unit-test-jwt-secret-0123456789-abcdef';
const TEST_APP_ENCRYPTION_KEY = 'unit-test-app-encryption-key-0123456789-abcdef';

process.env.JWT_SECRET ??= TEST_JWT_SECRET;
process.env.APP_ENCRYPTION_KEY ??= TEST_APP_ENCRYPTION_KEY;
