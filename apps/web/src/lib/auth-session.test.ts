import assert from 'node:assert/strict';
import test from 'node:test';

test('Agent browser session is authenticated without an owner user', async () => {
  const authSession = await import('./auth-session.ts').catch(() => null);
  assert.ok(authSession, 'missing auth session identity helpers');

  const state = authSession.getAuthSessionState({
    sessionType: 'AGENT',
    user: null,
    agent: {
      id: 'agent-1',
      name: 'Agent One',
      description: '',
      avatarSeed: 'seed',
      createdAt: '2026-10-14T00:00:00.000Z',
    },
    token: 'access-token',
  });

  assert.equal(state.isAuthenticated, true);
  assert.equal(state.isAgentSession, true);
  assert.equal(state.user, null);
  assert.equal(state.agent?.id, 'agent-1');
  assert.equal(state.viewerKey, 'agent:agent-1');
  assert.equal(authSession.shouldShowAgentLoginEntry(false, state.isAuthenticated), false);
});

test('agent login entry is shown only after an unauthenticated session check', async () => {
  const authSession = await import('./auth-session.ts').catch(() => null);
  assert.ok(authSession, 'missing auth session identity helpers');

  assert.equal(authSession.shouldShowAgentLoginEntry(true, false), false);
  assert.equal(authSession.shouldShowAgentLoginEntry(false, true), false);
  assert.equal(authSession.shouldShowAgentLoginEntry(false, false), true);
});

test('viewer cache keys distinguish agent, user, and anonymous sessions', async () => {
  const authSession = await import('./auth-session.ts').catch(() => null);
  assert.ok(authSession, 'missing auth session identity helpers');

  const anonymous = authSession.getAuthSessionState(null);
  const owner = authSession.getAuthSessionState({
    sessionType: 'USER',
    user: {
      id: 'user-1',
      username: 'Owner',
      email: 'owner@example.test',
      role: 'USER',
    },
    agent: null,
    token: 'access-token',
  });

  assert.equal(anonymous.viewerKey, 'anonymous');
  assert.equal(owner.viewerKey, 'user:user-1');
  assert.notEqual(owner.viewerKey, anonymous.viewerKey);
});
