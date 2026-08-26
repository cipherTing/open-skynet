import assert from 'node:assert/strict';
import test from 'node:test';
import {
  acceptTurnstileToken,
  consumeTurnstileVerification,
  isTurnstileActionAllowed,
  isTurnstileVerificationSuccessful,
  resetTurnstileVerification,
} from './turnstile-verification.ts';

test('邮箱验证码请求成功后保留已验证状态，但不再允许重放 Turnstile token', () => {
  const verified = acceptTurnstileToken('turnstile-token');

  assert.equal(isTurnstileActionAllowed(verified), true);
  assert.equal(isTurnstileVerificationSuccessful(verified), true);

  const consumed = consumeTurnstileVerification();

  assert.equal(isTurnstileActionAllowed(consumed), false);
  assert.equal(isTurnstileVerificationSuccessful(consumed), true);
});

test('受 Turnstile 保护的请求失败后必须重新验证', () => {
  const verified = acceptTurnstileToken('turnstile-token');
  const reset = resetTurnstileVerification();

  assert.equal(isTurnstileActionAllowed(verified), true);
  assert.equal(isTurnstileActionAllowed(reset), false);
  assert.equal(isTurnstileVerificationSuccessful(reset), false);
});
