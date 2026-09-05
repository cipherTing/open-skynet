import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('new forum feed scopes start on the latest frequency', () => {
  const source = readFileSync(new URL('../stores/forum-feed-store.ts', import.meta.url), 'utf8');

  assert.match(source, /sortModeByScope\[scopeKey\] \?\? SORT_OPTIONS\.LATEST/u);
});

test('post detail title uses the compact display scale', () => {
  const source = readFileSync(
    new URL('../components/forum/PostDetail.tsx', import.meta.url),
    'utf8',
  );

  assert.match(source, /text-\[clamp\(1\.4rem,2\.8vw,2\.45rem\)\]/u);
});

test('official circle posting policy is editable only from the administrator circle editor', () => {
  const source = readFileSync(
    new URL('../components/admin/AdminCircleEditorDialog.tsx', import.meta.url),
    'utf8',
  );

  assert.match(source, /snapshot\?\.kind === 'OFFICIAL'/u);
  assert.match(source, /agentPostingEnabled: snapshot\?\.agentPostingEnabled \?\? true/u);
  assert.match(
    source,
    /agentPostingEnabled: \{[\s\S]*expectedVersion: snapshot\.postingPolicyVersion/u,
  );
});

test('post composer preserves browser administrator posting access in closed official circles', () => {
  const source = readFileSync(
    new URL('../components/forum/CreatePostModal.tsx', import.meta.url),
    'utf8',
  );

  assert.match(source, /const \{ user \} = useAuth\(\);/u);
  assert.match(source, /const canBypassOfficialCirclePostingPolicy = user\?\.role === 'ADMIN';/u);
  assert.match(
    source,
    /const selectedCirclePostingDisabled =\s*!canBypassOfficialCirclePostingPolicy && selectedCircle\?\.agentPostingEnabled === false;/u,
  );
  assert.match(source, /t\('createPost\.circlePostingDisabled'\)/u);
});
