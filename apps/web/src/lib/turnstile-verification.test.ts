import assert from 'node:assert/strict';
import test from 'node:test';
import {
  acceptTurnstileToken,
  consumeTurnstileVerification,
  getTurnstileToken,
  isTurnstileActionAllowed,
  resetTurnstileVerification,
} from './turnstile-verification.ts';

test('Turnstile token 被取走后立即变为不可用状态', () => {
  const verified = acceptTurnstileToken('turnstile-token');

  assert.equal(isTurnstileActionAllowed(verified), true);
  assert.equal(getTurnstileToken(verified), 'turnstile-token');

  const consumed = consumeTurnstileVerification();

  assert.equal(isTurnstileActionAllowed(consumed), false);
  assert.equal(getTurnstileToken(consumed), undefined);
});

test('受 Turnstile 保护的请求失败后必须重新验证', () => {
  const verified = acceptTurnstileToken('turnstile-token');
  const reset = resetTurnstileVerification();

  assert.equal(isTurnstileActionAllowed(verified), true);
  assert.equal(isTurnstileActionAllowed(reset), false);
});

async function loadEmailVerificationEligibility() {
  const verificationModule = await import('./turnstile-verification.ts');
  assert.ok('getEmailVerificationSendEligibility' in verificationModule);
  const candidate = verificationModule.getEmailVerificationSendEligibility;
  assert.equal(typeof candidate, 'function');
  return candidate;
}

test('合法邮箱只在所需的 Turnstile 已通过时允许发送验证码', async () => {
  const getEligibility = await loadEmailVerificationEligibility();

  assert.deepEqual(
    getEligibility({
      email: 'agent@example.com',
      turnstileEnabled: true,
      turnstileReady: true,
      cooldownUntil: null,
      now: 1_000,
      sending: false,
    }),
    { canSend: true, cooldownSeconds: 0 },
  );
  assert.deepEqual(
    getEligibility({
      email: 'not-an-email',
      turnstileEnabled: false,
      turnstileReady: false,
      cooldownUntil: null,
      now: 1_000,
      sending: false,
    }),
    { canSend: false, cooldownSeconds: 0 },
  );
  assert.deepEqual(
    getEligibility({
      email: 'agent@example.com',
      turnstileEnabled: true,
      turnstileReady: false,
      cooldownUntil: null,
      now: 1_000,
      sending: false,
    }),
    { canSend: false, cooldownSeconds: 0 },
  );
});

test('验证码发送成功后的六十秒内保持禁用并向上取整显示剩余秒数', async () => {
  const getEligibility = await loadEmailVerificationEligibility();

  assert.deepEqual(
    getEligibility({
      email: 'agent@example.com',
      turnstileEnabled: false,
      turnstileReady: false,
      cooldownUntil: 61_000,
      now: 1_001,
      sending: false,
    }),
    { canSend: false, cooldownSeconds: 60 },
  );
  assert.deepEqual(
    getEligibility({
      email: 'agent@example.com',
      turnstileEnabled: false,
      turnstileReady: false,
      cooldownUntil: 61_000,
      now: 61_000,
      sending: false,
    }),
    { canSend: true, cooldownSeconds: 0 },
  );
});

test('验证码发送成功时创建精确六十秒的冷却截止时间', async () => {
  const verificationModule = await import('./turnstile-verification.ts');
  assert.ok('createEmailVerificationCooldown' in verificationModule);
  const candidate = verificationModule.createEmailVerificationCooldown;
  assert.equal(typeof candidate, 'function');

  assert.equal(candidate(1_000), 61_000);
});

test('认证邮箱在发码和最终提交前使用同一规范化结果', async () => {
  const verificationModule = await import('./turnstile-verification.ts');
  assert.ok('normalizeAuthenticationEmail' in verificationModule);
  const candidate = verificationModule.normalizeAuthenticationEmail;
  assert.equal(typeof candidate, 'function');

  assert.equal(candidate(' Agent@Example.COM '), 'agent@example.com');
});
