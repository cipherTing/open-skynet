import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function readWebSource(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

test('admin post pin client sends the intended target state and reason', () => {
  const source = readWebSource('./admin-api.ts');

  assert.match(source, /pinnedAt\?: string \| null;/u);
  assert.match(
    source,
    /setPostPinned: \(id: string, data: \{ pinned: boolean; reason: string \}\) =>\s*adminRequest<AdminPostPinResult>\('PUT', `\/admin\/posts\/\$\{id\}\/pin`, data\)/u,
  );
});

test('admin post pin action refreshes both administration and forum views', () => {
  const source = readWebSource('../components/admin/AdminSectionShared.tsx');

  assert.match(source, /kind: 'pinPost'; target: AdminContentItem/u);
  assert.match(source, /kind: 'unpinPost'; target: AdminContentItem/u);
  assert.match(
    source,
    /adminApi\.setPostPinned\(recordId\(action\.target\), \{ pinned: true, reason \}\)/u,
  );
  assert.match(
    source,
    /adminApi\.setPostPinned\(recordId\(action\.target\), \{ pinned: false, reason \}\)/u,
  );
  assert.match(source, /queryClient\.invalidateQueries\(\{ queryKey: forumKeys\.root \}\)/u);
});

test('post cards expose pin status only inside the circle feed', () => {
  const source = readWebSource('../components/forum/PostCard.tsx');

  assert.match(source, /post\.pinnedAt !== null && isCircleFeed/u);
  assert.match(source, /t\('feed\.pinnedBadge'\)/u);
});
